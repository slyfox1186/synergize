import { ModelService } from './modelService.js';
import { RedisService } from './redisService.js';
import { StreamingService } from './streamingService.js';
import { PromptFormatter } from './promptFormatter.js';
import { ConversationStateManager } from './conversationStateManager.js';
import { ConversationCurator } from './conversationCurator.js';
import { ContextAllocator, TokenAllocation } from './contextAllocator.js';
import { TokenCounter } from './tokenCounter.js';
import { FinalAnswerService } from './finalAnswerService.js';
import { DevilsAdvocateService } from './devilsAdvocateService.js';
import { QwenThinkingService } from './qwenThinkingService.js';
import { 
  CollaborationPhase, 
  SSEMessage, 
  SSEMessageType
} from '../models/types.js';
import { ConversationState, ConversationTurn } from '../models/conversationTypes.js';
import { ModelRole, AgreementAnalysis, ConsensusLevel } from '../models/curatedConversationTypes.js';
import { LlamaContext, LlamaChatSession, Token } from 'node-llama-cpp';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { CircularBuffer } from '../utils/CircularBuffer.js';
import { getErrorMessage } from '../utils/typeGuards.js';
import { 
  PHASE_INSTRUCTIONS, 
  VERIFICATION_REMINDER, 
  MODEL_DEFAULTS 
} from '../constants/index.js';

/**
 * WORLD-CLASS CONVERSATIONAL COLLABORATION ORCHESTRATOR
 * 
 * Implements state-of-the-art AI collaboration with:
 * - Gemma as dual-role participant AND curator
 * - Persistent conversation state with Redis
 * - Real-time context enhancement between turns
 * - Intelligent synthesis generation
 */
export class CollaborationOrchestrator {
  private conversationState: ConversationState | null = null;
  private cancelled = false;
  private streamingService: StreamingService;
  private conversationManager: ConversationStateManager;
  private curator: ConversationCurator;
  private contextAllocator: ContextAllocator;
  private tokenCounter: TokenCounter;
  private finalAnswerService: FinalAnswerService;
  private devilsAdvocateService: DevilsAdvocateService;
  private qwenThinkingService: QwenThinkingService;
  private logger = createLogger('CollaborationOrchestrator');
  private verificationAttempts = 0;
  private readonly MAX_VERIFICATION_ATTEMPTS = 2;
  
  // Gemma-Qwen collaboration configuration
  private readonly GEMMA_MODEL_ID = 'gemma-3-12b-it-q4-0';
  private readonly QWEN_MODEL_ID = 'qwen3-14b-ud-q4-k-xl';

  constructor(
    private modelService: ModelService,
    private redisService: RedisService,
    private sendMessage: (message: SSEMessage) => void
  ) {
    this.streamingService = new StreamingService(sendMessage);
    
    // Initialize token counting and context allocation
    this.tokenCounter = new TokenCounter();
    this.contextAllocator = new ContextAllocator(this.tokenCounter);
    
    // Initialize state-of-the-art conversation management with intelligent compression
    // Compression now happens asynchronously at phase transitions
    const enableCompression = process.env.ENABLE_CONVERSATION_COMPRESSION !== 'false'; // Enabled by default
    this.conversationManager = new ConversationStateManager(this.redisService, this.modelService, enableCompression);
    this.curator = new ConversationCurator(this.conversationManager, this.modelService);
    
    // Initialize final answer service
    this.finalAnswerService = new FinalAnswerService(modelService, this.streamingService, sendMessage);
    
    // Initialize devil's advocate service
    this.devilsAdvocateService = new DevilsAdvocateService(modelService, this.conversationManager, this.streamingService, sendMessage);
    
    // Initialize Qwen thinking service with optimal settings
    this.qwenThinkingService = new QwenThinkingService(modelService, this.streamingService, sendMessage);
    
    this.logger.info('🧮 CollaborationOrchestrator initialized with professional token management:');
    this.logger.info('   ✅ TokenCounter with tiktoken precision');
    this.logger.info('   ✅ ContextAllocator with Gemini\'s algorithm');
    this.logger.info('   ✅ Dynamic phase-based allocation');
    this.logger.info('   ✅ QwenThinkingService with optimal thinking mode settings');
  }

  /**
   * START WORLD-CLASS CONVERSATIONAL COLLABORATION
   * 
   * Flow: Gemma → Qwen → Gemma(curator) → Gemma(participant) → repeat
   */
  async startCollaboration(sessionId: string): Promise<void> {
    try {
      // Reset verification attempts for new collaboration
      this.verificationAttempts = 0;
      
      // Initialize conversation management systems
      await this.conversationManager.initialize();
      
      // Load session data
      const sessionData = await this.redisService.getSession(sessionId) as { prompt: string; models: string[] } | null;
      if (!sessionData) {
        throw new Error('Session not found');
      }

      // Create conversation state with Gemma and Qwen
      this.logger.info(`🚀 Starting collaboration for session ${sessionId}`);
      this.logger.info(`📝 Original query: "${sessionData.prompt}"`);
      this.logger.info(`🤝 Participants: ${this.GEMMA_MODEL_ID}, ${this.QWEN_MODEL_ID}`);
      this.logger.info(`⚙️ Context window: ${config.model.contextSize} tokens`);
      
      this.conversationState = await this.conversationManager.createConversation(
        sessionId,
        sessionData.prompt,
        [this.GEMMA_MODEL_ID, this.QWEN_MODEL_ID]
      );

      // Send model status
      const availableModels = await this.modelService.getAvailableModels();
      this.sendMessage({
        type: SSEMessageType.MODEL_STATUS,
        payload: { 
          models: availableModels.map(m => ({ id: m.id, name: m.name })),
          conversation: {
            participants: [this.GEMMA_MODEL_ID, this.QWEN_MODEL_ID],
            mode: 'curated_collaboration'
          }
        }
      });

      // Execute all collaboration phases with curated conversation
      await this.executeConversationalPhases();

      // Mark conversation as complete
      this.sendMessage({
        type: SSEMessageType.COLLABORATION_COMPLETE,
        payload: {
          sessionId,
          conversationTurns: this.conversationState.turns.length,
          finalOutput: await this.getFinalOutput()
        }
      });

    } catch (error) {
      this.logger.error('Conversational collaboration error:', error);
      this.sendMessage({
        type: SSEMessageType.ERROR,
        payload: { error: getErrorMessage(error) }
      });
    }
  }

  /**
   * EXECUTE CONVERSATIONAL PHASES WITH GEMMA CURATION
   * 
   * Revolutionary approach: Each phase is a living conversation where
   * Gemma curates context between every exchange
   */
  private async executeConversationalPhases(): Promise<void> {
    if (!this.conversationState) return;

    const phases = [
      CollaborationPhase.BRAINSTORM,
      CollaborationPhase.CRITIQUE, 
      CollaborationPhase.REVISE,
      CollaborationPhase.SYNTHESIZE,
      CollaborationPhase.CONSENSUS
    ];

    let currentPhaseIndex = 0;
    while (currentPhaseIndex < phases.length) {
      if (this.cancelled) return;
      
      const currentPhase = phases[currentPhaseIndex];
      this.logger.info(`🔍 PHASE LOOP: Executing phase ${currentPhaseIndex + 1}/${phases.length}: ${currentPhase}`, {
        sessionId: this.conversationState?.sessionId,
        phaseIndex: currentPhaseIndex,
        phase: currentPhase,
        totalTurns: this.conversationState?.turns.length || 0,
        currentPhaseState: this.conversationState?.currentPhase
      });
      
      // IMPORTANT: Ensure conversation state is set to the phase we're executing
      // This was the bug - we weren't updating the state before executing the phase
      if (this.conversationState && this.conversationState.currentPhase !== currentPhase) {
        const beforePhase = this.conversationState.currentPhase;
        this.logger.info(`🔄 Phase transition needed`, {
          sessionId: this.conversationState.sessionId,
          fromPhase: beforePhase,
          toPhase: currentPhase,
          turnsBeforeTransition: this.conversationState.turns.length,
          reason: 'phase_loop_progression'
        });
        
        await this.conversationManager.manualPhaseTransition(
          this.conversationState.sessionId,
          currentPhase
        );
        
        // Refresh state after transition
        this.conversationState = await this.conversationManager.getConversationState(this.conversationState.sessionId);
        
        this.logger.info(`✅ Phase transition complete`, {
          sessionId: this.conversationState?.sessionId,
          beforePhase,
          afterPhase: this.conversationState?.currentPhase,
          turnsAfterTransition: this.conversationState?.turns.length || 0
        });
      }
      
      await this.executeConversationalPhase(currentPhase);
      
      // Refresh conversation state to get latest turns
      if (this.conversationState) {
        this.conversationState = await this.conversationManager.getConversationState(this.conversationState.sessionId);
      }
      
      // Log token allocation efficiency for this phase
      if (this.conversationState) {
        const totalTurns = this.conversationState.turns.length;
        const phaseTurns = this.conversationState.turns.filter(t => t.phase === currentPhase);
        
        // Get last turn's context usage (most recent generation)
        let lastTurnUsage = 0;
        let lastTurnNumber = 0;
        if (totalTurns > 0) {
          const lastTurn = this.conversationState.turns[totalTurns - 1];
          lastTurnUsage = (lastTurn.metadata.contextUsed * 100);
          lastTurnNumber = lastTurn.turnNumber;
        }
        
        // Get peak context usage
        const peakUsage = this.conversationState.peakContextUsage;
        
        this.logger.info(`📈 Phase ${currentPhase} summary`, {
          sessionId: this.conversationState.sessionId,
          phase: currentPhase,
          phaseMetrics: {
            turnsInPhase: phaseTurns.length,
            totalTurns: totalTurns,
            lastTurnContextUsage: lastTurnUsage > 0 ? Math.round(lastTurnUsage) : 0,
            lastTurnNumber: lastTurnNumber,
            peakContextUsage: Math.round(peakUsage.percentage),
            peakTurnNumber: peakUsage.turnNumber
          },
          contextWarning: lastTurnUsage > 80 ? `High context usage: ${Math.round(lastTurnUsage)}%` : null
        });
      }
      
      // Refresh state to check for any phase transitions
      if (this.conversationState) {
        this.conversationState = await this.conversationManager.getConversationState(this.conversationState.sessionId);
      }
      
      // Check if phase transition happened during execution
      if (this.conversationState && this.conversationState.currentPhase !== currentPhase) {
        // Phase was changed during execution, update index
        const newIndex = phases.indexOf(this.conversationState.currentPhase);
        this.logger.info(`🔍 PHASE LOOP: Phase changed during execution from ${currentPhase} to ${this.conversationState.currentPhase} (index ${newIndex})`);
        
        // ULTRA-INTELLIGENT: Check if LLMs jumped directly to CONSENSUS
        if (this.conversationState.currentPhase === CollaborationPhase.CONSENSUS) {
          this.logger.info(`🚀 ULTRA-INTELLIGENT JUMP: LLMs reached CONSENSUS early! Skipping intermediate phases.`);
          // Execute CONSENSUS phase to finalize
          await this.executeConversationalPhase(CollaborationPhase.CONSENSUS);
          break; // Exit loop and go to synthesis
        }
        
        if (newIndex >= 0 && newIndex !== currentPhaseIndex) {
          // Allow LLMs to jump to ANY valid phase (forward OR backward)
          const direction = newIndex > currentPhaseIndex ? 'forward' : 'backward';
          this.logger.info(`🎯 PHASE JUMP: LLM decided to jump ${direction} from ${currentPhase} to ${this.conversationState.currentPhase}`);
          currentPhaseIndex = newIndex;
          continue;
        }
      }
      
      // ULTRA-INTELLIGENT: Also check if we're already at CONSENSUS
      if (currentPhase === CollaborationPhase.CONSENSUS) {
        this.logger.info(`🏁 CONSENSUS reached - ready for final synthesis!`);
        break; // Exit loop and generate synthesis
      }
      
      this.logger.info(`✅ PHASE LOOP: Completed phase ${currentPhase}, moving to next (index ${currentPhaseIndex + 1})`);
      currentPhaseIndex++;
    }
    
    this.logger.info(`🏁 PHASE LOOP: Collaboration complete, generating final synthesis`);
    
    // Final refresh of conversation state before synthesis
    if (this.conversationState) {
      this.conversationState = await this.conversationManager.getConversationState(this.conversationState.sessionId);
      this.logger.info(`🔍 FINAL STATE: Current phase is ${this.conversationState?.currentPhase}, turns: ${this.conversationState?.turns.length}`);
    }
    
    await this.generateFinalSynthesis();
  }

  /**
   * SINGLE PHASE WITH SIMPLIFIED CONVERSATION FLOW
   * 
   * Flow: Gemma(initial) → Qwen(response) → Gemma(summary/curation)
   */
  private async executeConversationalPhase(phase: CollaborationPhase): Promise<void> {
    if (!this.conversationState) return;

    // Ensure we're working with the correct phase - refresh state
    this.conversationState = await this.conversationManager.getConversationState(this.conversationState.sessionId);
    
    // Verify phase consistency
    if (this.conversationState && this.conversationState.currentPhase !== phase) {
      this.logger.warn(`⚠️ Phase mismatch detected: executing ${phase} but state is ${this.conversationState.currentPhase}`);
      // Force update to correct phase
      await this.conversationManager.manualPhaseTransition(
        this.conversationState.sessionId,
        phase
      );
      this.conversationState = await this.conversationManager.getConversationState(this.conversationState.sessionId);
    }

    this.sendMessage({
      type: SSEMessageType.PHASE_UPDATE,
      payload: { phase, status: 'started' }
    });

    // Step 1: Gemma starts the conversation
    const gemmaInitialTurn = await this.executeModelTurn(
      this.GEMMA_MODEL_ID, 
      ModelRole.PARTICIPANT,
      phase
    );

    // Step 2: Qwen responds to Gemma
    const qwenResponseTurn = await this.executeModelTurn(
      this.QWEN_MODEL_ID,
      ModelRole.PARTICIPANT, 
      phase,
      gemmaInitialTurn.id
    );

    // Step 3: Gemma provides summary/curation AND makes intelligent phase decision
    const curationResult = await this.curator.curateTurn(
      this.conversationState?.sessionId || '',
      qwenResponseTurn.id,
      this.GEMMA_MODEL_ID,
      this.curator.getPhaseCurationFocus(phase)
    );

    // Send curation analysis to frontend
    this.sendMessage({
      type: SSEMessageType.SYNTHESIS_UPDATE,
      payload: { 
        curation: curationResult,
        phase,
        curatedTurn: qwenResponseTurn.id
      }
    });

    // INTELLIGENT PHASE DECISION: Let Gemma decide the flow
    if (this.conversationState) {
      this.logger.info(`🔍 PHASE DEBUG: Current phase is ${phase}, conversation state phase is ${this.conversationState.currentPhase}`);
      
      // Don't make phase decisions if already in final CONSENSUS phase
      if (phase === CollaborationPhase.CONSENSUS) {
        this.logger.info(`🏁 In CONSENSUS phase - ready for synthesis`);
        return;
      }
      
      // Log phase decision context for ULTRA-INTELLIGENT jumping
      this.logger.info(`🧠 ULTRA-INTELLIGENT PHASE DECISION POINT`, {
        currentPhase: phase,
        availablePhases: Object.values(CollaborationPhase),
        canJumpTo: 'ANY phase including CONSENSUS if models agree 100%',
        turnsSoFar: this.conversationState.turns.length
      });

      // Use dedicated DevilsAdvocateService for critical analysis and phase decisions
      this.logger.info(`👹 Performing devil's advocate analysis for ${phase}`);
      const criticalAnalysis = await this.devilsAdvocateService.performCriticalAnalysis({
        sessionId: this.conversationState.sessionId,
        currentPhase: phase,
        responseToAnalyze: qwenResponseTurn.content,
        analyzerModelId: this.GEMMA_MODEL_ID
      });

      const phaseDecision = criticalAnalysis.phaseDecision;
      
      this.logger.info(`🧠 Devil's advocate decision: ${phaseDecision.reasoning}`);
      this.logger.info(`🔍 ANALYSIS RESULT: hasErrors=${criticalAnalysis.hasErrors}, severity=${criticalAnalysis.severity}, shouldTransition=${phaseDecision.shouldTransition}`);

      // Handle critical errors by forcing CRITIQUE phase
      if (criticalAnalysis.hasErrors && criticalAnalysis.severity === 'CRITICAL') {
        this.logger.warn(`⚠️ Critical errors detected - forcing CRITIQUE phase`);
        await this.devilsAdvocateService.forceCritiquePhase(
          this.conversationState.sessionId,
          phase,
          phaseDecision.criticalIssuesFound
        );
        
        await this.conversationManager.manualPhaseTransition(
          this.conversationState.sessionId, 
          CollaborationPhase.CRITIQUE
        );
        this.conversationState = await this.conversationManager.getConversationState(this.conversationState.sessionId);
        return; // Exit early due to forced critique
      }

      // Handle normal phase transitions
      if (phaseDecision.shouldTransition && phaseDecision.targetPhase) {
        this.logger.info(`🔄 Executing devil's advocate transition from ${phase} to ${phaseDecision.targetPhase}`);
        
        await this.devilsAdvocateService.notifyPhaseTransition(
          this.conversationState.sessionId,
          phase,
          phaseDecision.targetPhase,
          phaseDecision.reasoning
        );
        
        await this.conversationManager.manualPhaseTransition(
          this.conversationState.sessionId, 
          phaseDecision.targetPhase
        );
        this.conversationState = await this.conversationManager.getConversationState(this.conversationState.sessionId);
        
        this.logger.info(`✅ Phase transition complete. New phase: ${this.conversationState?.currentPhase}`);
        return; // Exit early due to intelligent phase transition
      } else {
        this.logger.info(`➡️ Continuing with current phase ${phase} (no transition - ${phaseDecision.reasoning})`);
      }
    }

    this.sendMessage({
      type: SSEMessageType.PHASE_UPDATE,
      payload: { phase, status: 'completed' }
    });
  }

  /**
   * EXECUTE A SINGLE MODEL TURN WITH FULL CONVERSATION CONTEXT
   * 
   * This is where the magic happens - each model gets the full curated context
   */
  private async executeModelTurn(
    modelId: string,
    role: ModelRole,
    phase: CollaborationPhase,
    responseToTurnId?: string,
    curationResult?: { curationNotes: string; extractedInsights: string[] }
  ): Promise<ConversationTurn> {
    if (!this.conversationState) throw new Error('No conversation state');

    const startTime = Date.now();

    // Build conversation prompt with full context
    const conversationPrompt = await this.conversationManager.buildConversationPrompt(
      this.conversationState.sessionId,
      modelId
    );
    
    // Log the token allocation being used
    const allocation = conversationPrompt.metadata.tokenAllocation;
    this.logger.info(`📋 Token allocation decision`, {
      sessionId: this.conversationState.sessionId,
      modelId,
      phase,
      allocation: {
        maxGenerationTokens: allocation.maxGenerationTokens,
        historyTokenBudget: allocation.historyTokenBudget,
        totalAllocated: allocation.totalAllocated,
        contextSize: config.model.contextSize,
        utilizationPercent: Math.round((allocation.totalAllocated / config.model.contextSize) * 100)
      },
      reasoning: `Phase ${phase} requires ${allocation.maxGenerationTokens} tokens for detailed response`
    });

    // Enhance prompt with curation if available
    let enhancedPrompt = conversationPrompt.currentTurn;
    if (curationResult && role === ModelRole.PARTICIPANT) {
      enhancedPrompt = `${conversationPrompt.currentTurn}\n\n## Enhanced Context from Curation:\n${curationResult.curationNotes}\n\n## Key Insights to Consider:\n${curationResult.extractedInsights.join('\n')}\n\nRespond with this enhanced understanding:`;
    }
    
    // Now calculate prompt tokens after we have the enhanced prompt
    const promptTokenCount = this.tokenCounter.countTokens(enhancedPrompt);
    
    this.logger.info(`🎯 Starting model turn`, {
      sessionId: this.conversationState.sessionId,
      modelId,
      role,
      phase,
      promptTokens: promptTokenCount,
      responseToTurnId,
      hasCurationEnhancement: curationResult !== undefined
    });

    // Generate response using the model
    const context = await this.modelService.acquireContext(modelId);
    try {
      this.logger.info(`🎯 Generating with ${modelId} for phase ${phase}`);
      const response = await this.generateWithModel(
        modelId,
        context,
        enhancedPrompt,
        phase,
        conversationPrompt.conversationContext,
        conversationPrompt.metadata.tokenAllocation
      );

      const duration = Date.now() - startTime;
      const responseTokens = this.tokenCounter.countTokens(response);
      
      this.logger.info(`📝 Model turn completed`, {
        sessionId: this.conversationState.sessionId,
        modelId,
        phase,
        responseMetrics: {
          responseLength: response.length,
          responseTokens,
          promptTokens: promptTokenCount,
          totalTokens: promptTokenCount + responseTokens,
          durationMs: duration,
          tokensPerSecond: Math.round((responseTokens / duration) * 1000)
        },
        quality: {
          isShort: response.length < 50,
          isPotentiallyIncomplete: response.endsWith('...') || response.length === 0,
          shortResponseContent: response.length < 50 ? response : undefined
        }
      });

      // Store the turn in conversation state
      const turn = await this.conversationManager.addTurn(
        this.conversationState.sessionId,
        modelId,
        response,
        Date.now() - startTime,
        responseToTurnId
      );

      return turn;

    } finally {
      this.modelService.releaseContext(modelId, context);
    }
  }

  /**
   * PERFORM QWEN FINAL VERIFICATION BEFORE SYNTHESIS
   * Uses QwenThinkingService with optimal settings for thinking mode
   */
  private async performQwenFinalVerification(): Promise<{ hasErrors: boolean; errorDetails?: string }> {
    if (!this.conversationState) return { hasErrors: false };
    
    this.logger.info('🔍 Running Qwen3 final verification with optimized thinking mode settings');
    
    // Send status update to inform user about verification
    this.sendMessage({
      type: SSEMessageType.PHASE_UPDATE,
      payload: { 
        phase: CollaborationPhase.CONSENSUS, 
        status: 'verification_started',
        message: '🔍 Running final verification with Qwen3 (thinking mode enabled with optimal settings)...\nSettings: Temperature 0.6, TopP 0.95, TopK 20\nThis may take a moment as the model thoroughly checks for errors.'
      }
    });
    
    try {
      // Get conversation context for verification
      const conversationPrompt = await this.conversationManager.buildConversationPrompt(
        this.conversationState.sessionId,
        this.QWEN_MODEL_ID,
        ''
      );
      const conversationContext = conversationPrompt.conversationContext;
      
      // Get the latest synthesis content
      const synthesisContent = await this.getSynthesisContent();
      
      // Use QwenThinkingService for verification with optimal settings
      const verificationResult = await this.qwenThinkingService.performFinalVerification(
        this.conversationState.sessionId,
        synthesisContent,
        conversationContext
      );
      
      this.logger.info('🧠 Qwen thinking mode completed', {
        success: verificationResult.success,
        hadThinkingContent: verificationResult.hadThinkingContent,
        thinkingTokens: verificationResult.thinkingTokens,
        outputTokens: verificationResult.outputTokens,
        tokensPerSecond: verificationResult.tokenMetrics.tokensPerSecond
      });
      
      if (!verificationResult.success) {
        throw new Error('Verification execution failed');
      }
      
      // Store the verification turn with isVerification flag
      await this.conversationManager.addTurn(
        this.conversationState.sessionId,
        this.QWEN_MODEL_ID,
        verificationResult.content,
        verificationResult.tokenMetrics.generationTimeMs,
        undefined,
        true // Mark as verification turn
      );
      
      // Check if verification found errors
      const hasErrors = this.qwenThinkingService.isVerificationFailure(verificationResult.content);
      const errorDetails = hasErrors 
        ? this.qwenThinkingService.extractErrorDetails(verificationResult.content)
        : undefined;
      
      if (hasErrors) {
        this.logger.warn('⚠️ Qwen3 detected errors', { errorDetails });
        // Send status update about errors found
        this.sendMessage({
          type: SSEMessageType.PHASE_UPDATE,
          payload: { 
            phase: CollaborationPhase.CONSENSUS, 
            status: 'verification_errors_found',
            message: `⚠️ Verification found errors that need correction:\n${errorDetails?.errors.map(e => `${e.severity}: ${e.description}`).join('\n')}`
          }
        });
      } else {
        this.logger.info('✅ Qwen3 verification passed - no errors found');
        // Send status update about successful verification
        this.sendMessage({
          type: SSEMessageType.PHASE_UPDATE,
          payload: { 
            phase: CollaborationPhase.CONSENSUS, 
            status: 'verification_passed',
            message: '✅ Verification complete - no errors found. Proceeding with final synthesis...'
          }
        });
      }
      
      return { 
        hasErrors, 
        errorDetails: errorDetails?.errors.map(e => `${e.severity}: ${e.description}`).join('\n')
      };
      
    } catch (error) {
      this.logger.error('Qwen verification failed:', error);
      // Send status update about verification failure
      this.sendMessage({
        type: SSEMessageType.PHASE_UPDATE,
        payload: { 
          phase: CollaborationPhase.CONSENSUS, 
          status: 'verification_failed',
          message: '⚠️ Verification step encountered an error. Proceeding with synthesis...'
        }
      });
      // If verification fails, assume no errors to continue
      return { hasErrors: false };
    }
  }
  
  /**
   * GET SYNTHESIS CONTENT
   * Helper method to retrieve the latest synthesis content for verification
   */
  private async getSynthesisContent(): Promise<string> {
    if (!this.conversationState) return '';
    
    // Get the conversation state which includes all turns
    const state = await this.conversationManager.getConversationState(this.conversationState.sessionId);
    if (!state) return '';
    
    // Find the most recent synthesis/consensus phase content
    for (let i = state.turns.length - 1; i >= 0; i--) {
      const turn = state.turns[i];
      if (turn.phase === CollaborationPhase.SYNTHESIZE || 
          turn.phase === CollaborationPhase.CONSENSUS) {
        return turn.content;
      }
    }
    
    // If no synthesis found, get structured solutions as fallback
    const solutions = await this.conversationManager.getStructuredSolutions(this.conversationState.sessionId);
    const solutionTexts: string[] = [];
    
    solutions.forEach((solution, modelId) => {
      if (solution.value) {
        solutionTexts.push(`${modelId}: ${solution.value}`);
      }
    });
    
    return solutionTexts.join('\n\n');
  }

  /**
   * HANDLE VERIFICATION ERRORS
   */
  private async handleVerificationErrors(errorDetails: string): Promise<void> {
    if (!this.conversationState) return;
    
    // Check if we've exceeded max verification attempts
    this.verificationAttempts++;
    if (this.verificationAttempts >= this.MAX_VERIFICATION_ATTEMPTS) {
      this.logger.warn(`⚠️ Exceeded max verification attempts (${this.MAX_VERIFICATION_ATTEMPTS}). Proceeding with caution notice.`);
      await this.generateSynthesisWithErrors(errorDetails);
      return;
    }
    
    this.logger.info(`🔧 Handling verification errors detected by Qwen3 (attempt ${this.verificationAttempts}/${this.MAX_VERIFICATION_ATTEMPTS})`);
    
    // Update phase back to REVISE to fix the errors
    await this.conversationManager.manualPhaseTransition(
      this.conversationState.sessionId,
      CollaborationPhase.REVISE
    );
    
    // Create error correction prompt for Gemma
    const errorCorrectionPrompt = `CRITICAL ERROR DETECTED IN PREVIOUS SOLUTION!

Qwen3's verification found the following errors:
${errorDetails}

**Original Problem:**
${this.conversationState.originalQuery}

**YOUR TASK:**
1. Carefully review the error details above
2. Identify what went wrong in the previous solution
3. Provide a CORRECTED solution that addresses these errors
4. Show your work step-by-step
5. Verify your new answer is correct

This is a critical correction - ensure accuracy!`;
    
    // Have Gemma provide a corrected solution
    const context = await this.modelService.acquireContext(this.GEMMA_MODEL_ID);
    try {
      const correctedResponse = await this.generateWithModel(
        this.GEMMA_MODEL_ID,
        context,
        errorCorrectionPrompt,
        CollaborationPhase.REVISE
      );
      
      // Store the correction turn
      await this.conversationManager.addTurn(
        this.conversationState.sessionId,
        this.GEMMA_MODEL_ID,
        correctedResponse,
        Date.now(),
        undefined
      );
      
      // The revision is complete. Re-attempt the final synthesis, which will trigger verification again.
      this.logger.info('♻️ Revision complete, re-attempting final synthesis.');
      await this.generateFinalSynthesis();
      
    } finally {
      this.modelService.releaseContext(this.GEMMA_MODEL_ID, context);
    }
  }

  /**
   * GENERATE FINAL SYNTHESIS WITH QWEN VERIFICATION
   */
  private async generateFinalSynthesis(): Promise<void> {
    if (!this.conversationState) return;

    try {
      this.logger.info(`🔍 SYNTHESIS DEBUG: Starting synthesis with ${this.conversationState.turns.length} total turns`);
      
      // NEW: First run Qwen3 final verification before Gemma's synthesis
      const verificationResult = await this.performQwenFinalVerification();
      
      // If errors were detected, handle them
      if (verificationResult.hasErrors) {
        this.logger.warn('❌ Qwen3 verification detected errors - initiating error correction flow');
        
        // Check if we've already exceeded max attempts
        if (this.verificationAttempts >= this.MAX_VERIFICATION_ATTEMPTS) {
          this.logger.warn('⚠️ Already at max verification attempts, generating synthesis with errors');
          await this.generateSynthesisWithErrors(verificationResult.errorDetails || 'Unspecified errors detected');
          return;
        }
        
        await this.handleVerificationErrors(verificationResult.errorDetails || 'Unspecified errors detected');
        return; // Don't proceed with synthesis
      }
      
      // Log all turns for debugging
      this.conversationState.turns.forEach((turn, index) => {
        this.logger.info(`🔍 Turn ${index + 1}: ${turn.modelId} in ${turn.phase} - "${turn.content.substring(0, 100)}..."`);
      });

      // Check if we have enough responses for synthesis
      const gemmaResponses = this.conversationState.turns.filter(t => t.modelId === this.GEMMA_MODEL_ID);
      const qwenResponses = this.conversationState.turns.filter(t => t.modelId === this.QWEN_MODEL_ID);
      
      this.logger.info(`🔍 SYNTHESIS DEBUG: Found ${gemmaResponses.length} Gemma responses, ${qwenResponses.length} Qwen responses`);
      this.logger.info(`🔍 SYNTHESIS DEBUG: Looking for Gemma ID: "${this.GEMMA_MODEL_ID}"`);
      this.logger.info(`🔍 SYNTHESIS DEBUG: Looking for Qwen ID: "${this.QWEN_MODEL_ID}"`);
      
      // Log actual model IDs found
      const uniqueModelIds = [...new Set(this.conversationState.turns.map(t => t.modelId))];
      this.logger.info(`🔍 SYNTHESIS DEBUG: Actual model IDs in turns: ${uniqueModelIds.join(', ')}`);
      
      if (gemmaResponses.length === 0 || qwenResponses.length === 0) {
        this.logger.error(`❌ SYNTHESIS FAILED: Insufficient responses for synthesis (Gemma: ${gemmaResponses.length}, Qwen: ${qwenResponses.length})`);
        // Generate a simple summary instead
        await this.generateSimpleSummary();
        return;
      }

      // Use Gemma to create the final synthesis with timeout protection
      let synthesisInstruction: string;
      let analysis: AgreementAnalysis;
      
      try {
        // Add timeout protection to prevent hanging on context extraction
        const synthesisPromise = this.conversationManager.generateSynthesis(
          this.conversationState.sessionId,
          this.GEMMA_MODEL_ID
        );
        
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Synthesis generation timeout')), 15000); // 15 second timeout
        });
        
        const result = await Promise.race([synthesisPromise, timeoutPromise]);
        synthesisInstruction = result.synthesis;
        analysis = result.analysis;
        
      } catch (timeoutError) {
        this.logger.warn('⚠️ Synthesis generation timed out, creating intelligent fallback');
        
        // ULTRA-INTELLIGENT FALLBACK: Analyze the actual conversation content
        const gemmaFinalTurns = this.conversationState.turns
          .filter(t => t.modelId === this.GEMMA_MODEL_ID)
          .slice(-3); // Last 3 Gemma turns
        
        const qwenFinalTurns = this.conversationState.turns
          .filter(t => t.modelId === this.QWEN_MODEL_ID)
          .slice(-3); // Last 3 Qwen turns
        
        // Extract actual answers from the conversation
        const answerPattern = /answer\s*(?:is|=|:)\s*([0-9.,\s\w]+)|result\s*(?:is|=|:)\s*([0-9.,\s\w]+)|therefore\s*(?:.*?)\s*([0-9.,\s\w]+)|final\s*(?:answer|value|result)\s*(?:is|=|:)?\s*([0-9.,\s\w]+)/gi;
        const methodPattern = /using\s+([\w\s]+(?:method|approach|formula|technique))|applied\s+([\w\s]+(?:method|approach|formula|technique))|through\s+([\w\s]+(?:method|approach|formula|technique))/gi;
        const confidencePattern = /confident|certain|sure|verified|correct|accurate|precise/gi;
        
        // Analyze Gemma's responses
        const gemmaAnswers: string[] = [];
        const gemmaMethods: string[] = [];
        let gemmaConfidenceScore = 0;
        
        for (const turn of gemmaFinalTurns) {
          const answerMatches = [...turn.content.matchAll(answerPattern)];
          answerMatches.forEach(match => {
            const answer = (match[1] || match[2] || match[3] || match[4] || '').trim();
            if (answer && !gemmaAnswers.includes(answer)) {
              gemmaAnswers.push(answer);
            }
          });
          
          const methodMatches = [...turn.content.matchAll(methodPattern)];
          methodMatches.forEach(match => {
            const method = (match[1] || match[2] || match[3] || '').trim();
            if (method && !gemmaMethods.includes(method)) {
              gemmaMethods.push(method);
            }
          });
          
          const confidenceMatches = turn.content.match(confidencePattern);
          if (confidenceMatches) {
            gemmaConfidenceScore += confidenceMatches.length;
          }
        }
        
        // Analyze Qwen's responses
        const qwenAnswers: string[] = [];
        const qwenMethods: string[] = [];
        let qwenConfidenceScore = 0;
        
        for (const turn of qwenFinalTurns) {
          const answerMatches = [...turn.content.matchAll(answerPattern)];
          answerMatches.forEach(match => {
            const answer = (match[1] || match[2] || match[3] || match[4] || '').trim();
            if (answer && !qwenAnswers.includes(answer)) {
              qwenAnswers.push(answer);
            }
          });
          
          const methodMatches = [...turn.content.matchAll(methodPattern)];
          methodMatches.forEach(match => {
            const method = (match[1] || match[2] || match[3] || '').trim();
            if (method && !qwenMethods.includes(method)) {
              qwenMethods.push(method);
            }
          });
          
          const confidenceMatches = turn.content.match(confidencePattern);
          if (confidenceMatches) {
            qwenConfidenceScore += confidenceMatches.length;
          }
        }
        
        // Calculate actual consensus
        const sharedAnswers = gemmaAnswers.filter(a => qwenAnswers.includes(a));
        const sharedMethods = gemmaMethods.filter(m => qwenMethods.includes(m));
        const answerSimilarity = sharedAnswers.length > 0 ? sharedAnswers.length / Math.max(gemmaAnswers.length, qwenAnswers.length) : 0;
        const methodSimilarity = sharedMethods.length > 0 ? sharedMethods.length / Math.max(gemmaMethods.length, qwenMethods.length) : 0;
        
        // Calculate confidence based on both models' confidence indicators
        const totalConfidenceIndicators = gemmaConfidenceScore + qwenConfidenceScore;
        const maxPossibleConfidence = (gemmaFinalTurns.length + qwenFinalTurns.length) * 5; // Assume max 5 confidence words per turn
        const confidenceRatio = totalConfidenceIndicators > 0 ? Math.min(totalConfidenceIndicators / maxPossibleConfidence, 1) : 0.5;
        
        // Weighted calculation including confidence
        const overallSimilarity = (answerSimilarity * 0.5 + methodSimilarity * 0.3 + confidenceRatio * 0.2);
        
        // Determine consensus level based on actual analysis
        let consensusLevel: ConsensusLevel;
        if (overallSimilarity > 0.8 && sharedAnswers.length > 0) {
          consensusLevel = ConsensusLevel.HIGH_CONSENSUS;
        } else if (overallSimilarity > 0.5) {
          consensusLevel = ConsensusLevel.MIXED_VIEWS;
        } else if (gemmaAnswers.length > 0 && qwenAnswers.length > 0) {
          consensusLevel = ConsensusLevel.CREATIVE_TENSION;
        } else {
          consensusLevel = ConsensusLevel.NO_CONSENSUS;
        }
        
        // Extract key insights from actual content
        const agreements: string[] = [];
        if (sharedAnswers.length > 0) {
          agreements.push(`Both models arrived at: ${sharedAnswers.join(', ')}`);
        }
        if (sharedMethods.length > 0) {
          agreements.push(`Shared approach: ${sharedMethods.join(', ')}`);
        }
        
        const conflicts: string[] = [];
        const uniqueGemmaAnswers = gemmaAnswers.filter(a => !qwenAnswers.includes(a));
        const uniqueQwenAnswers = qwenAnswers.filter(a => !gemmaAnswers.includes(a));
        
        if (uniqueGemmaAnswers.length > 0 && uniqueQwenAnswers.length > 0) {
          conflicts.push(`${this.GEMMA_MODEL_ID} proposed ${uniqueGemmaAnswers.join(', ')} while ${this.QWEN_MODEL_ID} proposed ${uniqueQwenAnswers.join(', ')}`);
        }
        
        // Build intelligent synthesis instruction with actual content
        const latestGemmaContent = gemmaFinalTurns[gemmaFinalTurns.length - 1]?.content || '';
        const latestQwenContent = qwenFinalTurns[qwenFinalTurns.length - 1]?.content || '';
        
        synthesisInstruction = `Generate a comprehensive synthesis for: "${this.conversationState.originalQuery}"

## Key Findings from Collaboration:

### ${this.GEMMA_MODEL_ID} Final Analysis:
${this.tokenCounter.truncateToTokenLimit(latestGemmaContent, 300)}

### ${this.QWEN_MODEL_ID} Final Analysis:
${this.tokenCounter.truncateToTokenLimit(latestQwenContent, 300)}

## Extracted Results:
- **Gemma answers:** ${gemmaAnswers.length > 0 ? gemmaAnswers.join(', ') : 'No explicit answers found'}
- **Qwen answers:** ${qwenAnswers.length > 0 ? qwenAnswers.join(', ') : 'No explicit answers found'}
- **Consensus:** ${sharedAnswers.length > 0 ? sharedAnswers.join(', ') : 'No shared answers found'}
- **Methods used:** ${[...new Set([...gemmaMethods, ...qwenMethods])].join(', ') || 'Various approaches'}

## Your Synthesis Task:
1. Provide the definitive answer based on the collaboration
2. Explain the reasoning path that led to this answer
3. Address any discrepancies between the models
4. State confidence level based on agreement: ${Math.round(overallSimilarity * 100)}%
5. Include any important caveats or considerations

Make the synthesis authoritative and actionable.`;
        
        // Create intelligent analysis based on actual content
        analysis = {
          sessionId: this.conversationState.sessionId,
          phase: CollaborationPhase.CONSENSUS,
          consensusLevel,
          overallSimilarity,
          modelA: this.GEMMA_MODEL_ID,
          modelB: this.QWEN_MODEL_ID,
          confidenceScore: confidenceRatio,
          keyPoints: {
            agreements: agreements.length > 0 ? agreements : ['Both models engaged with the problem'],
            conflicts: conflicts.length > 0 ? conflicts : [],
            complementaryIdeas: [
              ...uniqueGemmaAnswers.map(a => `${this.GEMMA_MODEL_ID}: ${a}`),
              ...uniqueQwenAnswers.map(a => `${this.QWEN_MODEL_ID}: ${a}`)
            ],
            novelInsights: [
              ...(gemmaConfidenceScore > qwenConfidenceScore ? 
                [`${this.GEMMA_MODEL_ID} showed higher confidence (${gemmaConfidenceScore} indicators)`] : 
                [`${this.QWEN_MODEL_ID} showed higher confidence (${qwenConfidenceScore} indicators)`]),
              ...(sharedMethods.length > 0 ? [`Converged on methodology: ${sharedMethods.join(', ')}`] : [])
            ]
          }
        } as AgreementAnalysis;
        
        this.logger.info('🧠 Intelligent fallback created', {
          gemmaAnswers: gemmaAnswers.length,
          qwenAnswers: qwenAnswers.length,
          sharedAnswers: sharedAnswers.length,
          overallSimilarity: Math.round(overallSimilarity * 100) + '%',
          consensusLevel
        });
      }

      // The synthesis instruction already contains the properly formatted prompt
      // with intelligent context selection done by conversationManager.generateSynthesis
      // We just need to ensure we don't exceed token limits when generating
      
      // Calculate token allocation for SYNTHESIZE phase
      const totalContextSize = config.model.contextSize || 4096;
      const promptTokens = this.tokenCounter.countTokens(synthesisInstruction);
      
      // Create a minimal allocation focused on generation space
      const allocation = this.contextAllocator.calculateAllocation(
        CollaborationPhase.SYNTHESIZE,
        totalContextSize,
        '', // Empty history as prompt already contains what's needed
        this.GEMMA_MODEL_ID,
        'synthesis',
        this.conversationState.turns.length
      );

      this.logger.info(`🎯 Synthesis prompt: ${promptTokens} tokens, generation space: ${allocation.maxGenerationTokens} tokens`);

      // Use the dedicated FinalAnswerService for reliable synthesis generation
      const synthesisResult = await this.finalAnswerService.generateFinalAnswer({
        sessionId: this.conversationState.sessionId,
        modelId: this.GEMMA_MODEL_ID,
        prompt: synthesisInstruction,
        phase: CollaborationPhase.SYNTHESIZE,
        tokenAllocation: allocation,
        routeToSynthesis: true
      });

      if (synthesisResult.success) {
        this.logger.info('✅ Synthesis generated successfully', {
          contentLength: synthesisResult.content.length,
          tokenMetrics: synthesisResult.tokenMetrics
        });
        
        // Send the complete synthesis update for the panel header
        this.sendMessage({
          type: SSEMessageType.PHASE_UPDATE,
          payload: { 
            phase: CollaborationPhase.CONSENSUS, 
            status: 'synthesis_complete',
            synthesisAnalysis: analysis
          }
        });
      } else {
        this.logger.error('❌ Synthesis generation failed, attempting fallback');
        
        // Attempt fallback generation
        await this.finalAnswerService.generateFallbackAnswer({
          sessionId: this.conversationState.sessionId,
          modelId: this.GEMMA_MODEL_ID,
          prompt: synthesisInstruction,
          phase: CollaborationPhase.SYNTHESIZE,
          routeToSynthesis: true
        });
      }
      
    } catch (error) {
      this.logger.error('Synthesis generation failed:', error);
      // Check if it's a memory/context issue
      if (error instanceof Error && 
          (error.message.includes('KV slot') || 
           error.message.includes('context') || 
           error.message.includes('compress chat history') ||
           error.message.includes('too long prompt'))) {
        this.logger.warn('Memory constraint detected, generating minimal synthesis');
        await this.generateMinimalSynthesis();
      } else {
        await this.generateSimpleSummary();
      }
    }
  }

  /**
   * GENERATE MINIMAL SYNTHESIS DUE TO MEMORY CONSTRAINTS
   */
  private async generateMinimalSynthesis(): Promise<void> {
    if (!this.conversationState) return;

    this.logger.info('🔧 Generating minimal synthesis due to memory constraints');

    // Try to get structured solutions first
    const structuredSolutions = await this.conversationManager.getStructuredSolutions(
      this.conversationState.sessionId
    );

    let synthesisContent = `# Collaborative Analysis Summary\n\n`;

    // If we have structured solutions, prioritize showing the final answer
    if (structuredSolutions.size > 0) {
      synthesisContent += `## Final Answer\n\n`;
      
      for (const solution of structuredSolutions.values()) {
        if (solution.value && solution.confidence === 'high') {
          synthesisContent += `**The answer is ${solution.value}**\n\n`;
          if (solution.reasoning) {
            synthesisContent += `${solution.reasoning}\n\n`;
          }
          break; // Use first high-confidence answer
        }
      }

      synthesisContent += `## Model Agreement\n\n`;
      const allAnswers = Array.from(structuredSolutions.values()).map(s => s.value);
      const uniqueAnswers = [...new Set(allAnswers)];
      
      if (uniqueAnswers.length === 1) {
        synthesisContent += `Both models independently arrived at the same answer: **${uniqueAnswers[0]}**\n\n`;
      } else {
        synthesisContent += `The models provided these answers:\n`;
        for (const [modelId, solution] of structuredSolutions) {
          synthesisContent += `- ${modelId}: ${solution.value} (${solution.confidence} confidence)\n`;
        }
        synthesisContent += `\n`;
      }
    } else {
      // Fallback to using recent turns
      const recentTurns = this.conversationState.turns.slice(-4);
      const gemmaContent = recentTurns.filter(t => t.modelId === this.GEMMA_MODEL_ID)
        .map(t => t.content).join(' ').substring(0, 200);
      const qwenContent = recentTurns.filter(t => t.modelId === this.QWEN_MODEL_ID)
        .map(t => t.content).join(' ').substring(0, 200);
      
      synthesisContent += `Both models have completed analysis through ${this.conversationState.turns.length} exchanges.\n\n`;
      synthesisContent += `## Key Insights:\n\n`;
      synthesisContent += `**From ${this.GEMMA_MODEL_ID}:**\n${gemmaContent || 'Analysis focused on systematic approach'}\n\n`;
      synthesisContent += `**From ${this.QWEN_MODEL_ID}:**\n${qwenContent || 'Analysis emphasized comprehensive evaluation'}\n\n`;
    }

    synthesisContent += `## Summary\n\n`;
    synthesisContent += `The collaborative process completed successfully with ${this.conversationState.turns.length} total exchanges.`;
    
    const minimalSynthesis = this.formatSynthesisOutput(
      synthesisContent,
      { 
        consensusLevel: ConsensusLevel.HIGH_CONSENSUS, 
        overallSimilarity: 0.9,
        modelA: this.GEMMA_MODEL_ID,
        modelB: this.QWEN_MODEL_ID
      } as AgreementAnalysis
    );

    // Use FinalAnswerService to reliably stream the minimal synthesis
    await this.finalAnswerService.generateFallbackAnswer({
      sessionId: this.conversationState.sessionId,
      modelId: this.GEMMA_MODEL_ID,
      prompt: minimalSynthesis,
      phase: CollaborationPhase.SYNTHESIZE,
      routeToSynthesis: true
    });

    // Store the minimal synthesis
    await this.conversationManager.addTurn(
      this.conversationState.sessionId,
      this.GEMMA_MODEL_ID,
      minimalSynthesis,
      0,
      undefined
    );

    this.sendMessage({
      type: SSEMessageType.PHASE_UPDATE,
      payload: { 
        phase: CollaborationPhase.CONSENSUS, 
        status: 'synthesis_complete',
        synthesisAnalysis: null
      }
    });

    this.logger.info('✅ Minimal synthesis generated and streamed');
  }

  /**
   * GENERATE SIMPLE SUMMARY WHEN SYNTHESIS FAILS
   */
  private async generateSimpleSummary(): Promise<void> {
    if (!this.conversationState) return;

    const lastTurn = this.conversationState.turns[this.conversationState.turns.length - 1];
    const summary = lastTurn ? 
      `Collaboration completed with ${this.conversationState.turns.length} total exchanges. Latest response: ${lastTurn.content.substring(0, 200)}...` :
      `Collaboration completed with ${this.conversationState.turns.length} total exchanges.`;

    // Use FinalAnswerService to reliably stream the summary
    await this.finalAnswerService.generateFallbackAnswer({
      sessionId: this.conversationState.sessionId,
      modelId: this.GEMMA_MODEL_ID,
      prompt: summary,
      phase: CollaborationPhase.SYNTHESIZE,
      routeToSynthesis: true
    });

    this.sendMessage({
      type: SSEMessageType.PHASE_UPDATE,
      payload: { 
        phase: CollaborationPhase.CONSENSUS, 
        status: 'synthesis_complete',
        synthesisAnalysis: null
      }
    });
  }

  /**
   * HELPER METHODS
   */

  private async getFinalOutput(): Promise<string> {
    if (!this.conversationState) return '';
    
    const lastTurn = this.conversationState.turns[this.conversationState.turns.length - 1];
    return lastTurn?.content || '';
  }

  /**
   * GENERATE MODEL RESPONSE WITH CONVERSATIONAL CONTEXT
   */
  private async generateWithModel(
    modelId: string, 
    context: LlamaContext, 
    prompt: string,
    phase: CollaborationPhase,
    conversationContext?: string,
    tokenAllocation?: TokenAllocation,
    skipNoThink?: boolean
  ): Promise<string> {
    const startTime = Date.now();
    const modelConfig = this.modelService.getModelConfig(modelId);
    if (!modelConfig) throw new Error(`Model config not found for ${modelId}`);

    // Build the full prompt - trust the context from ConversationStateManager
    // which already uses ContextAllocator with proper token budgeting
    let fullPrompt = prompt;
    if (conversationContext) {
      fullPrompt = `${conversationContext}\n\n---\n\n${prompt}`;
      
      // Log token usage for monitoring
      const contextTokens = this.tokenCounter.countTokens(conversationContext);
      const promptTokens = this.tokenCounter.countTokens(prompt);
      const totalTokens = contextTokens + promptTokens;
      
      this.logger.debug(`📋 Prompt composition:`);
      this.logger.debug(`   Context: ${contextTokens} tokens`);
      this.logger.debug(`   New prompt: ${promptTokens} tokens`);
      this.logger.debug(`   Total prompt: ${totalTokens} tokens`);
    }

    // Format prompt according to model requirements
    const systemPrompt = this.getSystemPrompt(phase, modelId);
    const formatted = PromptFormatter.formatPrompt(modelConfig, systemPrompt, fullPrompt, skipNoThink);

    // Get a sequence for this generation
    let sequence;
    try {
      sequence = context.getSequence();
    } catch (error) {
      this.logger.error(`Failed to get sequence from context for ${modelId}:`, {
        error: error instanceof Error ? error.message : String(error),
        contextInfo: {
          modelId,
          phase,
          contextPoolSize: config.model.contextsPerModel
        }
      });
      throw new Error(`Context sequence error for ${modelId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    try {
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: '' // We handle system prompt in the formatted prompt
      });

      let fullResponse = '';
      // Use CircularBuffer to prevent memory accumulation with large token streams
      // Size provides sufficient context for detokenization
      const tokenBuffer = new CircularBuffer<Token>(MODEL_DEFAULTS.TOKEN_BUFFER_SIZE);
      
      let maxTokens: number;
      
      // Use passed tokenAllocation if available, otherwise calculate for synthesis
      if (tokenAllocation) {
        // Use the allocation from ConversationStateManager (already validated)
        maxTokens = tokenAllocation.maxGenerationTokens;
        this.logger.info(`📋 Using pre-calculated token allocation: ${maxTokens} generation tokens`);
      } else {
        // Only calculate for synthesis or standalone calls
        const allocation = this.contextAllocator.calculateAllocation(
          phase,
          config.model.contextSize,
          conversationContext || '',  // CRITICAL FIX: Use actual conversation history, not the formatted prompt!
          modelId,
          modelId === this.GEMMA_MODEL_ID ? this.QWEN_MODEL_ID : this.GEMMA_MODEL_ID,
          this.conversationState?.turns.length || 0
        );
        
        const validation = this.contextAllocator.validateAllocation(allocation);
        if (!validation.isValid) {
          this.logger.error(`❌ Invalid token allocation: ${validation.issues.join(', ')}`);
          throw new Error(`Token allocation validation failed: ${validation.issues.join(', ')}`);
        }
        
        maxTokens = allocation.maxGenerationTokens;
        this.logger.info(`🎯 Calculated token allocation for synthesis: ${maxTokens} generation tokens`);
      }
        
      const generationOptions: Parameters<typeof session.prompt>[1] = {
        temperature: modelConfig.settings.temperature,
        topP: modelConfig.settings.topP,
        topK: modelConfig.settings.topK,
        minP: modelConfig.settings.minP,
        maxTokens: maxTokens,
        customStopTriggers: formatted.stopTokens,  // Array of strings is valid
        onToken: (tokens: Token[]) => {
          if (this.cancelled) return;
          
          // Add tokens to circular buffer (old tokens automatically removed)
          tokenBuffer.push(...tokens);
          
          // Get recent tokens for context
          const recentTokens = tokenBuffer.getRecent(MODEL_DEFAULTS.TOKEN_CONTEXT_SIZE);
          
          // Calculate how many context tokens to use for detokenization
          // We need context tokens that come before the current tokens
          const contextSize = Math.max(0, recentTokens.length - tokens.length);
          const contextTokens = contextSize > 0 ? recentTokens.slice(0, contextSize) : undefined;
          
          // Detokenize with proper context for spacing
          const tokenText = context.model.detokenize(tokens, false, contextTokens);
          
          if (tokenText) {
            this.streamingService.addToken(modelId, phase, tokenText);
          }
        }
      };
      
      // Only add repeatPenalty if it's defined and valid
      if (modelConfig.settings.repeatPenalty !== undefined && generationOptions) {
        generationOptions.repeatPenalty = {
          penalty: modelConfig.settings.repeatPenalty,
          frequencyPenalty: 0.0,
          presencePenalty: 0.0
        };
      }
      
      // Generate response with formatted prompt
      const response = await session.prompt(formatted.prompt, generationOptions);

      if (this.cancelled) return '';
      
      fullResponse = response;

      // Calculate actual tokens used and log performance metrics
      const actualGeneratedTokens = this.tokenCounter.countTokens(fullResponse);
      const promptTokens = this.tokenCounter.countTokens(formatted.prompt);
      const totalUsed = actualGeneratedTokens + promptTokens;
      
      const turnNumber = this.conversationState ? this.conversationState.turns.length + 1 : 1;
      const contextPercentage = Math.round(totalUsed/config.model.contextSize*100);
      
      const generationTime = Date.now() - startTime;
      const tokensPerSecond = Math.round((actualGeneratedTokens / generationTime) * 1000);
      
      this.logger.info(`📊 Generation completed`, {
        sessionId: this.conversationState?.sessionId,
        modelId,
        phase,
        turnNumber,
        generationMetrics: {
          promptTokens,
          generatedTokens: actualGeneratedTokens,
          maxTokensAllowed: maxTokens,
          tokenUtilization: Math.round(actualGeneratedTokens/maxTokens*100),
          totalTokensUsed: totalUsed,
          contextSize: config.model.contextSize,
          contextUtilization: contextPercentage,
          generationTimeMs: generationTime,
          tokensPerSecond
        },
        warnings: contextPercentage > 80 ? [`High context usage: ${contextPercentage}%`] : [],
        performance: {
          tokenBuffer: tokenBuffer.getSize(),
          memoryUsed: process.memoryUsage().heapUsed
        }
      });

      // Mark stream as complete
      this.streamingService.completeStream(modelId, phase);

      return PromptFormatter.extractResponse(modelConfig, fullResponse);
      
    } finally {
      sequence.dispose();
    }
  }

  /**
   * GET SYSTEM PROMPT FOR CONVERSATIONAL COLLABORATION
   */
  private getSystemPrompt(phase: CollaborationPhase, _modelId: string): string {
    return `${PHASE_INSTRUCTIONS[phase]}${VERIFICATION_REMINDER}`;
  }

  cancel(): void {
    this.cancelled = true;
  }

  /**
   * FORMAT SYNTHESIS OUTPUT WITH PROFESSIONAL HEADER
   */
  private formatSynthesisOutput(synthesisContent: string, analysis: AgreementAnalysis): string {
    const consensusBadge = this.getConsensusBadge(analysis.consensusLevel);
    
    // Get model names for attribution
    const gemmaModelName = 'Gemma 3 12B IT (Q4_0)';
    const qwenModelName = 'Qwen3 14B UD (Q4_K_XL)';
    
    const header = `🎯 **Final Synthesis** ${consensusBadge}

*Synthesized from the collaborative efforts of: ${gemmaModelName}, ${qwenModelName}*

---

`;

    return header + synthesisContent;
  }

  private getConsensusBadge(consensusLevel: ConsensusLevel): string {
    switch (consensusLevel) {
      case ConsensusLevel.HIGH_CONSENSUS:
        return '✅ **Consensus Reached**';
      case ConsensusLevel.MIXED_VIEWS:
        return '🔄 **Mixed Views Synthesized**';
      case ConsensusLevel.CREATIVE_TENSION:
        return '⚡ **Creative Tension Resolved**';
      case ConsensusLevel.NO_CONSENSUS:
        return '🤝 **Balanced Perspectives**';
      default:
        return '📋 **Analysis Complete**';
    }
  }

  /**
   * GENERATE SYNTHESIS WITH ERRORS
   * Generate a synthesis that includes error warnings when max attempts exceeded
   */
  private async generateSynthesisWithErrors(errorDetails: string): Promise<void> {
    if (!this.conversationState) return;

    this.logger.warn('⚠️ Generating synthesis with error warnings after max verification attempts');

    // Create the error warning header
    const errorWarning = `⚠️ **VERIFICATION ERRORS DETECTED** ⚠️

The collaborative analysis detected the following issues:
${errorDetails}

Despite these errors, here is the best synthesis we can provide:

---

`;

    // Get the synthesis instruction from conversation manager
    const { synthesis: synthesisInstruction, analysis } = await this.conversationManager.generateSynthesis(
      this.conversationState.sessionId,
      this.GEMMA_MODEL_ID
    );

    // Prepend the error warning to the synthesis instruction
    const fullPrompt = errorWarning + synthesisInstruction;

    // Calculate token allocation
    const totalContextSize = config.model.contextSize || 4096;
    const allocation = this.contextAllocator.calculateAllocation(
      CollaborationPhase.SYNTHESIZE,
      totalContextSize,
      '',
      this.GEMMA_MODEL_ID,
      'synthesis',
      this.conversationState.turns.length
    );

    this.logger.info('🎯 Generating synthesis with errors using FinalAnswerService', {
      errorDetails: errorDetails.substring(0, 100) + '...',
      promptTokens: this.tokenCounter.countTokens(fullPrompt),
      maxGenerationTokens: allocation.maxGenerationTokens
    });

    // Use FinalAnswerService to ensure proper streaming to synthesis panel
    const synthesisResult = await this.finalAnswerService.generateFinalAnswer({
      sessionId: this.conversationState.sessionId,
      modelId: this.GEMMA_MODEL_ID,
      prompt: fullPrompt,
      phase: CollaborationPhase.SYNTHESIZE,
      tokenAllocation: allocation,
      routeToSynthesis: true  // CRITICAL: Route to synthesis panel
    });

    if (synthesisResult.success) {
      this.logger.info('✅ Synthesis with errors generated successfully', {
        contentLength: synthesisResult.content.length,
        tokenMetrics: synthesisResult.tokenMetrics
      });
      
      // Store the synthesis with verification warning
      await this.conversationManager.addTurn(
        this.conversationState.sessionId,
        this.GEMMA_MODEL_ID,
        synthesisResult.content,
        synthesisResult.tokenMetrics.generationTimeMs,
        undefined
      );
      
      // Send the complete synthesis update
      this.sendMessage({
        type: SSEMessageType.PHASE_UPDATE,
        payload: { 
          phase: CollaborationPhase.CONSENSUS, 
          status: 'synthesis_complete_with_errors',
          synthesisAnalysis: analysis
        }
      });
    } else {
      this.logger.error('❌ Failed to generate synthesis with errors, using fallback');
      
      // Fallback to simple summary with error notice
      const fallbackContent = `⚠️ **VERIFICATION ERRORS DETECTED** ⚠️

${errorDetails}

The collaborative analysis completed but encountered errors during verification. Please review the conversation history for details.`;
      
      await this.finalAnswerService.generateFallbackAnswer({
        sessionId: this.conversationState.sessionId,
        modelId: this.GEMMA_MODEL_ID,
        prompt: fallbackContent,
        phase: CollaborationPhase.SYNTHESIZE,
        routeToSynthesis: true
      });
    }
  }

}
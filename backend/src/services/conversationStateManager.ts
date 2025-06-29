import { RedisService } from './redisService.js';
import { RedisVectorStore } from './redisVectorStore.js';
import { SynthesisService } from './synthesisService.js';
import { TokenCounter } from './tokenCounter.js';
import { ContextAllocator } from './contextAllocator.js';
import { ConversationCompressor } from './conversationCompressor.js';
import { ModelService } from './modelService.js';
import { SolutionExtractionService } from './solutionExtractionService.js';
import { LLMAnalyticsService } from './llmAnalyticsService.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { CollaborationPhase } from '../models/types.js';
import { 
  ConversationState, 
  ConversationTurn, 
  ConversationPrompt,
  StructuredSolution
} from '../models/conversationTypes.js';
import { AgreementAnalysis } from '../models/curatedConversationTypes.js';
import { 
  REDIS_KEYS, 
  PHASE_INSTRUCTIONS
} from '../constants/index.js';

/**
 * Manages the evolving conversation state between two LLMs
 * All data persisted in Redis, conversation builds iteratively
 */
export class ConversationStateManager {
  private redisService: RedisService;
  private vectorStore: RedisVectorStore;
  private synthesisService: SynthesisService;
  private tokenCounter: TokenCounter;
  private contextAllocator: ContextAllocator;
  private conversationCompressor: ConversationCompressor | null = null;
  private solutionExtractor: SolutionExtractionService | null = null;
  private llmAnalytics: LLMAnalyticsService | null = null;
  private readonly logger = createLogger('ConversationState');
  private readonly stateKeyPrefix = REDIS_KEYS.CONVERSATION_STATE;
  private readonly turnKeyPrefix = REDIS_KEYS.CONVERSATION_TURN;
  private readonly compressedKeyPrefix = REDIS_KEYS.CONVERSATION_COMPRESSED;

  constructor(redisService: RedisService, modelService?: ModelService, enableCompression: boolean = false) {
    this.redisService = redisService;
    const redisClient = redisService.getClient();
    this.vectorStore = new RedisVectorStore(redisClient);
    this.synthesisService = new SynthesisService();
    this.tokenCounter = new TokenCounter();
    this.contextAllocator = new ContextAllocator(this.tokenCounter);
    
    // Initialize compression if model service provided and enabled
    if (modelService && enableCompression) {
      this.conversationCompressor = new ConversationCompressor(modelService, this.tokenCounter);
      this.logger.info('🗜️ Conversation compression enabled');
    } else {
      this.logger.info('📦 Conversation compression disabled');
    }
    
    // Phase 2: Initialize solution extraction service
    if (modelService) {
      this.solutionExtractor = new SolutionExtractionService(modelService);
      this.logger.info('🎯 Solution extraction service enabled');
      
      // Initialize LLM Analytics for intelligent data operations
      this.llmAnalytics = new LLMAnalyticsService(modelService, redisService);
      this.logger.info('🧠 LLM Analytics service enabled for intelligent data operations');
    }
  }

  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
    this.logger.info('✅ Conversation state manager initialized');
  }

  /**
   * Create a new conversation session
   */
  async createConversation(
    sessionId: string,
    originalQuery: string,
    modelIds: string[]
  ): Promise<ConversationState> {
    const state: ConversationState = {
      sessionId,
      originalQuery,
      currentPhase: CollaborationPhase.BRAINSTORM,
      participants: modelIds,
      turns: [],
      sharedContext: {
        keyPoints: [],
        agreements: [],
        disagreements: [],
        workingHypotheses: [],
        nextSteps: []
      },
      phaseProgress: {},
      phaseHistory: [],
      peakContextUsage: {
        percentage: 0,
        turnNumber: 0,
        tokenCount: 0,
        phase: CollaborationPhase.BRAINSTORM
      },
      lastUpdate: Date.now(),
      status: 'active'
    };

    await this.saveConversationState(state);
    this.logger.info(`🎬 Started conversation ${sessionId} with models: ${modelIds.join(', ')}`);
    
    return state;
  }

  /**
   * Add a new turn to the conversation and update context
   */
  async addTurn(
    sessionId: string,
    modelId: string,
    content: string,
    processingTime: number,
    responseToTurnId?: string,
    isVerification?: boolean
  ): Promise<ConversationTurn> {
    const state = await this.getConversationState(sessionId);
    if (!state) throw new Error(`Conversation ${sessionId} not found`);

    const turn: ConversationTurn = {
      id: `${sessionId}-turn-${Date.now()}-${modelId}`,
      sessionId,
      modelId,
      phase: state.currentPhase,
      content,
      timestamp: Date.now(),
      turnNumber: state.turns.length + 1,
      responseToTurn: responseToTurnId,
      metadata: {
        tokenCount: this.tokenCounter.countTokens(content),
        processingTime,
        contextUsed: await this.calculateContextUsage(sessionId, content)
      }
    };

    // Phase 2: Extract structured solution if in final phases
    if (this.solutionExtractor && 
        (state.currentPhase === CollaborationPhase.SYNTHESIZE || 
         state.currentPhase === CollaborationPhase.CONSENSUS ||
         state.currentPhase === CollaborationPhase.REVISE)) {
      
      const extractedSolution = await this.solutionExtractor.extractSolution(turn);
      if (extractedSolution) {
        turn.metadata.structuredSolution = extractedSolution;
        turn.metadata.isFinalAnswer = extractedSolution.status === 'conclusive';
        this.logger.info(`🎯 Extracted solution from ${modelId}: ${JSON.stringify(extractedSolution)}`);
      }
    }
    
    // Mark verification turns
    if (isVerification) {
      turn.metadata.isVerification = true;
    }

    // Store the turn
    await this.saveTurn(turn);
    
    // Store in vector database for semantic retrieval
    await this.vectorStore.storeDocument(
      turn.id,
      content,
      {
        sessionId,
        phase: state.currentPhase,
        modelId,
        timestamp: turn.timestamp,
        tokens: turn.metadata.tokenCount
      }
    );

    // Update conversation state
    state.turns.push(turn);
    state.lastUpdate = Date.now();
    
    // Update peak context usage if this turn used more context
    const contextPercentage = turn.metadata.contextUsed * 100;
    if (contextPercentage > state.peakContextUsage.percentage) {
      state.peakContextUsage = {
        percentage: contextPercentage,
        turnNumber: turn.turnNumber,
        tokenCount: Math.round(turn.metadata.contextUsed * config.model.contextSize),
        phase: turn.phase
      };
    }

    // Analyze and update shared context if we have responses from both models
    if (this.shouldUpdateSharedContext(state)) {
      await this.updateSharedContext(state);
    }

    await this.saveConversationState(state);
    
    this.logger.info(`📝 Turn ${turn.turnNumber} added by ${modelId} in ${state.currentPhase}`);
    return turn;
  }

  /**
   * Build conversation prompt for the next LLM turn with optimal token allocation
   */
  async buildConversationPrompt(
    sessionId: string,
    modelId: string,
    newPrompt?: string
  ): Promise<ConversationPrompt> {
    const state = await this.getConversationState(sessionId);
    if (!state) throw new Error(`Conversation ${sessionId} not found`);

    const otherModelId = state.participants.find(id => id !== modelId);
    const otherModelLastTurn = this.getLastTurnByModel(state, otherModelId || '');
    const myLastTurn = this.getLastTurnByModel(state, modelId);

    // First, build the prompt components to know their sizes
    const systemPrompt = this.buildSystemPrompt(state.currentPhase, modelId, otherModelId || '');
    const currentTurn = newPrompt || this.buildCurrentTurnPrompt(state, modelId);
    
    // Get a sample of existing conversation history for size estimation
    const recentTurns = state.turns.slice(-4); // Last 4 turns
    const sampleHistory = recentTurns.map(turn => 
      `**${turn.modelId} (${turn.phase}):** ${turn.content}`
    ).join('\n\n');
    
    // Calculate optimal token allocation for this phase
    // Pass existing history (not the new prompt) for accurate allocation
    const allocation = this.contextAllocator.calculateAllocation(
      state.currentPhase,
      config.model.contextSize,
      sampleHistory, // Pass actual history, not the prompt
      modelId,
      otherModelId || 'partner',
      state.turns.length + 1
    );

    this.logger.info(`🧮 Token allocation for ${state.currentPhase}: ${allocation.actualHistoryTokens}h + ${allocation.maxGenerationTokens}g = ${allocation.totalAllocated}/${config.model.contextSize}`);

    // Get relevant conversation history using vector search within budget
    const relevantHistory = await this.getRelevantTurnsWithinBudget(
      sessionId,
      newPrompt || state.originalQuery,
      state.currentPhase,
      allocation.historyTokenBudget
    );

    // Build the conversation context within token limits
    const conversationContext = this.buildConversationContextWithinBudget(
      state,
      relevantHistory,
      allocation.historyTokenBudget,
      myLastTurn,
      otherModelLastTurn
    );

    // Calculate actual tokens used in final context
    const actualContextTokens = this.tokenCounter.countTokens(conversationContext);
    const promptTokens = this.tokenCounter.countTokens(currentTurn);
    const systemTokens = this.tokenCounter.countTokens(systemPrompt);
    const totalPromptTokens = actualContextTokens + promptTokens + systemTokens;
    
    this.logger.info(`📊 Context built: ${actualContextTokens}/${allocation.historyTokenBudget} history tokens used`);
    this.logger.info(`📊 Total prompt composition: ${totalPromptTokens} tokens (history: ${actualContextTokens}, prompt: ${promptTokens}, system: ${systemTokens})`);
    
    // Recalculate generation tokens based on actual prompt size
    const actualGenerationTokens = config.model.contextSize - totalPromptTokens - allocation.safetyMarginTokens;
    
    // Update allocation with actual values
    const updatedAllocation = {
      ...allocation,
      maxGenerationTokens: Math.max(actualGenerationTokens, 100), // Minimum 100 tokens for generation
      actualHistoryTokens: actualContextTokens,
      promptTemplateTokens: promptTokens + systemTokens,
      totalAllocated: totalPromptTokens + Math.max(actualGenerationTokens, 100) + allocation.safetyMarginTokens
    };
    
    // Safety check - ensure we're within allocated limits
    if (updatedAllocation.totalAllocated > config.model.contextSize) {
      this.logger.warn(`⚠️ Adjusted generation tokens to fit: ${updatedAllocation.maxGenerationTokens} tokens`);
    }

    return {
      systemPrompt,
      conversationContext,
      currentTurn,
      metadata: {
        phase: state.currentPhase,
        turnNumber: state.turns.length + 1,
        otherModelLastResponse: otherModelLastTurn?.content,
        sharedContextSummary: this.summarizeSharedContext(state.sharedContext),
        tokenAllocation: updatedAllocation
      }
    };
  }

  /**
   * Compress conversation history for a session
   * Called at phase transitions to optimize context usage
   */
  async compressConversationHistory(sessionId: string): Promise<void> {
    if (!this.conversationCompressor) {
      this.logger.debug('Compression not enabled, skipping');
      return;
    }

    const state = await this.getConversationState(sessionId);
    if (!state) return;

    this.logger.info(`🗜️ Starting batch compression for session ${sessionId}`);
    
    // Get uncompressed turns from current phase
    const uncompressedTurns = state.turns.filter(turn => {
      // Check if already compressed
      return turn.metadata.tokenCount > 200; // Only compress larger turns
    });

    if (uncompressedTurns.length === 0) {
      this.logger.debug('No turns to compress');
      return;
    }

    try {
      // Compress turns in batch
      const compressionTasks = uncompressedTurns.map(turn => ({
        content: turn.content,
        modelId: turn.modelId,
        phase: turn.phase,
        turnNumber: turn.turnNumber
      }));

      const compressionResults = await this.conversationCompressor.batchCompressTurns(compressionTasks);

      // Update vector store with compressed content
      for (const turn of uncompressedTurns) {
        const result = compressionResults.get(turn.turnNumber);
        if (result && result.compressionRatio < 0.8) {
          // Update vector store with compressed content
          await this.vectorStore.updateDocument(
            turn.id,
            result.compressed,
            {
              isCompressed: true,
              originalTokens: turn.metadata.tokenCount,
              compressedTokens: this.tokenCounter.countTokens(result.compressed),
              compressionRatio: result.compressionRatio,
              keyPoints: result.preservedKeyPoints
            }
          );

          // Store compressed version
          await this.redisService.getClient().setex(
            `${this.compressedKeyPrefix}${turn.id}`,
            config.redis.ttl,
            JSON.stringify(result)
          );

          this.logger.info(`✅ Compressed turn ${turn.turnNumber}: ${turn.metadata.tokenCount} → ${this.tokenCounter.countTokens(result.compressed)} tokens`);
        }
      }

      this.logger.info(`🗜️ Batch compression complete: ${compressionResults.size} turns processed`);
    } catch (error) {
      this.logger.error('Batch compression failed:', error);
    }
  }

  /**
   * Transition to the next phase when current phase objectives are met
   */
  async transitionPhase(sessionId: string, analysis?: AgreementAnalysis): Promise<CollaborationPhase> {
    const state = await this.getConversationState(sessionId);
    if (!state) throw new Error(`Conversation ${sessionId} not found`);

    const currentPhase = state.currentPhase;
    let nextPhase: CollaborationPhase;

    switch (currentPhase) {
      case CollaborationPhase.BRAINSTORM:
        nextPhase = CollaborationPhase.CRITIQUE;
        break;
      case CollaborationPhase.CRITIQUE:
        nextPhase = CollaborationPhase.REVISE;
        break;
      case CollaborationPhase.REVISE:
        nextPhase = CollaborationPhase.SYNTHESIZE;
        break;
      case CollaborationPhase.SYNTHESIZE:
        nextPhase = CollaborationPhase.CONSENSUS;
        break;
      case CollaborationPhase.CONSENSUS:
        nextPhase = CollaborationPhase.COMPLETE;
        break;
      default:
        nextPhase = CollaborationPhase.COMPLETE;
    }

    // Mark current phase as completed
    state.phaseProgress[currentPhase] = {
      completed: true,
      outcome: this.summarizePhaseOutcome(state, currentPhase),
      consensus: analysis?.overallSimilarity || 0.5,
      timestamp: Date.now()
    };

    state.currentPhase = nextPhase;
    state.lastUpdate = Date.now();

    await this.saveConversationState(state);
    
    // Compress conversation history after phase transition
    if (this.conversationCompressor) {
      this.logger.info(`🗜️ Compressing history after ${currentPhase} phase`);
      // Run compression asynchronously to avoid blocking
      this.compressConversationHistory(sessionId).catch(error => {
        this.logger.error('Phase transition compression failed:', error);
      });
    }
    
    this.logger.info(`🔄 Phase transition: ${currentPhase} → ${nextPhase} for session ${sessionId}`);
    return nextPhase;
  }

  /**
   * Manual phase transition for intelligent flow control
   */
  async manualPhaseTransition(sessionId: string, targetPhase: CollaborationPhase): Promise<void> {
    const state = await this.getConversationState(sessionId);
    if (!state) throw new Error(`Conversation ${sessionId} not found`);

    const currentPhase = state.currentPhase;
    
    // Update conversation state to target phase
    state.currentPhase = targetPhase;
    state.lastUpdate = Date.now();
    
    // Record the phase transition
    state.phaseHistory.push({
      phase: currentPhase,
      completed: true,
      outcome: `Intelligent transition to ${targetPhase}`,
      consensus: 0.9, // High consensus assumed for intelligent transitions
      timestamp: Date.now()
    });

    await this.saveConversationState(state);
    
    this.logger.info(`🧠 Intelligent phase transition: ${currentPhase} → ${targetPhase} for session ${sessionId}`);
  }

  /**
   * Analyze agreement between the last two turns from different models
   */
  async analyzeCurrentAgreement(sessionId: string): Promise<AgreementAnalysis | null> {
    const state = await this.getConversationState(sessionId);
    if (!state || state.participants.length < 2) return null;

    const [modelA, modelB] = state.participants;
    const turnA = this.getLastTurnByModel(state, modelA);
    const turnB = this.getLastTurnByModel(state, modelB);

    if (!turnA || !turnB) return null;

    return await this.synthesisService.analyzeForSynthesis(
      sessionId,
      state.currentPhase,
      modelA,
      turnA.content,
      modelB,
      turnB.content
    );
  }

  /**
   * Generate synthesis using one of the LLMs
   */
  async generateSynthesis(
    sessionId: string,
    _synthesisModelId: string
  ): Promise<{ synthesis: string; analysis: AgreementAnalysis }> {
    const state = await this.getConversationState(sessionId);
    if (!state) throw new Error(`Conversation ${sessionId} not found`);

    const analysis = await this.analyzeCurrentAgreement(sessionId);
    if (!analysis) throw new Error('Cannot generate synthesis without two model responses');

    const [modelA, modelB] = state.participants;
    const turnA = this.getLastTurnByModel(state, modelA);
    const turnB = this.getLastTurnByModel(state, modelB);

    if (!turnA || !turnB) throw new Error('Missing model responses for synthesis');

    // Phase 2: Try to use structured solutions first
    const structuredSolutions = await this.getStructuredSolutions(sessionId);
    
    let synthesisPrompt: string;
    
    if (structuredSolutions.size > 0) {
      // Use structured synthesis if we have extracted solutions
      this.logger.info(`🎯 Using structured synthesis with ${structuredSolutions.size} solutions`);
      
      // Get some context for additional insights
      const relevantInsights = await this.getRelevantInsightsForSynthesis(sessionId, state.originalQuery);
      
      synthesisPrompt = await this.synthesisService.createStructuredSynthesisPrompt(
        analysis,
        structuredSolutions,
        relevantInsights.slice(0, 3), // Only use top 3 for context
        state.currentPhase,
        state.originalQuery
      );
    } else {
      // Fallback to vector-based synthesis
      this.logger.info('📋 Using vector-based synthesis (no structured solutions found)');
      
      const relevantInsights = await this.getRelevantInsightsForSynthesis(sessionId, state.originalQuery);
      synthesisPrompt = await this.synthesisService.createVectorBasedSynthesisPrompt(
        analysis,
        relevantInsights,
        state.currentPhase,
        state.originalQuery
      );
    }

    return {
      synthesis: synthesisPrompt, // This will be sent to the LLM to generate actual synthesis
      analysis
    };
  }

  private async saveConversationState(state: ConversationState): Promise<void> {
    const key = `${this.stateKeyPrefix}${state.sessionId}`;
    await this.redisService.getClient().setex(
      key,
      config.redis.ttl,
      JSON.stringify(state)
    );
  }


  private async saveTurn(turn: ConversationTurn): Promise<void> {
    const key = `${this.turnKeyPrefix}${turn.id}`;
    await this.redisService.getClient().setex(
      key,
      config.redis.ttl,
      JSON.stringify(turn)
    );
  }

  async getConversationState(sessionId: string): Promise<ConversationState | null> {
    const key = `${this.stateKeyPrefix}${sessionId}`;
    const data = await this.redisService.getClient().get(key);
    return data ? JSON.parse(data) : null;
  }

  private getLastTurnByModel(state: ConversationState, modelId: string): ConversationTurn | undefined {
    return state.turns
      .filter(turn => turn.modelId === modelId)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  private shouldUpdateSharedContext(state: ConversationState): boolean {
    // Update context after both models have responded in current phase
    const currentPhaseTurns = state.turns.filter(t => t.phase === state.currentPhase);
    const modelsResponded = new Set(currentPhaseTurns.map(t => t.modelId));
    return modelsResponded.size >= state.participants.length;
  }

  private async updateSharedContext(state: ConversationState): Promise<void> {
    // If LLM Analytics is available, use intelligent extraction
    if (this.llmAnalytics) {
      this.logger.info('🧠 Using LLM Analytics for shared context extraction');
      
      // Get the last two turns from different models
      const [modelA, modelB] = state.participants;
      const turnA = this.getLastTurnByModel(state, modelA);
      const turnB = this.getLastTurnByModel(state, modelB);
      
      if (turnA && turnB) {
        // Use LLM to extract structured context
        const extractedContext = await this.llmAnalytics.extractSharedContext(turnA, turnB);
        
        // Update shared context with LLM-extracted insights
        state.sharedContext.agreements.push(...extractedContext.agreements);
        state.sharedContext.disagreements.push(...extractedContext.disagreements);
        state.sharedContext.keyPoints.push(...extractedContext.keyInsights);
        
        // Add any new questions to next steps
        if (extractedContext.newQuestions.length > 0) {
          state.sharedContext.nextSteps.push(...extractedContext.newQuestions);
        }
        
        this.logger.info(`📊 Extracted: ${extractedContext.agreements.length} agreements, ${extractedContext.disagreements.length} disagreements, ${extractedContext.keyInsights.length} insights`);
      }
    } else {
      // Fallback to original analysis-based method
      const analysis = await this.analyzeCurrentAgreement(state.sessionId);
      if (!analysis) return;

      // Update shared context based on analysis
      if (analysis.keyPoints.agreements.length > 0) {
        state.sharedContext.agreements.push(...analysis.keyPoints.agreements);
      }

      if (analysis.keyPoints.conflicts.length > 0) {
        state.sharedContext.disagreements.push(...analysis.keyPoints.conflicts);
      }

      // Extract key points from the latest turns
      const recentTurns = state.turns
        .filter(t => t.phase === state.currentPhase)
        .slice(-2);

      for (const turn of recentTurns) {
        const keyPoints = await this.extractKeyPoints(turn.content);
        state.sharedContext.keyPoints.push(...keyPoints);
      }
    }

    // Remove duplicates and keep most recent
    state.sharedContext.keyPoints = [...new Set(state.sharedContext.keyPoints)].slice(-15);
    state.sharedContext.agreements = [...new Set(state.sharedContext.agreements)].slice(-15);
    state.sharedContext.disagreements = [...new Set(state.sharedContext.disagreements)].slice(-10);
    state.sharedContext.nextSteps = [...new Set(state.sharedContext.nextSteps)].slice(-5);
  }

  private async getRelevantTurns(
    sessionId: string,
    query: string,
    _currentPhase: CollaborationPhase,
    limit: number
  ): Promise<ConversationTurn[]> {
    try {
      const results = await this.vectorStore.search(
        query,
        { sessionId },
        limit
      );

      const turnIds = results.map(r => r.id);
      const turns: ConversationTurn[] = [];

      for (const turnId of turnIds) {
        const key = `${this.turnKeyPrefix}${turnId}`;
        const data = await this.redisService.getClient().get(key);
        if (data) {
          turns.push(JSON.parse(data));
        }
      }

      return turns.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      this.logger.error('Failed to get relevant turns:', error);
      return [];
    }
  }

  /**
   * Get relevant conversation history within token budget using LLM intelligence
   * Implements retrieve-then-rank pattern for optimal context selection
   */
  private async getRelevantTurnsWithinBudget(
    sessionId: string,
    query: string,
    currentPhase: CollaborationPhase,
    tokenBudget: number
  ): Promise<ConversationTurn[]> {
    try {
      // If LLM Analytics is available AND properly implemented, use intelligent retrieval
      if (this.llmAnalytics && 
          typeof this.llmAnalytics.generateHypotheticalDocument === 'function' &&
          typeof this.llmAnalytics.rerankDocuments === 'function') {
        this.logger.info('🧠 Using LLM-enhanced retrieval for context building');
        
        // Step 1: Generate enhanced query using HyDE
        const state = await this.getConversationState(sessionId);
        const lastTurnContent = state?.turns.slice(-1)[0]?.content;
        const enhancedQuery = await this.llmAnalytics.generateHypotheticalDocument(
          query,
          lastTurnContent,
          currentPhase
        );
        
        // Step 2: Retrieve more candidates than needed
        const candidateResults = await this.vectorStore.search(
          enhancedQuery,
          { sessionId },
          30 // Get 30 candidates for re-ranking
        );
        
        // Fetch full turn data
        const candidateTurns: ConversationTurn[] = [];
        for (const result of candidateResults) {
          const turn = await this.getTurn(result.id);
          if (turn) candidateTurns.push(turn);
        }
        
        // Step 3: Re-rank using LLM intelligence
        const rankedDocs = await this.llmAnalytics.rerankDocuments(
          query,
          candidateTurns.map(t => ({ id: t.id, content: t.content })),
          15 // Keep top 15 after re-ranking
        );
        
        // Step 4: Select best turns within token budget
        const selectedTurns: ConversationTurn[] = [];
        let currentTokens = 0;
        
        for (const rankedDoc of rankedDocs) {
          const turn = candidateTurns.find(t => t.id === rankedDoc.id);
          if (!turn) continue;
          
          const turnTokens = this.tokenCounter.countTokens(turn.content);
          
          if (currentTokens + turnTokens <= tokenBudget) {
            selectedTurns.push(turn);
            currentTokens += turnTokens;
            this.logger.debug(`✅ Selected turn ${turn.id} (score: ${rankedDoc.score}, reason: ${rankedDoc.reason})`);
          } else {
            // Try truncated version for high-scoring turns
            if (rankedDoc.score > 0.7) {
              const remainingTokens = tokenBudget - currentTokens;
              if (remainingTokens > 100) {
                const truncatedContent = this.tokenCounter.truncateToTokenLimit(turn.content, remainingTokens);
                const truncatedTurn = { ...turn, content: truncatedContent };
                selectedTurns.push(truncatedTurn);
                this.logger.debug(`✂️ Added truncated high-score turn ${turn.id}`);
              }
            }
            break;
          }
        }
        
        this.logger.info(`🎯 Selected ${selectedTurns.length} turns via LLM re-ranking (${currentTokens}/${tokenBudget} tokens)`);
        return selectedTurns;
        
      } else {
        // Fallback to original method if LLM Analytics not available
        this.logger.debug('Using standard retrieval (LLM Analytics not available)');
        const candidateTurns = await this.getRelevantTurns(sessionId, query, currentPhase, 20);
        
        const selectedTurns: ConversationTurn[] = [];
        let currentTokens = 0;

        for (const turn of candidateTurns) {
          const turnTokens = this.tokenCounter.countTokens(turn.content);
          
          if (currentTokens + turnTokens <= tokenBudget) {
            selectedTurns.push(turn);
            currentTokens += turnTokens;
          } else {
            const remainingTokens = tokenBudget - currentTokens;
            if (remainingTokens > 50) {
              const truncatedContent = this.tokenCounter.truncateToTokenLimit(turn.content, remainingTokens);
              const truncatedTurn = { ...turn, content: truncatedContent };
              selectedTurns.push(truncatedTurn);
            }
            break;
          }
        }

        this.logger.debug(`🔍 Selected ${selectedTurns.length} turns within ${tokenBudget} token budget (${currentTokens} tokens used)`);
        return selectedTurns;
      }
    } catch (error) {
      this.logger.error('Failed to get relevant turns within budget:', error);
      return [];
    }
  }
  
  /**
   * Fetch a turn by ID
   */
  private async getTurn(turnId: string): Promise<ConversationTurn | null> {
    try {
      const key = `${this.turnKeyPrefix}${turnId}`;
      const data = await this.redisService.getClient().get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Failed to fetch turn ${turnId}:`, error);
      return null;
    }
  }


  /**
   * Build conversation context within specific token budget using accurate token counting
   */
  private buildConversationContextWithinBudget(
    state: ConversationState,
    relevantHistory: ConversationTurn[],
    tokenBudget: number,
    myLastTurn?: ConversationTurn,
    otherModelLastTurn?: ConversationTurn
  ): string {
    // Build context sections with priority order
    const sections: { content: string; priority: number }[] = [];
    
    // Priority 1: Essential overview (always include)
    const overviewParts = [
      `## Conversation Overview`,
      `**Original Query:** ${state.originalQuery}`,
      `**Current Phase:** ${state.currentPhase}`,
      `**Turn:** ${state.turns.length + 1}`,
      ``
    ];
    sections.push({ content: overviewParts.join('\n'), priority: 1 });

    // Priority 2: Immediate context (partner's last response)
    if (otherModelLastTurn) {
      const partnerResponse = `## Partner's Last Response\n**${otherModelLastTurn.modelId}:** ${otherModelLastTurn.content}\n\n`;
      sections.push({ content: partnerResponse, priority: 2 });
    }

    // Priority 3: Own last response
    if (myLastTurn) {
      const myResponse = `## Your Last Response\n**You:** ${myLastTurn.content}\n\n`;
      sections.push({ content: myResponse, priority: 3 });
    }

    // Priority 4: Shared understanding
    const sharedSummary = this.summarizeSharedContext(state.sharedContext);
    if (sharedSummary) {
      const sharedContext = `## Shared Understanding\n${sharedSummary}\n\n`;
      sections.push({ content: sharedContext, priority: 4 });
    }

    // Priority 5: Relevant history
    if (relevantHistory.length > 0) {
      const historyParts = [`## Relevant Previous Discussion`];
      for (const turn of relevantHistory) {
        historyParts.push(`**${turn.modelId} (${turn.phase}):** ${turn.content}`);
        historyParts.push(``); // Empty line between turns
      }
      sections.push({ content: historyParts.join('\n'), priority: 5 });
    }

    // Build context within precise token limits using accurate counting
    return this.assembleContextWithinTokenBudget(sections, tokenBudget);
  }


  /**
   * Assemble context sections within precise token budget using accurate token counting
   */
  private assembleContextWithinTokenBudget(sections: { content: string; priority: number }[], tokenBudget: number): string {
    // Sort by priority (lower number = higher priority)
    sections.sort((a, b) => a.priority - b.priority);
    
    const contextParts: string[] = [];
    let currentTokens = 0;
    
    for (const section of sections) {
      const sectionTokens = this.tokenCounter.countTokens(section.content);
      
      if (currentTokens + sectionTokens <= tokenBudget) {
        contextParts.push(section.content);
        currentTokens += sectionTokens;
      } else {
        // Try to fit a truncated version using precise token counting
        const remainingTokens = tokenBudget - currentTokens;
        if (remainingTokens > 50) { // Only if meaningful space left
          const truncatedContent = this.tokenCounter.truncateToTokenLimit(section.content, remainingTokens);
          if (truncatedContent.length > 50) { // Only include if meaningful
            contextParts.push(truncatedContent);
            currentTokens += this.tokenCounter.countTokens(truncatedContent);
          }
        }
        break; // Stop adding more sections
      }
    }
    
    this.logger.debug(`🎯 Built context with ${currentTokens}/${tokenBudget} tokens (precise counting)`);
    return contextParts.join('');
  }



  private buildSystemPrompt(phase: CollaborationPhase, _modelId: string, otherModelId: string): string {
    if (phase === CollaborationPhase.CONSENSUS) {
      return `CONSENSUS PHASE - HIGH-PRIORITY VERIFICATION PROTOCOL:

You are a high-end analytical worker. Your PRIMARY directive is accuracy verification.

MANDATORY STEPS (in order):
1. FIRST: Re-verify YOUR calculations independently. Show your work.
2. SECOND: Analyze ${otherModelId}'s calculations for errors.
3. THIRD: State YOUR final answer based on mathematical truth, not agreement.

CRITICAL RULE: When checking ${otherModelId}'s answer, you MUST logically verify the accuracy and correctness of their claims BEFORE continuing your analysis. If their math is wrong, say so clearly.

Remember: Truth > Consensus. A correct minority is better than an incorrect majority.`;
    }
    return `Collaborate with ${otherModelId}. ${PHASE_INSTRUCTIONS[phase]} Verify all claims.`;
  }

  private buildCurrentTurnPrompt(state: ConversationState, modelId: string): string {
    const turnCount = state.turns.filter(t => t.modelId === modelId).length;
    
    if (state.currentPhase === CollaborationPhase.CONSENSUS) {
      if (turnCount === 0) {
        return `CONSENSUS VERIFICATION TASK for: "${state.originalQuery}"

STEP 1: Show YOUR calculations again, step by step.
STEP 2: Verify each step is mathematically correct.
STEP 3: State YOUR final answer with FULL confidence.
STEP 4: If partner disagrees, explain WHY your answer is correct.

CRITICAL: Do NOT change a correct answer to match an incorrect one. Mathematics determines truth, not agreement.`;
      } else {
        return `CONSENSUS FOLLOW-UP:

You've seen your partner's response. Now:
1. If YOUR math was correct, MAINTAIN your answer and explain why.
2. If you found an actual error in YOUR work, correct it and show the fix.
3. If partner is wrong, clearly state their error and the correct approach.

Final answer format: "My verified answer is [X] because [mathematical proof]"`;
      }
    }
    
    if (turnCount === 0) {
      return `Begin the ${state.currentPhase} phase. What are your initial thoughts on: "${state.originalQuery}"?`;
    } else {
      return `Continue the ${state.currentPhase} discussion. Respond to your partner's points and contribute your perspective.`;
    }
  }

  private summarizeSharedContext(context: ConversationState['sharedContext']): string {
    const parts: string[] = [];
    
    if (context.agreements.length > 0) {
      parts.push(`**Agreements:** ${context.agreements.slice(-3).join('; ')}`);
    }
    
    if (context.keyPoints.length > 0) {
      parts.push(`**Key Points:** ${context.keyPoints.slice(-5).join('; ')}`);
    }
    
    if (context.disagreements.length > 0) {
      parts.push(`**Areas of Tension:** ${context.disagreements.slice(-2).join('; ')}`);
    }

    return parts.join('\n');
  }

  private summarizePhaseOutcome(state: ConversationState, phase: CollaborationPhase): string {
    const phaseTurns = state.turns.filter(t => t.phase === phase);
    return `Completed with ${phaseTurns.length} turns`;
  }

  private async calculateContextUsage(sessionId: string, newContent: string): Promise<number> {
    // Calculate context usage for this specific turn
    // This should reflect the actual context window usage for generating this turn
    // In reality, this would be the prompt tokens + generated tokens for this turn
    // Since we don't have access to the prompt here, we'll estimate based on recent history
    
    const state = await this.getConversationState(sessionId);
    if (!state) return 0;

    // Get the last few turns for context (typical context window usage)
    const recentTurns = state.turns.slice(-5); // Last 5 turns as context estimate
    const contextTokens = recentTurns.reduce((sum, turn) => sum + turn.metadata.tokenCount, 0);
    const newTokens = this.tokenCounter.countTokens(newContent);
    const totalTokensForTurn = contextTokens + newTokens;
    
    return totalTokensForTurn / config.model.contextSize;
  }

  private async extractKeyPoints(content: string): Promise<string[]> {
    // Simple extraction - look for sentences with keywords
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keywordPattern = /(therefore|because|however|important|key|main|primary|suggest|propose|recommend)/i;
    
    return sentences
      .filter(s => keywordPattern.test(s))
      .map(s => s.trim())
      .slice(0, 3);
  }


  /**
   * Get the most relevant insights for synthesis using LLM Analytics
   * OPTIMIZED: Centralized intelligent summary generation
   */
  private async getRelevantInsightsForSynthesis(sessionId: string, originalQuery: string): Promise<string[]> {
    try {
      const state = await this.getConversationState(sessionId);
      if (!state) return [];

      const insights: string[] = [];
      
      // Priority: Use structured solutions if available
      const structuredSolutions = await this.getStructuredSolutions(sessionId);
      if (structuredSolutions.size > 0) {
        this.logger.info(`🎯 Using ${structuredSolutions.size} structured solutions for synthesis insights`);
        insights.push('=== FINAL STRUCTURED SOLUTIONS ===\n');
        
        for (const [modelId, solution] of structuredSolutions.entries()) {
          insights.push(`**${modelId} Conclusive Answer:**
- **Answer:** ${solution.value}
- **Confidence:** ${solution.confidence}
- **Status:** ${solution.status}
- **Reasoning:** ${solution.reasoning || 'N/A'}\n`);
        }
      } else if (this.llmAnalytics) {
        // Use LLM Analytics for intelligent summarization
        this.logger.info(`🧠 Using LLM Analytics for synthesis preparation`);
        
        const conclusiveTurns = state.turns.filter(turn => 
          turn.phase === CollaborationPhase.SYNTHESIZE || 
          turn.phase === CollaborationPhase.CONSENSUS ||
          turn.phase === CollaborationPhase.REVISE
        ).slice(-3); // Get last 3 conclusive turns

        if (conclusiveTurns.length > 0) {
          insights.push('=== INTELLIGENT SYNTHESIS SUMMARY ===\n');
          
          // Use centralized LLM Analytics service
          const summary = await this.llmAnalytics.createSynthesisSummary(
            conclusiveTurns,
            originalQuery,
            400 // Target tokens for synthesis context
          );
          
          if (summary) {
            insights.push(summary);
          }
        }
      } else {
        // Fallback to simple truncation
        this.logger.warn('LLM Analytics not available, using simple truncation');
        
        const conclusiveTurns = state.turns.filter(turn => 
          turn.phase === CollaborationPhase.SYNTHESIZE || 
          turn.phase === CollaborationPhase.CONSENSUS ||
          turn.phase === CollaborationPhase.REVISE
        ).slice(-2);

        if (conclusiveTurns.length > 0) {
          insights.push('=== SUMMARIZED SOLUTIONS ===\n');
          for (const turn of conclusiveTurns) {
            const summary = this.tokenCounter.truncateToTokenLimit(turn.content, 250);
            insights.push(`**[${turn.phase}] ${turn.modelId}:**\n${summary}...\n`);
          }
        }
      }

      // Add key discussion points for additional context
      if (this.llmAnalytics) {
        // Use enhanced query for better context retrieval
        const enhancedQuery = await this.llmAnalytics.generateHypotheticalDocument(
          originalQuery,
          undefined,
          CollaborationPhase.SYNTHESIZE
        );
        
        const contextualTurns = await this.vectorStore.search(enhancedQuery, { sessionId }, 3);
        const earlyPhaseTurns = contextualTurns.filter(turn => {
          const phase = turn.metadata.phase as CollaborationPhase;
          return phase === CollaborationPhase.BRAINSTORM || phase === CollaborationPhase.CRITIQUE;
        });

        if (earlyPhaseTurns.length > 0) {
          insights.push('\n=== KEY DISCUSSION POINTS ===\n');
          for (const turn of earlyPhaseTurns) {
            const modelId = turn.metadata.modelId as string;
            const phase = turn.metadata.phase as CollaborationPhase;
            insights.push(`- **[${phase}]** ${modelId}: ${this.tokenCounter.truncateToTokenLimit(turn.content, 100)}...`);
          }
        }
      }

      return insights;
      
    } catch (error) {
      this.logger.error('Error retrieving insights for synthesis:', error);
      
      const state = await this.getConversationState(sessionId);
      if (!state) return [];
      
      // Simple fallback
      const recentTurns = state.turns.slice(-4);
      return recentTurns.map(turn => 
        `**[${turn.phase}] ${turn.modelId}:** ${this.tokenCounter.truncateToTokenLimit(turn.content, 200)}...`
      );
    }
  }


  /**
   * Phase 2: Deterministic retrieval of final answers
   * Returns turns marked as final answers with structured solutions
   */
  async getFinalAnswers(sessionId: string): Promise<ConversationTurn[]> {
    const state = await this.getConversationState(sessionId);
    if (!state) return [];

    // Get all turns marked as final answers
    const finalAnswers = state.turns.filter(turn => 
      turn.metadata.isFinalAnswer === true ||
      turn.metadata.structuredSolution?.status === 'conclusive'
    );

    this.logger.info(`📋 Found ${finalAnswers.length} final answer turns`);
    return finalAnswers;
  }

  /**
   * Phase 2: Get structured solutions for synthesis
   * Returns a map of model ID to their structured solution
   */
  async getStructuredSolutions(sessionId: string): Promise<Map<string, StructuredSolution>> {
    const finalAnswers = await this.getFinalAnswers(sessionId);
    const solutions = new Map<string, StructuredSolution>();

    for (const turn of finalAnswers) {
      if (turn.metadata.structuredSolution) {
        // Keep the most recent solution for each model
        solutions.set(turn.modelId, turn.metadata.structuredSolution);
      }
    }

    this.logger.info(`🎯 Retrieved structured solutions for ${solutions.size} models`);
    return solutions;
  }

  async clearConversation(sessionId: string): Promise<void> {
    await this.vectorStore.deleteSession(sessionId);
    
    const stateKey = `${this.stateKeyPrefix}${sessionId}`;
    await this.redisService.getClient().del(stateKey);
    
    // Clean up turn keys (would need pattern matching in a real implementation)
    this.logger.info(`🧹 Cleared conversation ${sessionId}`);
  }
}
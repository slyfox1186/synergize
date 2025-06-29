/**
 * DEVIL'S ADVOCATE SERVICE
 * 
 * Single source of truth for critical analysis and phase transition decisions.
 * This service handles the devil's advocate scanning process where GEMMA critically
 * analyzes responses and makes intelligent phase transition decisions based on
 * verification requirements and error detection.
 */

import { ModelService } from './modelService.js';
import { ConversationStateManager } from './conversationStateManager.js';
import { PromptFormatter } from './promptFormatter.js';
import { StreamingService } from './streamingService.js';
import { 
  CollaborationPhase, 
  SSEMessage, 
  SSEMessageType
} from '../models/types.js';
import { LlamaContext } from 'node-llama-cpp';
import { createLogger } from '../utils/logger.js';

export interface PhaseDecisionResult {
  shouldTransition: boolean;
  targetPhase?: CollaborationPhase;
  reasoning: string;
  criticalIssuesFound: string[];
  verificationStatus: 'PASSED' | 'FAILED' | 'INCOMPLETE';
}

export interface DevilsAdvocateOptions {
  sessionId: string;
  currentPhase: CollaborationPhase;
  responseToAnalyze: string;
  analyzerModelId: string;
  conversationContext?: string;
}

export interface CriticalAnalysisResult {
  hasErrors: boolean;
  errorTypes: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendations: string[];
  phaseDecision: PhaseDecisionResult;
}

/**
 * Dedicated service for devil's advocate analysis and phase decision making
 * Ensures consistent critical evaluation and intelligent phase transitions
 */
export class DevilsAdvocateService {
  private logger = createLogger('DevilsAdvocateService');

  constructor(
    private modelService: ModelService,
    private conversationManager: ConversationStateManager,
    _streamingService: StreamingService,
    private sendMessage: (message: SSEMessage) => void
  ) {
    this.logger.info('👹 DevilsAdvocateService initialized - ready for critical analysis');
  }

  /**
   * Perform comprehensive devil's advocate analysis
   */
  async performCriticalAnalysis(options: DevilsAdvocateOptions): Promise<CriticalAnalysisResult> {
    this.logger.info('👹 Starting devil\'s advocate critical analysis', {
      sessionId: options.sessionId,
      currentPhase: options.currentPhase,
      analyzerModel: options.analyzerModelId,
      responseLength: options.responseToAnalyze.length
    });

    try {
      // Get conversation context if not provided
      let conversationContext = options.conversationContext;
      if (!conversationContext) {
        const conversationPrompt = await this.conversationManager.buildConversationPrompt(
          options.sessionId,
          options.analyzerModelId
        );
        conversationContext = conversationPrompt.conversationContext || '';
      }

      // Generate the phase decision prompt
      const decisionPrompt = this.createPhaseDecisionPrompt(
        options.currentPhase,
        options.responseToAnalyze,
        conversationContext
      );

      // Acquire model context
      const context = await this.modelService.acquireContext(options.analyzerModelId);
      
      try {
        // Generate the critical analysis and phase decision
        const phaseDecision = await this.generatePhaseDecision(
          options.analyzerModelId,
          context,
          decisionPrompt
        );

        // Analyze the decision for critical issues
        const analysisResult = this.analyzeDecisionForCriticalIssues(
          phaseDecision,
          options.responseToAnalyze
        );

        this.logger.info('✅ Devil\'s advocate analysis completed', {
          shouldTransition: phaseDecision.shouldTransition,
          targetPhase: phaseDecision.targetPhase,
          hasErrors: analysisResult.hasErrors,
          severity: analysisResult.severity,
          verificationStatus: phaseDecision.verificationStatus
        });

        return analysisResult;

      } finally {
        this.modelService.releaseContext(options.analyzerModelId, context);
      }

    } catch (error) {
      this.logger.error('❌ Devil\'s advocate analysis failed', {
        sessionId: options.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return a safe fallback result
      return this.createFallbackAnalysisResult(options.currentPhase);
    }
  }

  /**
   * Create comprehensive phase decision prompt with verification focus
   */
  private createPhaseDecisionPrompt(
    currentPhase: CollaborationPhase,
    responseToAnalyze: string,
    conversationContext: string
  ): string {
    return `You are performing CRITICAL DEVIL'S ADVOCATE analysis with VERIFICATION requirements.

**Current Phase:** ${currentPhase}

**Response to Analyze:**
${responseToAnalyze.substring(0, 1000)}${responseToAnalyze.length > 1000 ? '...' : ''}

**Recent Conversation Context:**
${conversationContext.substring(0, 800)}${conversationContext.length > 800 ? '...' : ''}

**CRITICAL VERIFICATION CHECKLIST:**
□ Are all mathematical claims verified and correct?
□ Are logical statements internally consistent?
□ For geometry: Do angle sums check out? Are parallel line properties satisfied?
□ For algebra: Are equations balanced and solved correctly?
□ For word problems: Is the problem solvable as stated?
□ Are there any computational errors or incorrect assumptions?
□ Is the reasoning sound and complete?

**DEVIL'S ADVOCATE ANALYSIS TASKS:**
1. **ERROR DETECTION:** Identify any mathematical, logical, or reasoning errors
2. **VERIFICATION STATUS:** Check if all claims are properly verified
3. **COMPLETENESS:** Assess if the response fully addresses the problem
4. **CONSISTENCY:** Verify internal logical consistency
5. **PHASE APPROPRIATENESS:** Determine if phase objectives are met

**Available Phase Options:**
- BRAINSTORM: Generate diverse ideas and approaches
- CRITIQUE: Analyze and provide constructive feedback (ERROR CORRECTION)
- REVISE: Refine ideas based on feedback
- SYNTHESIZE: Combine best elements into unified solution
- CONSENSUS: Finalize collaborative conclusion

**ULTRA-INTELLIGENT PHASE TRANSITION FREEDOM:**
You have COMPLETE AUTONOMY to jump to ANY phase that best serves the problem-solving process!

**PHASE JUMP SCENARIOS:**

1. **INSTANT CONSENSUS** (BRAINSTORM → CONSENSUS):
   - Both models immediately arrive at the same VERIFIED answer
   - 100% confidence with mathematical proof
   - No need for further discussion - jump straight to final answer!

2. **SKIP TO SYNTHESIS** (Any Phase → SYNTHESIZE):
   - Multiple valid approaches discovered
   - Ready to combine best elements
   - No errors found, just need integration

3. **EMERGENCY CRITIQUE** (Any Phase → CRITIQUE):
   - Critical error detected at ANY point
   - Mathematical incorrectness found
   - Logical fallacy discovered

4. **STRATEGIC BACKTRACK** (Any Phase → BRAINSTORM):
   - Realize we're solving the wrong problem
   - Need completely fresh approach
   - Current path is a dead end

5. **RAPID REVISION** (CRITIQUE → REVISE):
   - Errors identified and solutions clear
   - Skip additional critique rounds

6. **CONFIDENCE SKIP** (REVISE → CONSENSUS):
   - Revision perfectly addresses all issues
   - Both models now agree completely
   - Skip synthesis, go to final answer

**DECISION FACTORS:**
- **Problem Complexity**: Simple problems can skip phases
- **Model Agreement**: High agreement enables phase jumping
- **Confidence Level**: 100% verified confidence allows shortcuts
- **Error Severity**: Critical errors force immediate CRITIQUE
- **Time Efficiency**: Jump phases when it saves unnecessary work

**YOUR MISSION**: Choose the OPTIMAL phase for maximum efficiency and accuracy!
Don't follow a rigid sequence - be INTELLIGENT and ADAPTIVE!

**CRITICAL ISSUES TO FLAG:**
- Incorrect mathematical calculations
- Flawed logical reasoning
- Unsubstantiated claims
- Missing verification steps
- Contradictory statements
- Incomplete problem solving

**Required Response Format:**
DECISION: [CONTINUE|TRANSITION]
TARGET_PHASE: [if transitioning, specify: BRAINSTORM|CRITIQUE|REVISE|SYNTHESIZE|CONSENSUS]
VERIFICATION_STATUS: [PASSED|FAILED|INCOMPLETE]
CRITICAL_ISSUES: [List any critical errors or issues found, or "NONE" if clean]
REASONING: [Detailed explanation of decision including verification findings]

Respond ONLY in the above format. Be thorough in error detection - it's better to catch false positives than miss real errors.`;
  }

  /**
   * Generate phase decision using the model
   */
  private async generatePhaseDecision(
    modelId: string,
    context: LlamaContext,
    prompt: string
  ): Promise<PhaseDecisionResult> {
    const modelConfig = this.modelService.getModelConfig(modelId);
    if (!modelConfig) {
      throw new Error(`Model config not found for ${modelId}`);
    }

    // Format the prompt
    const systemPrompt = 'You are a critical analyst performing devil\'s advocate verification. Be thorough in error detection and verification.';
    const formatted = PromptFormatter.formatPrompt(modelConfig, systemPrompt, prompt);

    // Generate response
    const { LlamaChatSession } = await import('node-llama-cpp');
    const sequence = context.getSequence();
    
    try {
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: ''
      });

      const response = await session.prompt(formatted.prompt, {
        temperature: 0.3, // Lower temperature for more consistent analysis
        maxTokens: 800,
        customStopTriggers: formatted.stopTokens
      });

      return this.parsePhaseDecisionResponse(response);
    } finally {
      // CRITICAL: Always dispose of the sequence to prevent "No sequences left" error
      sequence.dispose();
    }
  }

  /**
   * Parse the model's phase decision response
   */
  private parsePhaseDecisionResponse(response: string): PhaseDecisionResult {
    this.logger.debug('📋 Parsing phase decision response', {
      responseLength: response.length,
      preview: response.substring(0, 200)
    });

    try {
      const lines = response.split('\n').map(line => line.trim()).filter(line => line);
      
      let shouldTransition = false;
      let targetPhase: CollaborationPhase | undefined;
      let reasoning = '';
      let criticalIssuesFound: string[] = [];
      let verificationStatus: 'PASSED' | 'FAILED' | 'INCOMPLETE' = 'INCOMPLETE';

      for (const line of lines) {
        if (line.startsWith('DECISION:')) {
          const decision = line.replace('DECISION:', '').trim();
          shouldTransition = decision.toUpperCase().includes('TRANSITION');
        } else if (line.startsWith('TARGET_PHASE:')) {
          const phase = line.replace('TARGET_PHASE:', '').trim();
          if (phase && phase !== 'NONE') {
            targetPhase = phase as CollaborationPhase;
          }
        } else if (line.startsWith('VERIFICATION_STATUS:')) {
          const status = line.replace('VERIFICATION_STATUS:', '').trim().toUpperCase();
          if (status === 'PASSED' || status === 'FAILED' || status === 'INCOMPLETE') {
            verificationStatus = status as 'PASSED' | 'FAILED' | 'INCOMPLETE';
          }
        } else if (line.startsWith('CRITICAL_ISSUES:')) {
          const issues = line.replace('CRITICAL_ISSUES:', '').trim();
          if (issues && issues !== 'NONE') {
            criticalIssuesFound = issues.split(',').map(issue => issue.trim()).filter(issue => issue);
          }
        } else if (line.startsWith('REASONING:')) {
          reasoning = line.replace('REASONING:', '').trim();
        }
      }

      // If no explicit reasoning found, use the whole response
      if (!reasoning) {
        reasoning = response.substring(0, 300);
      }

      return {
        shouldTransition,
        targetPhase,
        reasoning,
        criticalIssuesFound,
        verificationStatus
      };

    } catch (error) {
      this.logger.warn('⚠️ Failed to parse phase decision response, using fallback', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        shouldTransition: false,
        targetPhase: undefined,
        reasoning: 'Failed to parse decision response - continuing current phase for safety',
        criticalIssuesFound: [],
        verificationStatus: 'FAILED'
      };
    }
  }

  /**
   * Analyze the decision for critical issues and create comprehensive result
   */
  private analyzeDecisionForCriticalIssues(
    phaseDecision: PhaseDecisionResult,
    _originalResponse: string
  ): CriticalAnalysisResult {
    const hasErrors = phaseDecision.criticalIssuesFound.length > 0 || 
                     phaseDecision.verificationStatus === 'FAILED';
    
    const errorTypes = phaseDecision.criticalIssuesFound.map(issue => {
      if (issue.toLowerCase().includes('mathematical') || issue.toLowerCase().includes('calculation')) {
        return 'MATHEMATICAL_ERROR';
      } else if (issue.toLowerCase().includes('logical') || issue.toLowerCase().includes('reasoning')) {
        return 'LOGICAL_ERROR';
      } else if (issue.toLowerCase().includes('verification') || issue.toLowerCase().includes('unverified')) {
        return 'VERIFICATION_MISSING';
      } else {
        return 'GENERAL_ISSUE';
      }
    });

    // Determine severity based on verification status and critical issues
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (phaseDecision.verificationStatus === 'FAILED') {
      severity = 'CRITICAL';
    } else if (phaseDecision.criticalIssuesFound.length > 2) {
      severity = 'HIGH';
    } else if (phaseDecision.criticalIssuesFound.length > 0) {
      severity = 'MEDIUM';
    } else {
      severity = 'LOW';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (hasErrors) {
      recommendations.push('Force transition to CRITIQUE phase for error correction');
      recommendations.push('Require verification of all mathematical claims');
      recommendations.push('Address logical inconsistencies before proceeding');
    } else if (phaseDecision.verificationStatus === 'INCOMPLETE') {
      recommendations.push('Complete verification steps before phase transition');
      recommendations.push('Ensure all claims are substantiated');
    } else {
      recommendations.push('Response quality is acceptable for phase progression');
    }

    return {
      hasErrors,
      errorTypes,
      severity,
      recommendations,
      phaseDecision
    };
  }

  /**
   * Create fallback analysis result when main analysis fails
   */
  private createFallbackAnalysisResult(_currentPhase: CollaborationPhase): CriticalAnalysisResult {
    return {
      hasErrors: false,
      errorTypes: [],
      severity: 'LOW',
      recommendations: ['Analysis failed - continue with current phase for safety'],
      phaseDecision: {
        shouldTransition: false,
        targetPhase: undefined,
        reasoning: 'Devil\'s advocate analysis failed - continuing current phase as safety measure',
        criticalIssuesFound: [],
        verificationStatus: 'INCOMPLETE'
      }
    };
  }

  /**
   * Send phase transition notification
   */
  async notifyPhaseTransition(
    sessionId: string,
    fromPhase: CollaborationPhase,
    toPhase: CollaborationPhase,
    reasoning: string
  ): Promise<void> {
    this.logger.info('🔄 Devil\'s advocate initiated phase transition', {
      sessionId,
      fromPhase,
      toPhase,
      reasoning: reasoning.substring(0, 100)
    });

    this.sendMessage({
      type: SSEMessageType.PHASE_UPDATE,
      payload: { 
        phase: toPhase, 
        status: 'devils_advocate_transition',
        reasoning,
        previousPhase: fromPhase
      }
    });
  }

  /**
   * Force critique phase when critical errors are detected
   */
  async forceCritiquePhase(
    sessionId: string,
    currentPhase: CollaborationPhase,
    criticalIssues: string[]
  ): Promise<void> {
    this.logger.warn('⚠️ Devil\'s advocate forcing CRITIQUE phase due to critical issues', {
      sessionId,
      currentPhase,
      criticalIssues
    });

    this.sendMessage({
      type: SSEMessageType.PHASE_UPDATE,
      payload: { 
        phase: CollaborationPhase.CRITIQUE, 
        status: 'forced_critique',
        reasoning: `Critical issues detected: ${criticalIssues.join(', ')}`,
        previousPhase: currentPhase
      }
    });
  }
}
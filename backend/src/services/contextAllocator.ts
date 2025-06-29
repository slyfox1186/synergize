import { TokenCounter } from './tokenCounter.js';
import { CollaborationPhase } from '../models/types.js';
import { createLogger } from '../utils/logger.js';

/**
 * TOKEN ALLOCATION RESULT
 */
export interface TokenAllocation {
  maxGenerationTokens: number;
  historyTokenBudget: number;
  actualHistoryTokens: number;
  promptTemplateTokens: number;
  safetyMarginTokens: number;
  totalAllocated: number;
  phase: CollaborationPhase;
  debugInfo: {
    totalContextSize: number;
    phaseConfig: PhaseConfig;
    calculationSteps: string[];
  };
}

/**
 * PHASE-SPECIFIC CONFIGURATION
 */
interface PhaseConfig {
  historyAllocationRatio: number;
  minGenerationTokens: number;
  description: string;
}

/**
 * PROFESSIONAL CONTEXT ALLOCATOR SERVICE
 * 
 * Implements Gemini's sophisticated budget-based token allocation algorithm.
 * Ensures we NEVER exceed context window limits through precise calculations
 * and phase-specific allocation strategies.
 */
export class ContextAllocator {
  private readonly logger = createLogger('ContextAllocator');
  private readonly tokenCounter: TokenCounter;

  /**
   * PHASE-SPECIFIC ALLOCATION CONFIGURATIONS
   * Based on Gemini Pro's recommendations for optimal collaboration
   */
  private static readonly PHASE_CONFIG: Record<CollaborationPhase, PhaseConfig> = {
    [CollaborationPhase.IDLE]: {
      historyAllocationRatio: 0.30,
      minGenerationTokens: 800,
      description: 'Balanced allocation for initial setup'
    },
    [CollaborationPhase.BRAINSTORM]: {
      historyAllocationRatio: 0.35,
      minGenerationTokens: 1200,
      description: 'More generation space for creative ideas'
    },
    [CollaborationPhase.CRITIQUE]: {
      historyAllocationRatio: 0.40,
      minGenerationTokens: 1200,
      description: 'Balanced context and generation for analysis'
    },
    [CollaborationPhase.REVISE]: {
      historyAllocationRatio: 0.35,
      minGenerationTokens: 1200,
      description: 'Space for comprehensive revisions'
    },
    [CollaborationPhase.SYNTHESIZE]: {
      historyAllocationRatio: 0.25,
      minGenerationTokens: 1500,
      description: 'Maximum generation space for synthesis'
    },
    [CollaborationPhase.CONSENSUS]: {
      historyAllocationRatio: 0.30,
      minGenerationTokens: 1300,
      description: 'Large space for final comprehensive output'
    },
    [CollaborationPhase.COMPLETE]: {
      historyAllocationRatio: 0.20,
      minGenerationTokens: 500,
      description: 'Minimal history, focus on completion'
    }
  };

  /**
   * SAFETY MARGIN PERCENTAGE
   * 5% of total context to prevent edge case overflows
   */
  private static readonly SAFETY_MARGIN_PERCENT = 0.05;

  /**
   * PROMPT TEMPLATE STRUCTURE
   * Used to calculate fixed template token overhead
   */
  private static readonly PROMPT_TEMPLATE_BASE = `You are {modelId}, collaborating with {otherModelId} in a structured problem-solving conversation.

**Current Phase:** {phase}
**Turn:** {turnNumber}

{conversationContext}

{currentTurn}`;

  constructor(tokenCounter: TokenCounter) {
    this.tokenCounter = tokenCounter;
    this.logger.info('🧮 ContextAllocator initialized with Gemini\'s budget-based algorithm');
  }

  /**
   * CALCULATE OPTIMAL TOKEN ALLOCATION
   * 
   * Implements Gemini's formula:
   * max_gen_tokens = total_context - (history_tokens + prompt_template_tokens + safety_margin_tokens)
   */
  calculateAllocation(
    phase: CollaborationPhase,
    totalContextSize: number,
    conversationHistory: string = '',
    modelId: string = 'model',
    otherModelId: string = 'partner',
    turnNumber: number = 1
  ): TokenAllocation {
    const calculationSteps: string[] = [];
    const phaseConfig = ContextAllocator.PHASE_CONFIG[phase];
    
    calculationSteps.push(`Starting allocation for ${phase} phase`);
    calculationSteps.push(`Total context size: ${totalContextSize} tokens`);
    calculationSteps.push(`Phase config: ${phaseConfig.description}`);

    // Step 1: Calculate safety margin
    const safetyMarginTokens = Math.ceil(totalContextSize * ContextAllocator.SAFETY_MARGIN_PERCENT);
    calculationSteps.push(`Safety margin (5%): ${safetyMarginTokens} tokens`);

    // Step 2: Calculate prompt template token overhead
    const promptTemplateTokens = this.calculatePromptTemplateTokens(modelId, otherModelId, phase, turnNumber);
    calculationSteps.push(`Prompt template overhead: ${promptTemplateTokens} tokens`);

    // Step 3: Calculate available space for history and generation
    const availableForContent = totalContextSize - promptTemplateTokens - safetyMarginTokens;
    calculationSteps.push(`Available for content: ${availableForContent} tokens`);

    // Step 4: Calculate minimum space needed for generation
    const minGenerationTokens = phaseConfig.minGenerationTokens;
    calculationSteps.push(`Minimum generation required: ${minGenerationTokens} tokens`);

    // Step 5: Calculate maximum history budget with hard limit
    const maxHistoryFromRatio = Math.floor(availableForContent * phaseConfig.historyAllocationRatio);
    const maxHistoryFromGenRequirement = availableForContent - minGenerationTokens;
    // Hard limit: never use more than 50% of total context for history
    const hardHistoryLimit = Math.floor(totalContextSize * 0.5);
    const historyTokenBudget = Math.min(maxHistoryFromRatio, maxHistoryFromGenRequirement, hardHistoryLimit);
    
    calculationSteps.push(`History budget from ratio (${(phaseConfig.historyAllocationRatio * 100).toFixed(0)}%): ${maxHistoryFromRatio} tokens`);
    calculationSteps.push(`History budget from gen requirement: ${maxHistoryFromGenRequirement} tokens`);
    calculationSteps.push(`Hard history limit (50% of context): ${hardHistoryLimit} tokens`);
    calculationSteps.push(`Final history budget: ${historyTokenBudget} tokens`);

    // Step 6: Calculate actual history tokens used
    const actualHistoryTokens = this.calculateActualHistoryTokens(conversationHistory, historyTokenBudget);
    calculationSteps.push(`Actual history tokens: ${actualHistoryTokens} tokens`);

    // Step 7: Calculate final generation limit using Gemini's master formula
    const maxGenerationTokens = totalContextSize - (actualHistoryTokens + promptTemplateTokens + safetyMarginTokens);
    calculationSteps.push(`Final generation limit: ${maxGenerationTokens} tokens`);

    // Step 8: Ensure minimum generation requirement is met
    const finalGenerationTokens = Math.max(maxGenerationTokens, minGenerationTokens);
    if (finalGenerationTokens > maxGenerationTokens) {
      calculationSteps.push(`Enforced minimum generation: ${finalGenerationTokens} tokens`);
    }

    // Step 9: Calculate total allocation for verification
    const totalAllocated = actualHistoryTokens + promptTemplateTokens + finalGenerationTokens + safetyMarginTokens;
    calculationSteps.push(`Total allocated: ${totalAllocated}/${totalContextSize} tokens`);

    // Step 10: Validate allocation doesn't exceed context window
    if (totalAllocated > totalContextSize) {
      const overflow = totalAllocated - totalContextSize;
      this.logger.error(`❌ ALLOCATION OVERFLOW: ${overflow} tokens over limit!`);
      calculationSteps.push(`⚠️ OVERFLOW DETECTED: ${overflow} tokens`);
      
      // Emergency correction: reduce history to fit
      const correctedHistoryTokens = Math.max(0, actualHistoryTokens - overflow);
      const correctedTotalAllocated = correctedHistoryTokens + promptTemplateTokens + finalGenerationTokens + safetyMarginTokens;
      
      calculationSteps.push(`Emergency correction: reduced history to ${correctedHistoryTokens} tokens`);
      calculationSteps.push(`Corrected total: ${correctedTotalAllocated} tokens`);
      
      return {
        maxGenerationTokens: finalGenerationTokens,
        historyTokenBudget: historyTokenBudget,
        actualHistoryTokens: correctedHistoryTokens,
        promptTemplateTokens,
        safetyMarginTokens,
        totalAllocated: correctedTotalAllocated,
        phase,
        debugInfo: {
          totalContextSize,
          phaseConfig,
          calculationSteps
        }
      };
    }

    // Success: allocation fits within limits
    this.logger.info(`✅ ${phase} allocation: ${actualHistoryTokens}h + ${finalGenerationTokens}g + ${promptTemplateTokens}p + ${safetyMarginTokens}s = ${totalAllocated}/${totalContextSize}`);

    return {
      maxGenerationTokens: finalGenerationTokens,
      historyTokenBudget: historyTokenBudget,
      actualHistoryTokens,
      promptTemplateTokens,
      safetyMarginTokens,
      totalAllocated,
      phase,
      debugInfo: {
        totalContextSize,
        phaseConfig,
        calculationSteps
      }
    };
  }

  /**
   * CALCULATE PROMPT TEMPLATE TOKEN OVERHEAD
   */
  private calculatePromptTemplateTokens(
    modelId: string,
    otherModelId: string,
    phase: CollaborationPhase,
    turnNumber: number
  ): number {
    // Create a sample prompt to measure template overhead
    const samplePrompt = ContextAllocator.PROMPT_TEMPLATE_BASE
      .replace('{modelId}', modelId)
      .replace('{otherModelId}', otherModelId)
      .replace('{phase}', phase)
      .replace('{turnNumber}', turnNumber.toString())
      .replace('{conversationContext}', '') // Empty for template measurement
      .replace('{currentTurn}', ''); // Empty for template measurement

    return this.tokenCounter.countTokens(samplePrompt);
  }

  /**
   * CALCULATE ACTUAL HISTORY TOKENS WITHIN BUDGET
   */
  private calculateActualHistoryTokens(conversationHistory: string, historyTokenBudget: number): number {
    if (!conversationHistory || conversationHistory.length === 0) {
      return 0;
    }

    const totalHistoryTokens = this.tokenCounter.countTokens(conversationHistory);
    
    if (totalHistoryTokens <= historyTokenBudget) {
      return totalHistoryTokens;
    }

    // History exceeds budget, need to truncate
    // This should be handled by the calling code, but we measure what would fit
    return historyTokenBudget;
  }

  /**
   * TRUNCATE HISTORY TO FIT WITHIN TOKEN BUDGET
   */
  truncateHistoryToBudget(conversationHistory: string, historyTokenBudget: number): string {
    if (!conversationHistory || historyTokenBudget <= 0) {
      return '';
    }

    const currentTokens = this.tokenCounter.countTokens(conversationHistory);
    if (currentTokens <= historyTokenBudget) {
      return conversationHistory;
    }

    // Use tiktoken's precise truncation
    return this.tokenCounter.truncateToTokenLimit(conversationHistory, historyTokenBudget);
  }

  /**
   * GET PHASE CONFIGURATION
   */
  getPhaseConfig(phase: CollaborationPhase): PhaseConfig {
    return ContextAllocator.PHASE_CONFIG[phase];
  }

  /**
   * GET ALL PHASE CONFIGURATIONS
   */
  getAllPhaseConfigs(): Record<CollaborationPhase, PhaseConfig> {
    return ContextAllocator.PHASE_CONFIG;
  }

  /**
   * VALIDATE ALLOCATION RESULT
   */
  validateAllocation(allocation: TokenAllocation): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (allocation.totalAllocated > allocation.debugInfo.totalContextSize) {
      issues.push(`Total allocation (${allocation.totalAllocated}) exceeds context size (${allocation.debugInfo.totalContextSize})`);
    }

    if (allocation.maxGenerationTokens < allocation.debugInfo.phaseConfig.minGenerationTokens) {
      issues.push(`Generation tokens (${allocation.maxGenerationTokens}) below minimum (${allocation.debugInfo.phaseConfig.minGenerationTokens})`);
    }

    if (allocation.actualHistoryTokens > allocation.historyTokenBudget) {
      issues.push(`History tokens (${allocation.actualHistoryTokens}) exceed budget (${allocation.historyTokenBudget})`);
    }

    if (allocation.safetyMarginTokens < 10) {
      issues.push(`Safety margin (${allocation.safetyMarginTokens}) too small`);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * CLEAN UP RESOURCES
   */
  dispose(): void {
    this.logger.info('🧹 ContextAllocator disposed');
  }
}
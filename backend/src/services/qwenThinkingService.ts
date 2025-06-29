/**
 * QWEN THINKING SERVICE
 * 
 * Single source of truth for Qwen3 LLM calls with thinking mode enabled.
 * This service handles all Qwen3 operations that require deep thinking,
 * particularly final verification and complex analysis tasks.
 * 
 * IMPORTANT: When thinking mode is enabled, Qwen3 uses different optimal settings:
 * - Temperature: 0.6 (vs 0.7 normally)
 * - TopP: 0.95 (vs 0.8 normally)
 * - TopK: 20 (same)
 * - MinP: 0 (same)
 */

import { ModelService } from './modelService.js';
import { StreamingService } from './streamingService.js';
import { ContextAllocator, TokenAllocation } from './contextAllocator.js';
import { TokenCounter } from './tokenCounter.js';
import { PromptFormatter, FormattedPrompt } from './promptFormatter.js';
import { 
  CollaborationPhase, 
  SSEMessage,
  ModelConfig
} from '../models/types.js';
import { LlamaContext, Token } from 'node-llama-cpp';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

export interface QwenThinkingOptions {
  sessionId: string;
  prompt: string;
  systemPrompt?: string;
  phase: CollaborationPhase;
  maxTokens?: number;
  tokenAllocation?: TokenAllocation;
  stream?: boolean;
  routeToSynthesis?: boolean;
}

export interface QwenThinkingResult {
  content: string;
  success: boolean;
  hadThinkingContent: boolean;
  thinkingTokens?: number;
  outputTokens?: number;
  tokenMetrics: {
    promptTokens: number;
    generatedTokens: number;
    totalTokens: number;
    generationTimeMs: number;
    tokensPerSecond: number;
  };
}

// Generation settings type
interface GenerationSettings {
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
}

// Optimal settings for Qwen3 with thinking mode enabled
const THINKING_MODE_SETTINGS: GenerationSettings = {
  temperature: 0.6,    // More focused than normal (0.7)
  topP: 0.95,         // Broader consideration than normal (0.8)
  topK: 20,           // Same as normal
  minP: 0,            // Same as normal
  repeatPenalty: 1.1  // Same as normal
};

/**
 * Dedicated service for Qwen3 thinking mode operations
 * Ensures consistent settings and behavior for deep thinking tasks
 */
export class QwenThinkingService {
  private logger = createLogger('QwenThinkingService');
  private contextAllocator: ContextAllocator;
  private tokenCounter: TokenCounter;
  private qwenModelId = 'qwen3-14b-ud-q4-k-xl';

  constructor(
    private modelService: ModelService,
    private streamingService: StreamingService,
    _sendMessage: (message: SSEMessage) => void
  ) {
    this.tokenCounter = new TokenCounter();
    this.contextAllocator = new ContextAllocator(this.tokenCounter);
    
    this.logger.info('🧠 QwenThinkingService initialized with optimal thinking mode settings', {
      settings: THINKING_MODE_SETTINGS
    });
  }

  /**
   * Execute Qwen3 with thinking mode enabled
   * This is the primary method for all thinking-enabled operations
   */
  async executeWithThinking(options: QwenThinkingOptions): Promise<QwenThinkingResult> {
    const startTime = Date.now();
    let context: LlamaContext | null = null;
    
    try {
      this.logger.info('🤔 Starting Qwen3 thinking mode execution', {
        sessionId: options.sessionId,
        phase: options.phase,
        promptLength: options.prompt.length,
        stream: options.stream ?? true
      });

      // Verify Qwen3 model is available
      const modelConfig = this.modelService.getModelConfig(this.qwenModelId);
      if (!modelConfig) {
        throw new Error(`Qwen3 model ${this.qwenModelId} not found`);
      }

      // Acquire model context
      context = await this.modelService.acquireContext(this.qwenModelId);
      this.logger.info('🧠 Qwen3 context acquired for thinking mode');

      // Calculate token allocation if not provided
      let allocation = options.tokenAllocation;
      if (!allocation) {
        const promptTokens = this.tokenCounter.countTokens(options.prompt);
        allocation = this.contextAllocator.calculateAllocation(
          options.phase,
          config.model.contextSize || 8192,
          '',
          this.qwenModelId,
          'verification',
          0
        );
        
        this.logger.info('📊 Calculated token allocation for thinking mode', {
          promptTokens,
          maxGenerationTokens: allocation.maxGenerationTokens
        });
      }

      // Format prompt with thinking mode enabled (skipNoThink = true)
      const formatted = PromptFormatter.formatPrompt(
        modelConfig,
        options.systemPrompt || this.getDefaultSystemPrompt(options.phase),
        options.prompt,
        true // CRITICAL: Enable thinking mode by skipping /no_think
      );

      // Log thinking mode activation
      this.logger.info('🎯 Thinking mode ACTIVATED for Qwen3', {
        promptLength: formatted.prompt.length,
        userPromptContainsNoThink: formatted.prompt.includes('/no_think'),
        stopTokens: formatted.stopTokens
      });

      // Generate response with thinking mode settings
      const response = await this.generateWithThinkingMode(
        modelConfig,
        context,
        formatted,
        allocation,
        options
      );

      // Extract thinking content if present
      const { content, thinkingTokens, outputTokens } = this.extractThinkingContent(response);

      const endTime = Date.now();
      const generationTime = endTime - startTime;
      
      // Calculate metrics
      const promptTokens = this.tokenCounter.countTokens(formatted.prompt);
      const generatedTokens = this.tokenCounter.countTokens(response);
      const totalTokens = promptTokens + generatedTokens;
      const tokensPerSecond = Math.round((generatedTokens / generationTime) * 1000);

      this.logger.info('✅ Qwen3 thinking mode execution completed', {
        sessionId: options.sessionId,
        contentLength: content.length,
        hadThinkingContent: thinkingTokens > 0,
        thinkingTokens,
        outputTokens,
        tokenMetrics: {
          promptTokens,
          generatedTokens,
          totalTokens,
          generationTimeMs: generationTime,
          tokensPerSecond
        }
      });

      return {
        content,
        success: true,
        hadThinkingContent: thinkingTokens > 0,
        thinkingTokens,
        outputTokens,
        tokenMetrics: {
          promptTokens,
          generatedTokens,
          totalTokens,
          generationTimeMs: generationTime,
          tokensPerSecond
        }
      };

    } catch (error) {
      this.logger.error('❌ Qwen3 thinking mode execution failed', {
        sessionId: options.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        content: '',
        success: false,
        hadThinkingContent: false,
        tokenMetrics: {
          promptTokens: 0,
          generatedTokens: 0,
          totalTokens: 0,
          generationTimeMs: Date.now() - startTime,
          tokensPerSecond: 0
        }
      };

    } finally {
      // Always release context
      if (context) {
        this.modelService.releaseContext(this.qwenModelId, context);
        this.logger.info('🧠 Qwen3 context released');
      }
    }
  }

  /**
   * Perform final verification with thinking mode
   * This is the specialized verification method used in the synthesis phase
   */
  async performFinalVerification(
    sessionId: string,
    synthesisContent: string,
    conversationHistory: string
  ): Promise<QwenThinkingResult> {
    const verificationPrompt = this.buildVerificationPrompt(synthesisContent, conversationHistory);
    
    return this.executeWithThinking({
      sessionId,
      prompt: verificationPrompt,
      systemPrompt: this.getVerificationSystemPrompt(),
      phase: CollaborationPhase.SYNTHESIZE,
      stream: true,
      routeToSynthesis: false
    });
  }

  /**
   * Generate content with thinking mode settings
   */
  private async generateWithThinkingMode(
    _modelConfig: ModelConfig,
    context: LlamaContext,
    formatted: FormattedPrompt,
    allocation: TokenAllocation,
    options: QwenThinkingOptions
  ): Promise<string> {
    this.logger.info('🚀 Starting generation with thinking mode settings', {
      temperature: THINKING_MODE_SETTINGS.temperature,
      topP: THINKING_MODE_SETTINGS.topP,
      topK: THINKING_MODE_SETTINGS.topK,
      maxTokens: options.maxTokens || allocation.maxGenerationTokens
    });

    // Get a sequence for this generation
    const sequence = context.getSequence();
    
    try {
      // Create chat session
      const { LlamaChatSession } = await import('node-llama-cpp');
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: ''  // Prompt already includes system context
      });

      let tokenCount = 0;

      const generationOptions = {
        // Use THINKING MODE SETTINGS instead of normal settings
        temperature: THINKING_MODE_SETTINGS.temperature,
        topP: THINKING_MODE_SETTINGS.topP,
        topK: THINKING_MODE_SETTINGS.topK,
        minP: THINKING_MODE_SETTINGS.minP,
        repeatPenalty: {
          penalty: THINKING_MODE_SETTINGS.repeatPenalty,
          frequencyPenalty: 0,
          presencePenalty: 0
        },
        maxTokens: options.maxTokens || allocation.maxGenerationTokens,
        customStopTriggers: formatted.stopTokens,
        onToken: options.stream !== false ? (tokens: Token[]): void => {
          // Detokenize tokens
          const tokenText = context.model.detokenize(tokens, false);
          
          if (tokenText) {
            tokenCount += tokens.length;
            
            // Stream the token if enabled
            if (options.stream !== false) {
              this.streamingService.addToken(
                options.routeToSynthesis ? 'synthesis' : this.qwenModelId, 
                options.phase, 
                tokenText
              );
            }
          }
        } : undefined
      };

      // Generate response
      const response = await session.prompt(formatted.prompt, generationOptions);
      
      if (options.stream !== false) {
        // Complete the stream
        this.streamingService.completeStream(
          options.routeToSynthesis ? 'synthesis' : this.qwenModelId,
          options.phase
        );
      }

      this.logger.info('📝 Thinking mode generation completed', {
        responseLength: response.length,
        tokensGenerated: tokenCount
      });

      return response;
    } finally {
      // CRITICAL: Always dispose of the sequence to prevent "No sequences left" error
      sequence.dispose();
    }
  }

  /**
   * Extract thinking content from response
   * Qwen3's thinking appears between <think> and </think> tags
   */
  private extractThinkingContent(response: string): {
    content: string;
    thinkingTokens: number;
    outputTokens: number;
  } {
    const thinkStart = response.indexOf('<think>');
    const thinkEnd = response.indexOf('</think>');
    
    if (thinkStart !== -1 && thinkEnd !== -1 && thinkEnd > thinkStart) {
      const thinkingContent = response.substring(thinkStart + 7, thinkEnd);
      const outputContent = response.substring(thinkEnd + 8).trim();
      
      return {
        content: outputContent || response, // Fallback to full response if no output after thinking
        thinkingTokens: this.tokenCounter.countTokens(thinkingContent),
        outputTokens: this.tokenCounter.countTokens(outputContent)
      };
    }
    
    // No thinking tags found, return full response
    return {
      content: response,
      thinkingTokens: 0,
      outputTokens: this.tokenCounter.countTokens(response)
    };
  }

  /**
   * Build verification prompt for final synthesis checking
   */
  private buildVerificationPrompt(synthesisContent: string, conversationHistory: string): string {
    return `You are performing a CRITICAL FINAL VERIFICATION of the synthesis.

CONVERSATION CONTEXT:
${conversationHistory}

PROPOSED SYNTHESIS:
${synthesisContent}

VERIFICATION CHECKLIST:
1. Mathematical Accuracy: Are all calculations, formulas, and numerical claims correct?
2. Logical Consistency: Does the reasoning flow logically without contradictions?
3. Factual Correctness: Are all stated facts accurate and properly contextualized?
4. Completeness: Does the synthesis fully address the original question/request?
5. Clarity: Is the response clear and unambiguous?

IMPORTANT: Use your thinking capability to deeply analyze each point. If you find ANY errors, you must:
1. Clearly identify the specific error(s)
2. Explain why it's incorrect
3. Provide the correct information
4. Rate the severity (Critical/High/Medium/Low)

If everything is correct, confirm with "VERIFICATION PASSED: All checks completed successfully."

Perform your verification now:`;
  }

  /**
   * Get default system prompt for thinking mode
   */
  private getDefaultSystemPrompt(phase: CollaborationPhase): string {
    return `You are Qwen3, an advanced AI assistant with deep thinking capabilities enabled.
You are currently in the ${phase} phase of a collaborative problem-solving session.
Your thinking mode is ACTIVE - take time to reason through problems thoroughly before responding.
Focus on accuracy, logical consistency, and comprehensive analysis.`;
  }

  /**
   * Get specialized system prompt for verification
   */
  private getVerificationSystemPrompt(): string {
    return `You are Qwen3, serving as the final verification specialist.
Your thinking mode is FULLY ACTIVE - use your deep reasoning capabilities to catch any errors.
You must be extremely thorough and critical in your analysis.
Even small errors should be identified and corrected.
Your role is crucial for ensuring the quality and accuracy of the final response.`;
  }

  /**
   * Check if a response indicates verification failure
   */
  isVerificationFailure(response: string): boolean {
    const failureIndicators = [
      'error found',
      'incorrect',
      'inaccurate',
      'contradiction',
      'must be corrected',
      'failed verification',
      'critical issue',
      'high severity',
      'medium severity'
    ];
    
    const lowerResponse = response.toLowerCase();
    return failureIndicators.some(indicator => lowerResponse.includes(indicator));
  }

  /**
   * Extract error details from verification response
   */
  extractErrorDetails(response: string): {
    errors: Array<{
      description: string;
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      correction?: string;
    }>;
  } {
    const errors: Array<{
      description: string;
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      correction?: string;
    }> = [];

    // Parse structured error reports
    const errorPattern = /(?:Error|Issue|Problem):\s*([^\n]+)[\s\S]*?Severity:\s*(Critical|High|Medium|Low)/gi;
    let match;
    
    while ((match = errorPattern.exec(response)) !== null) {
      errors.push({
        description: match[1].trim(),
        severity: match[2] as 'Critical' | 'High' | 'Medium' | 'Low'
      });
    }

    // If no structured errors found, try to extract from general content
    if (errors.length === 0 && this.isVerificationFailure(response)) {
      errors.push({
        description: 'Verification failed - errors detected in synthesis',
        severity: 'High'
      });
    }

    return { errors };
  }
}
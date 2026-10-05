/**
 * FINAL ANSWER SERVICE
 * 
 * Single source of concern for handling final answer generation, streaming, and completion.
 * This service ensures consistent and reliable final answer delivery across the system.
 */

import { ModelService } from './modelService.js';
import { StreamingService } from './streamingService.js';
import { ContextAllocator, TokenAllocation } from './contextAllocator.js';
import { TokenCounter } from './tokenCounter.js';
import { 
  CollaborationPhase, 
  SSEMessage, 
  SSEMessageType
} from '../models/types.js';
import { LlamaContext, Token } from 'node-llama-cpp';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { PromptFormatter } from './promptFormatter.js';
import { buildJaneSystemPrompt, JanePromptVariant } from '../prompts/janePersona.js';

export interface FinalAnswerOptions {
  sessionId: string;
  modelId: string;
  prompt: string;
  phase: CollaborationPhase;
  tokenAllocation?: TokenAllocation;
  routeToSynthesis?: boolean;
}

export interface FinalAnswerResult {
  content: string;
  success: boolean;
  tokenMetrics: {
    promptTokens: number;
    generatedTokens: number;
    totalTokens: number;
    generationTimeMs: number;
    tokensPerSecond: number;
  };
}

/**
 * Dedicated service for final answer generation and streaming
 * Ensures reliable completion and streaming of final responses, spoken by Jane
 */
export class FinalAnswerService {
  private logger = createLogger('FinalAnswerService');
  private contextAllocator: ContextAllocator;
  private tokenCounter: TokenCounter;

  constructor(
    private modelService: ModelService,
    private streamingService: StreamingService,
    private sendMessage: (message: SSEMessage) => void
  ) {
    this.tokenCounter = new TokenCounter();
    this.contextAllocator = new ContextAllocator(this.tokenCounter);
    
    this.logger.info('📝 FinalAnswerService initialized');
  }

  /**
   * Generate and stream a final answer with guaranteed completion
   */
  async generateFinalAnswer(options: FinalAnswerOptions): Promise<FinalAnswerResult> {
    const startTime = Date.now();
    let context: LlamaContext | null = null;
    
    try {
      this.logger.info('🎯 Starting final answer generation', {
        sessionId: options.sessionId,
        modelId: options.modelId,
        phase: options.phase,
        routeToSynthesis: options.routeToSynthesis
      });

      // Acquire model context
      context = await this.modelService.acquireContext(options.modelId);
      this.logger.info('📤 Model context acquired for final answer generation');

      // Calculate token allocation if not provided
      let allocation = options.tokenAllocation;
      if (!allocation) {
        const promptTokens = this.tokenCounter.countTokens(options.prompt);
        allocation = this.contextAllocator.calculateAllocation(
          options.phase,
          config.model.contextSize || 4096,
          '',
          options.modelId,
          'synthesis',
          0
        );
        
        this.logger.info(`🧮 Calculated token allocation for final answer`, {
          promptTokens,
          maxGenerationTokens: allocation.maxGenerationTokens
        });
      }

      const systemPrompt = this.buildSystemPrompt(options.modelId, options.prompt, allocation);

      // Setup streaming routing if needed
      const originalAddToken = this.streamingService.addToken.bind(this.streamingService);
      const originalCompleteStream = this.streamingService.completeStream.bind(this.streamingService);
      
      if (options.routeToSynthesis) {
        this.setupSynthesisRouting(originalAddToken, originalCompleteStream);
      }

      let finalAnswer = '';
      
      try {
        // REMOVED: sendInitialSynthesisSignal() - was causing SSE connection to break
        // Frontend will now activate synthesis panel on first actual token

        // Generate the final answer
        finalAnswer = await this.generateWithStreaming(
          options.modelId,
          context,
          systemPrompt,
          options.prompt,
          options.phase,
          allocation
        );

        // Ensure completion signal is sent
        this.sendCompletionSignal(options.modelId, options.phase, options.routeToSynthesis);

        const endTime = Date.now();
        const generationTime = endTime - startTime;
        
        // Calculate metrics
        const promptTokens = this.tokenCounter.countTokens(systemPrompt) + this.tokenCounter.countTokens(options.prompt);
        const generatedTokens = this.tokenCounter.countTokens(finalAnswer);
        const totalTokens = promptTokens + generatedTokens;
        const tokensPerSecond = Math.round((generatedTokens / generationTime) * 1000);

        this.logger.info('✅ Final answer generation completed successfully', {
          sessionId: options.sessionId,
          contentLength: finalAnswer.length,
          tokenMetrics: {
            promptTokens,
            generatedTokens,
            totalTokens,
            generationTimeMs: generationTime,
            tokensPerSecond
          }
        });

        return {
          content: finalAnswer,
          success: true,
          tokenMetrics: {
            promptTokens,
            generatedTokens,
            totalTokens,
            generationTimeMs: generationTime,
            tokensPerSecond
          }
        };

      } finally {
        // Always restore original streaming methods
        if (options.routeToSynthesis) {
          this.restoreOriginalStreaming(originalAddToken, originalCompleteStream);
        }
      }

    } catch (error) {
      this.logger.error('❌ Final answer generation failed', {
        sessionId: options.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Send error completion signal
      this.sendErrorCompletionSignal(options.modelId, options.phase, options.routeToSynthesis);

      return {
        content: '',
        success: false,
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
        this.modelService.releaseContext(options.modelId, context);
        this.logger.info('📤 Model context released');
      }
    }
  }

  /**
   * Build Jane's system prompt, using the full guidelines when the context window
   * still leaves the phase's minimum generation space, and the compact ones otherwise
   */
  private buildSystemPrompt(modelId: string, prompt: string, allocation: TokenAllocation): string {
    const runtime = {
      modelName: this.modelService.getModelConfig(modelId)?.name ?? modelId,
      date: this.formatLocalDate(new Date())
    };

    const fullSystemPrompt = buildJaneSystemPrompt('full', runtime);
    const contextSize = config.model.contextSize || 4096;
    const reservedTokens = allocation.debugInfo.phaseConfig.minGenerationTokens + allocation.safetyMarginTokens;
    const fullPromptTokens = this.tokenCounter.countTokens(fullSystemPrompt) + this.tokenCounter.countTokens(prompt);
    const variant: JanePromptVariant = fullPromptTokens + reservedTokens <= contextSize ? 'full' : 'compact';
    const systemPrompt = variant === 'full' ? fullSystemPrompt : buildJaneSystemPrompt('compact', runtime);

    this.logger.info('🗣️ Jane system prompt selected', {
      variant,
      systemPromptTokens: this.tokenCounter.countTokens(systemPrompt),
      fullPromptTokens,
      reservedTokens,
      contextSize
    });

    return systemPrompt;
  }

  /**
   * Format a date as YYYY-MM-DD in the server's local time zone
   */
  private formatLocalDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  /**
   * Setup routing to synthesis panel
   */
  private setupSynthesisRouting(
    originalAddToken: (modelId: string, phase: CollaborationPhase, token: string) => void,
    originalCompleteStream: (modelId: string, phase: CollaborationPhase) => void
  ): void {
    this.logger.info('🔀 Setting up synthesis panel routing');
    
    this.streamingService.addToken = (modelId: string, phase: CollaborationPhase, token: string): void => {
      if (phase === CollaborationPhase.SYNTHESIZE) {
        originalAddToken('synthesis', phase, token);
      } else {
        originalAddToken(modelId, phase, token);
      }
    };
    
    this.streamingService.completeStream = (modelId: string, phase: CollaborationPhase): void => {
      if (phase === CollaborationPhase.SYNTHESIZE) {
        originalCompleteStream('synthesis', phase);
      } else {
        originalCompleteStream(modelId, phase);
      }
    };
  }

  /**
   * Restore original streaming methods
   */
  private restoreOriginalStreaming(
    originalAddToken: (modelId: string, phase: CollaborationPhase, token: string) => void,
    originalCompleteStream: (modelId: string, phase: CollaborationPhase) => void
  ): void {
    this.logger.info('🔄 Restoring original streaming methods');
    this.streamingService.addToken = originalAddToken;
    this.streamingService.completeStream = originalCompleteStream;
  }

  // REMOVED: sendInitialSynthesisSignal() function - was causing SSE connection breaks
  // Frontend now activates synthesis panel on first actual TOKEN_CHUNK with synthesis modelId

  /**
   * Generate content with streaming
   */
  private async generateWithStreaming(
    modelId: string,
    context: LlamaContext,
    systemPrompt: string,
    prompt: string,
    phase: CollaborationPhase,
    allocation: TokenAllocation
  ): Promise<string> {
    const modelConfig = this.modelService.getModelConfig(modelId);
    if (!modelConfig) {
      throw new Error(`Model config not found for ${modelId}`);
    }

    this.logger.info('🚀 Starting streaming generation', {
      modelId,
      phase,
      maxTokens: allocation.maxGenerationTokens
    });

    // Get a sequence for this generation
    const sequence = context.getSequence();
    
    try {
      // Create chat session
      const { LlamaChatSession } = await import('node-llama-cpp');
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt
      });

      let tokenCount = 0;
      // Create a token buffer to maintain context for proper spacing
      const tokenBuffer: Token[] = [];
      const TOKEN_CONTEXT_SIZE = 10; // Keep last 10 tokens for context

      const generationOptions = {
        temperature: modelConfig.settings.temperature,
        topP: modelConfig.settings.topP,
        topK: modelConfig.settings.topK,
        minP: modelConfig.settings.minP,
        maxTokens: allocation.maxGenerationTokens,
        onToken: (tokens: Token[]): void => {
          // Add new tokens to buffer
          tokenBuffer.push(...tokens);
          
          // Keep buffer size limited
          if (tokenBuffer.length > TOKEN_CONTEXT_SIZE) {
            tokenBuffer.splice(0, tokenBuffer.length - TOKEN_CONTEXT_SIZE);
          }
          
          // Calculate context tokens for proper spacing
          const contextSize = Math.max(0, tokenBuffer.length - tokens.length);
          const contextTokens = contextSize > 0 ? tokenBuffer.slice(0, contextSize) : undefined;
          
          // Detokenize with context for proper spacing
          const tokenText = context.model.detokenize(tokens, false, contextTokens);
          
          if (tokenText) {
            // CRITICAL: Filter out stop tokens to prevent HTML rendering issues
            const isStopToken = PromptFormatter.isStopToken(modelConfig, tokenText);
            
            if (!isStopToken) {
              tokenCount += tokens.length;
              
              // Stream the token
              this.streamingService.addToken(modelId, phase, tokenText);
            }
          }
        }
      };

      // Generate response
      const response = await session.prompt(prompt, generationOptions);
      
      this.logger.info('📝 Generation completed', {
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
   * Send completion signal
   */
  private sendCompletionSignal(
    modelId: string, 
    phase: CollaborationPhase, 
    routeToSynthesis: boolean = false
  ): void {
    const targetModelId = routeToSynthesis && phase === CollaborationPhase.SYNTHESIZE ? 'synthesis' : modelId;
    
    this.logger.info('✅ Sending completion signal', {
      originalModelId: modelId,
      targetModelId,
      phase,
      routeToSynthesis
    });
    
    this.streamingService.completeStream(targetModelId, phase);
    
    // Additional completion message for synthesis
    if (routeToSynthesis && phase === CollaborationPhase.SYNTHESIZE) {
      this.sendMessage({
        type: SSEMessageType.PHASE_UPDATE,
        payload: { 
          phase: CollaborationPhase.CONSENSUS, 
          status: 'synthesis_complete'
        }
      });
    }
  }

  /**
   * Send error completion signal
   */
  private sendErrorCompletionSignal(
    modelId: string, 
    phase: CollaborationPhase, 
    routeToSynthesis: boolean = false
  ): void {
    const targetModelId = routeToSynthesis && phase === CollaborationPhase.SYNTHESIZE ? 'synthesis' : modelId;
    
    this.logger.warn('⚠️ Sending error completion signal', {
      originalModelId: modelId,
      targetModelId,
      phase
    });
    
    // Send completion even on error to prevent hanging
    this.streamingService.completeStream(targetModelId, phase);
  }

  /**
   * Generate fallback response when main generation fails
   */
  async generateFallbackAnswer(options: FinalAnswerOptions): Promise<FinalAnswerResult> {
    this.logger.warn('🔄 Generating fallback answer', {
      sessionId: options.sessionId,
      modelId: options.modelId
    });

    const fallbackContent = "I couldn't generate the final answer: the model run failed before it finished. Please run the question again.";
    
    // Stream the fallback content
    if (options.routeToSynthesis) {
      // REMOVED: sendInitialSynthesisSignal() - was causing SSE connection to break
      this.streamingService.addToken('synthesis', options.phase, fallbackContent);
      this.sendCompletionSignal(options.modelId, options.phase, true);
    } else {
      this.streamingService.addToken(options.modelId, options.phase, fallbackContent);
      this.sendCompletionSignal(options.modelId, options.phase, false);
    }

    return {
      content: fallbackContent,
      success: false,
      tokenMetrics: {
        promptTokens: 0,
        generatedTokens: this.tokenCounter.countTokens(fallbackContent),
        totalTokens: this.tokenCounter.countTokens(fallbackContent),
        generationTimeMs: 0,
        tokensPerSecond: 0
      }
    };
  }
}
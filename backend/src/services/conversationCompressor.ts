import { ModelService } from './modelService.js';
import { TokenCounter } from './tokenCounter.js';
import { CollaborationPhase } from '../models/types.js';
import { createLogger } from '../utils/logger.js';
import { LlamaChatSession } from 'node-llama-cpp';

/**
 * INTELLIGENT CONVERSATION COMPRESSION SERVICE
 * 
 * Uses Gemma to intelligently compress conversation turns before storage,
 * preserving semantic meaning while reducing token usage.
 */
export class ConversationCompressor {
  private readonly logger = createLogger('ConversationCompressor');
  private readonly tokenCounter: TokenCounter;
  private readonly modelService: ModelService;
  private readonly COMPRESSION_MODEL_ID = 'gemma-3-12b-it-q4-0';
  
  // Target compression ratios by phase
  private readonly COMPRESSION_TARGETS: Record<CollaborationPhase, number> = {
    [CollaborationPhase.IDLE]: 0.5,
    [CollaborationPhase.BRAINSTORM]: 0.6,      // Keep more creative content
    [CollaborationPhase.CRITIQUE]: 0.5,       // Compress analysis
    [CollaborationPhase.REVISE]: 0.4,         // Aggressive compression
    [CollaborationPhase.SYNTHESIZE]: 0.3,     // Very aggressive
    [CollaborationPhase.CONSENSUS]: 0.4,      // Keep key agreements
    [CollaborationPhase.COMPLETE]: 0.3        // Maximum compression
  };

  constructor(modelService: ModelService, tokenCounter: TokenCounter) {
    this.modelService = modelService;
    this.tokenCounter = tokenCounter;
  }

  /**
   * Compress a conversation turn using intelligent summarization
   */
  async compressConversationTurn(
    content: string,
    modelId: string,
    phase: CollaborationPhase,
    turnNumber: number
  ): Promise<{
    compressed: string;
    original: string;
    compressionRatio: number;
    preservedKeyPoints: string[];
  }> {
    const originalTokens = this.tokenCounter.countTokens(content);
    const targetRatio = this.COMPRESSION_TARGETS[phase];
    const targetTokens = Math.floor(originalTokens * targetRatio);
    
    // Don't compress if already small
    if (originalTokens < 200) {
      this.logger.debug(`Turn ${turnNumber} already small (${originalTokens} tokens), skipping compression`);
      return {
        compressed: content,
        original: content,
        compressionRatio: 1.0,
        preservedKeyPoints: []
      };
    }

    try {
      const context = await this.modelService.acquireContext(this.COMPRESSION_MODEL_ID);
      
      const sequence = context.getSequence();
      
      try {
        const compressionPrompt = this.buildCompressionPrompt(
          content,
          modelId,
          phase,
          targetTokens
        );

        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt: ''
        });

        const compressed = await session.prompt(compressionPrompt, {
          temperature: 0.3,  // Low temperature for consistent compression
          maxTokens: targetTokens + 50,  // Allow slight overrun
          topP: 0.9
        });

        // Extract key points from the compression
        const keyPoints = this.extractKeyPoints(compressed);
        
        const compressedTokens = this.tokenCounter.countTokens(compressed);
        const compressionRatio = compressedTokens / originalTokens;
        
        this.logger.info(`✨ Compressed turn ${turnNumber} from ${originalTokens} to ${compressedTokens} tokens (${Math.round(compressionRatio * 100)}%)`);
        
        return {
          compressed,
          original: content,
          compressionRatio,
          preservedKeyPoints: keyPoints
        };
      } finally {
        // Properly dispose of the sequence before releasing context
        sequence.dispose();
        await this.modelService.releaseContext(this.COMPRESSION_MODEL_ID, context);
      }
    } catch (error) {
      this.logger.error('Compression failed, using original:', error);
      return {
        compressed: content,
        original: content,
        compressionRatio: 1.0,
        preservedKeyPoints: []
      };
    }
  }

  /**
   * Build the compression prompt for the LLM
   */
  private buildCompressionPrompt(
    content: string,
    modelId: string,
    phase: CollaborationPhase,
    targetTokens: number
  ): string {
    const phaseContext = this.getPhaseContext(phase);
    
    return `You are a conversation compression expert. Your task is to intelligently compress the following ${modelId} response while preserving ALL critical information.

**Current Phase:** ${phase}
**Phase Focus:** ${phaseContext}
**Target Length:** Approximately ${targetTokens} tokens (${Math.round(targetTokens * 4)} characters)

**Compression Guidelines:**
1. Preserve ALL key arguments, insights, and conclusions
2. Maintain the speaker's main points and reasoning
3. Keep specific examples and evidence
4. Remove redundancy and verbose explanations
5. Use concise language while maintaining clarity
6. Preserve the logical flow and structure

**Original Response:**
${content}

**Compressed Version:**
Provide a compressed version that captures the essence while reducing tokens. Start directly with the compressed content.`;
  }

  /**
   * Get phase-specific compression context
   */
  private getPhaseContext(phase: CollaborationPhase): string {
    const contexts: Record<CollaborationPhase, string> = {
      [CollaborationPhase.IDLE]: 'General discussion',
      [CollaborationPhase.BRAINSTORM]: 'Creative ideas and novel approaches',
      [CollaborationPhase.CRITIQUE]: 'Critical analysis and feedback',
      [CollaborationPhase.REVISE]: 'Improvements and refinements',
      [CollaborationPhase.SYNTHESIZE]: 'Integration and combination of ideas',
      [CollaborationPhase.CONSENSUS]: 'Agreements and final decisions',
      [CollaborationPhase.COMPLETE]: 'Summary and conclusions'
    };
    return contexts[phase];
  }

  /**
   * Extract key points from compressed content
   */
  private extractKeyPoints(compressed: string): string[] {
    const keyPoints: string[] = [];
    
    // Look for bullet points
    const bulletMatches = compressed.match(/^[*\-•]\s+(.+)$/gm);
    if (bulletMatches) {
      keyPoints.push(...bulletMatches.map(m => m.replace(/^[*\-•]\s+/, '')));
    }
    
    // Look for numbered points
    const numberedMatches = compressed.match(/^\d+[.)]\s+(.+)$/gm);
    if (numberedMatches) {
      keyPoints.push(...numberedMatches.map(m => m.replace(/^\d+[.)]\s+/, '')));
    }
    
    // Look for key phrases
    const keyPhrases = compressed.match(/(key\s+(?:point|insight|finding|conclusion|agreement)[:\s]+[^.]+\.)/gi);
    if (keyPhrases) {
      keyPoints.push(...keyPhrases);
    }
    
    return keyPoints.slice(0, 5); // Max 5 key points
  }

  /**
   * Batch compress multiple turns
   */
  async batchCompressTurns(
    turns: Array<{
      content: string;
      modelId: string;
      phase: CollaborationPhase;
      turnNumber: number;
    }>
  ): Promise<Map<number, {
    compressed: string;
    compressionRatio: number;
    preservedKeyPoints: string[];
  }>> {
    const results = new Map();
    
    // Process in parallel with concurrency limit
    const batchSize = 2;
    for (let i = 0; i < turns.length; i += batchSize) {
      const batch = turns.slice(i, i + batchSize);
      const compressions = await Promise.all(
        batch.map(turn => 
          this.compressConversationTurn(
            turn.content,
            turn.modelId,
            turn.phase,
            turn.turnNumber
          )
        )
      );
      
      batch.forEach((turn, index) => {
        results.set(turn.turnNumber, {
          compressed: compressions[index].compressed,
          compressionRatio: compressions[index].compressionRatio,
          preservedKeyPoints: compressions[index].preservedKeyPoints
        });
      });
    }
    
    return results;
  }
}
import { ModelService } from './modelService.js';
import { PromptFormatter } from './promptFormatter.js';
import { createLogger } from '../utils/logger.js';
import { StructuredSolution, ConversationTurn } from '../models/conversationTypes.js';
import { CollaborationPhase } from '../models/types.js';
import { LlamaChatSession } from 'node-llama-cpp';

/**
 * Phase 2: Solution Extraction Service
 * Extracts structured solutions from model responses for deterministic retrieval
 */
export class SolutionExtractionService {
  private readonly logger = createLogger('SolutionExtraction');
  private readonly EXTRACTION_MODEL_ID = 'gemma-3-12b-it-q4-0'; // Use Gemma for extraction

  constructor(private modelService: ModelService) {}

  /**
   * Extract structured solution from a conversation turn
   * Can use regex for simple cases or LLM for complex extraction
   */
  async extractSolution(turn: ConversationTurn): Promise<StructuredSolution | null> {
    try {
      // First try regex-based extraction for common patterns
      const regexSolution = this.tryRegexExtraction(turn.content);
      if (regexSolution) {
        this.logger.info(`✅ Extracted solution via regex: ${JSON.stringify(regexSolution)}`);
        return regexSolution;
      }

      // For complex cases, use LLM-based extraction
      const llmSolution = await this.tryLLMExtraction(turn);
      if (llmSolution) {
        this.logger.info(`✅ Extracted solution via LLM: ${JSON.stringify(llmSolution)}`);
        return llmSolution;
      }

      return null;
    } catch (error) {
      this.logger.error('Solution extraction failed:', error);
      return null;
    }
  }

  /**
   * Regex-based extraction for common solution patterns
   */
  private tryRegexExtraction(content: string): StructuredSolution | null {
    const lowerContent = content.toLowerCase();
    
    // Pattern 1: "The answer is X" or "The solution is X"
    const answerPattern = /(?:the\s+)?(?:answer|solution|result|number)\s+(?:is|equals?|:)\s*(\d+)/i;
    const answerMatch = content.match(answerPattern);
    
    // Pattern 2: "X is the answer/solution"
    const reversePattern = /(\d+)\s+is\s+(?:the\s+)?(?:answer|solution|correct|final)/i;
    const reverseMatch = content.match(reversePattern);
    
    // Pattern 3: Sum of digits pattern
    const sumPattern = /sum\s+of\s+(?:its\s+)?digits?\s+(?:is|equals?|:)\s*(\d+)/i;
    const sumMatch = content.match(sumPattern);
    
    // Confidence indicators
    const hasHighConfidence = /conclusive|certain|definitely|confirmed|verified|no\s+errors?\s+(?:were\s+)?detected/i.test(lowerContent);
    const hasMediumConfidence = /likely|probably|appears?\s+to\s+be|seems?\s+to\s+be/i.test(lowerContent);
    
    // Extract main answer
    const mainAnswer = answerMatch?.[1] || reverseMatch?.[1];
    
    if (mainAnswer) {
      const solution: StructuredSolution = {
        value: parseInt(mainAnswer),
        confidence: hasHighConfidence ? 'high' : hasMediumConfidence ? 'medium' : 'low',
        status: hasHighConfidence ? 'conclusive' : 'tentative',
        metadata: {}
      };
      
      // Add sum of digits if found
      if (sumMatch?.[1] && solution.metadata) {
        solution.metadata.sumOfDigits = parseInt(sumMatch[1]);
      }
      
      return solution;
    }
    
    return null;
  }

  /**
   * LLM-based extraction for complex cases
   */
  private async tryLLMExtraction(turn: ConversationTurn): Promise<StructuredSolution | null> {
    // Skip LLM extraction during high load or for verification turns
    if (turn.metadata.isVerification) {
      this.logger.debug('Skipping LLM extraction for verification turn');
      return null;
    }

    const extractionPrompt = `Extract the solution from this AI response. Return ONLY a JSON object.

Response to analyze:
"${turn.content}"

Instructions:
1. Find the main answer/solution (usually a number or key value)
2. Determine confidence level (high/medium/low)
3. Determine status (conclusive/tentative/error)
4. Extract any supporting calculations or metadata

Return JSON in this exact format:
{
  "value": <main answer as string or number>,
  "confidence": "<high|medium|low>",  
  "status": "<conclusive|tentative|error>",
  "reasoning": "<one line explanation>",
  "metadata": {
    "sumOfDigits": <number if mentioned>,
    <other relevant key-value pairs>
  }
}

If no clear solution is found, return: {"value": null, "confidence": "low", "status": "error"}`;

    try {
      // Add timeout to prevent hanging
      const contextPromise = this.modelService.acquireContext(this.EXTRACTION_MODEL_ID);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Context acquisition timeout')), 5000)
      );
      
      const context = await Promise.race([contextPromise, timeoutPromise]).catch(error => {
        this.logger.warn('Could not acquire context for LLM extraction:', error);
        return null;
      });
      
      if (!context) return null;

      try {
        const modelConfig = this.modelService.getModelConfig(this.EXTRACTION_MODEL_ID);
        if (!modelConfig) throw new Error('Extraction model not found');

        const formatted = PromptFormatter.formatPrompt(
          modelConfig,
          'You are a JSON extraction expert. Extract structured data from text.',
          extractionPrompt
        );

        const sequence = context.getSequence();
        try {
          const session = new LlamaChatSession({
            contextSequence: sequence,
            systemPrompt: ''
          });

          const response = await session.prompt(formatted.prompt, {
            temperature: 0.1, // Low temperature for consistent extraction
            maxTokens: 200
          });

          // Parse JSON from response
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate and clean the extracted data
            if (parsed.value !== null && parsed.value !== undefined) {
              return {
                value: parsed.value,
                confidence: parsed.confidence || 'medium',
                status: parsed.status || 'tentative',
                reasoning: parsed.reasoning,
                metadata: parsed.metadata || {}
              };
            }
          }
        } finally {
          sequence.dispose();
        }
      } finally {
        this.modelService.releaseContext(this.EXTRACTION_MODEL_ID, context);
      }
    } catch (error) {
      this.logger.error('LLM extraction failed:', error);
    }

    return null;
  }

  /**
   * Mark turns as final answers based on phase and content analysis
   */
  markFinalAnswers(turns: ConversationTurn[]): void {
    for (const turn of turns) {
      // Mark turns in final phases that contain solution indicators
      if (turn.phase === CollaborationPhase.SYNTHESIZE || 
          turn.phase === CollaborationPhase.CONSENSUS ||
          (turn.phase === CollaborationPhase.REVISE && this.containsFinalAnswerIndicators(turn.content))) {
        
        turn.metadata.isFinalAnswer = true;
        this.logger.debug(`Marked turn ${turn.id} as final answer`);
      }
    }
  }

  /**
   * Check if content contains final answer indicators
   */
  private containsFinalAnswerIndicators(content: string): boolean {
    const indicators = [
      /final\s+answer/i,
      /conclusive/i,
      /the\s+solution\s+is/i,
      /therefore,?\s+the\s+answer/i,
      /we\s+have\s+verified/i,
      /no\s+errors?\s+(?:were\s+)?detected/i
    ];
    
    return indicators.some(pattern => pattern.test(content));
  }
}
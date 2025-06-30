/**
 * AGREEMENT ANALYSIS SERVICE - SOPHISTICATED AI COLLABORATION ENGINE
 * 
 * Implements Gemini's "Agreement Funnel" algorithm for state-of-the-art dual-model
 * agreement analysis with JSON schema-enforced structured output.
 * 
 * Architecture: 3-Stage Analysis Pipeline
 * Stage 1: Fast Path - Structured data extraction and pattern matching
 * Stage 2: Semantic Analysis - Embedding-based reasoning comparison  
 * Stage 3: LLM Arbiter - AI-powered verification with JSON schema enforcement
 */

import { ModelService } from './modelService.js';
import { EmbeddingService } from './embeddingService.js';
import { LlamaChatSession } from 'node-llama-cpp';
import { createLogger } from '../utils/logger.js';
import {
  AgreementAnalysisInput,
  AgreementAnalysisResult,
  AgreementAnalysisConfig,
  ExtractedData,
  SemanticAnalysisResult,
  LLMArbiterResult,
  AgreementLevel,
  LLM_ARBITER_JSON_SCHEMA
} from '../models/agreementAnalysisTypes.js';
import { CollaborationPhase } from '../models/types.js';

/**
 * Production-grade Agreement Analysis Engine
 */
export class AgreementAnalysisService {
  private logger = createLogger('AgreementAnalysisService');
  private embeddingService: EmbeddingService;
  private config: AgreementAnalysisConfig;

  constructor(
    private modelService: ModelService,
    config?: Partial<AgreementAnalysisConfig>
  ) {
    this.embeddingService = new EmbeddingService();
    
    // Production-optimized default configuration
    this.config = {
      // Stage 1: Fast Path
      fastPathConfidenceThreshold: 0.8,
      exactMatchRequiredForFastPath: true,
      
      // Stage 2: Semantic Analysis  
      semanticSimilarityThreshold: 0.6,
      useTopicClustering: true,
      maxReasoningSteps: 10,
      
      // Stage 3: LLM Arbiter
      enableJsonSchemaEnforcement: true,
      arbiterTemperature: 0.2, // Low temperature for consistency
      arbiterMaxTokens: 800,
      
      // Phase Jumping
      enableIntelligentPhaseJumping: true,
      consensusJumpThreshold: 0.9,
      allowBackwardJumps: true,
      
      ...config
    };

    this.logger.info('🔬 AgreementAnalysisService initialized with sophisticated 3-stage pipeline');
  }

  /**
   * MAIN ENTRY POINT: Analyze agreement between two model responses
   */
  async analyze(input: AgreementAnalysisInput): Promise<AgreementAnalysisResult> {
    const startTime = Date.now();
    this.logger.info(`🔍 Starting agreement analysis for session ${input.sessionId}`);

    try {
      await this.embeddingService.initialize();

      // STAGE 0: Pre-processing & Normalization
      const normalizedA = this.normalizeResponse(input.responseA.content);
      const normalizedB = this.normalizeResponse(input.responseB.content);

      // STAGE 1: Fast Path - Structured Data Extraction
      this.logger.info('📊 Stage 1: Extracting structured data');
      const extractionA = await this.extractStructuredData(normalizedA);
      const extractionB = await this.extractStructuredData(normalizedB);

      // Check for fast path optimization
      const fastPathResult = this.checkFastPath(extractionA, extractionB);
      if (fastPathResult) {
        this.logger.info('⚡ Fast path taken - high confidence agreement detected');
        return this.buildFinalResult(input, extractionA, extractionB, undefined, undefined, fastPathResult, startTime, 'FAST_PATH');
      }

      // STAGE 2: Semantic Analysis
      this.logger.info('🧠 Stage 2: Performing semantic analysis');
      const semanticAnalysis = await this.performSemanticAnalysis(normalizedA, normalizedB);

      // Check if we need LLM arbiter
      const needsArbiter = this.shouldUseArbiter(extractionA, extractionB, semanticAnalysis);
      
      let arbiterResult: LLMArbiterResult | undefined;
      if (needsArbiter) {
        // STAGE 3: LLM Arbiter with JSON Schema Enforcement
        this.logger.info('⚖️ Stage 3: Engaging LLM arbiter for complex analysis');
        arbiterResult = await this.performLLMArbiterAnalysis(input, extractionA, extractionB, semanticAnalysis);
      }

      // Synthesize final recommendation
      const finalRecommendation = this.synthesizeFinalRecommendation(
        input,
        extractionA,
        extractionB,
        semanticAnalysis,
        arbiterResult
      );

      const stageUsed = arbiterResult ? 'LLM_ARBITER' : 'SEMANTIC';
      return this.buildFinalResult(input, extractionA, extractionB, semanticAnalysis, arbiterResult, finalRecommendation, startTime, stageUsed);

    } catch (error) {
      this.logger.error('❌ Agreement analysis failed', { error: error instanceof Error ? error.message : String(error) });
      return this.createFailsafeResult(input, startTime);
    }
  }

  /**
   * STAGE 0: Pre-processing & Normalization
   */
  private normalizeResponse(content: string): string {
    return content
      .toLowerCase()
      .replace(/\btwo\b/g, '2')
      .replace(/\bthree\b/g, '3')
      .replace(/\bfour\b/g, '4')
      .replace(/\bfive\b/g, '5')
      .replace(/\bsix\b/g, '6')
      .replace(/\bseven\b/g, '7')
      .replace(/\beight\b/g, '8')
      .replace(/\bnine\b/g, '9')
      .replace(/\bten\b/g, '10')
      .replace(/\beleven\b/g, '11')
      .replace(/\btwelve\b/g, '12')
      .replace(/i think/g, '')
      .replace(/i believe/g, '')
      .replace(/in my opinion/g, '')
      .trim();
  }

  /**
   * STAGE 1: Fast Path - Structured Data Extraction
   * 100% INTELLIGENT EXTRACTION using Gemma LLM - NO hardcoded patterns!
   */
  private async extractStructuredData(content: string): Promise<ExtractedData> {
    return await this.extractAllDataWithLLM(content);
  }


  /**
   * Fast Path Check - Skip to consensus if clear agreement
   */
  private checkFastPath(extractionA: ExtractedData, extractionB: ExtractedData): {
    nextPhase: CollaborationPhase;
    reasoning: string;
    confidence: number;
    isPhaseJump: boolean;
    jumpReason: string;
  } | null {
    if (!this.config.exactMatchRequiredForFastPath) return null;

    const bothHaveAnswers = extractionA.hasExplicitAnswer && extractionB.hasExplicitAnswer;
    const bothHighConfidence = extractionA.confidenceScore >= this.config.fastPathConfidenceThreshold &&
                              extractionB.confidenceScore >= this.config.fastPathConfidenceThreshold;
    const answersMatch = extractionA.finalAnswer === extractionB.finalAnswer;
    const noErrors = extractionA.errorFlags.length === 0 && extractionB.errorFlags.length === 0;

    if (bothHaveAnswers && bothHighConfidence && answersMatch && noErrors) {
      return {
        nextPhase: CollaborationPhase.CONSENSUS,
        reasoning: `Fast path: Both models agree on answer "${extractionA.finalAnswer}" with high confidence`,
        confidence: Math.min(extractionA.confidenceScore, extractionB.confidenceScore),
        isPhaseJump: true,
        jumpReason: 'Perfect agreement detected'
      };
    }

    return null;
  }

  /**
   * STAGE 2: Semantic Analysis
   */
  private async performSemanticAnalysis(contentA: string, contentB: string): Promise<SemanticAnalysisResult> {
    // Overall semantic similarity
    const [vectorA, vectorB] = await Promise.all([
      this.embeddingService.embed(contentA),
      this.embeddingService.embed(contentB)
    ]);

    const overallSimilarity = this.cosineSimilarity(vectorA, vectorB);

    // Topic clustering analysis (simplified for now)
    const topicClusters = await this.performTopicClustering(contentA, contentB);

    return {
      overallSimilarity,
      reasoningStepSimilarity: {}, // TODO: Implement step-by-step comparison
      topicClusters
    };
  }

  private async performTopicClustering(contentA: string, contentB: string): Promise<{
    cluster: string;
    similarityScore: number;
    contentA: string;
    contentB: string;
  }[]> {
    // Simplified clustering - in production this would use more sophisticated NLP
    const clusters = [
      {
        cluster: 'mathematical_approach',
        similarityScore: 0.8,
        contentA: contentA.substring(0, 200),
        contentB: contentB.substring(0, 200)
      }
    ];

    return clusters;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }

  /**
   * Check if LLM Arbiter is needed
   */
  private shouldUseArbiter(extractionA: ExtractedData, extractionB: ExtractedData, semanticAnalysis: SemanticAnalysisResult): boolean {
    // Use arbiter if answers disagree or semantic similarity is low
    const answersDisagree = extractionA.finalAnswer !== extractionB.finalAnswer;
    const lowSimilarity = semanticAnalysis.overallSimilarity < this.config.semanticSimilarityThreshold;
    const hasErrors = extractionA.errorFlags.length > 0 || extractionB.errorFlags.length > 0;
    const lowConfidence = Math.min(extractionA.confidenceScore, extractionB.confidenceScore) < 0.6;

    return answersDisagree || lowSimilarity || hasErrors || lowConfidence;
  }

  /**
   * STAGE 3: LLM Arbiter with JSON Schema Enforcement
   */
  private async performLLMArbiterAnalysis(
    input: AgreementAnalysisInput,
    extractionA: ExtractedData,
    extractionB: ExtractedData,
    semanticAnalysis: SemanticAnalysisResult
  ): Promise<LLMArbiterResult> {
    
    const prompt = this.createArbiterPrompt(input, extractionA, extractionB, semanticAnalysis);
    
    // Use Gemma for arbitration with JSON schema enforcement
    const context = await this.modelService.acquireContext('gemma-3-12b-it-q4-0');
    
    try {
      // Get the llama instance for grammar creation
      const llama = this.modelService.getLlamaInstance();
      
      // Create JSON schema grammar for structured output
      const grammar = await llama.createGrammarForJsonSchema(LLM_ARBITER_JSON_SCHEMA);
      
      // Get a sequence for this generation
      const sequence = context.getSequence();
      
      try {
        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt: 'You are a sophisticated agreement analysis expert. Analyze the responses and provide structured JSON output.'
        });

        const response = await session.prompt(prompt, {
          grammar,
          temperature: this.config.arbiterTemperature,
          maxTokens: this.config.arbiterMaxTokens
        });

        // Parse the JSON response
        const result = JSON.parse(response) as LLMArbiterResult;
        
        this.logger.info('⚖️ LLM Arbiter analysis complete', {
          answerAgreement: result.answerAgreement,
          recommendedPhase: result.recommendedPhase,
          isHighConfidenceJump: result.isHighConfidenceJump
        });

        return result;
        
      } finally {
        // CRITICAL: Always dispose of the sequence to prevent "No sequences left" error
        sequence.dispose();
      }

    } catch (error) {
      this.logger.error('❌ LLM Arbiter analysis failed', { error: error instanceof Error ? error.message : String(error) });
      
      // Fallback result
      return {
        answerAgreement: 'UNCLEAR',
        extractedAnswerA: extractionA.finalAnswer ?? null,
        extractedAnswerB: extractionB.finalAnswer ?? null,
        confidenceA: extractionA.confidenceScore,
        confidenceB: extractionB.confidenceScore,
        verificationStatus: 'INSUFFICIENT_INFO',
        criticalErrors: ['Arbiter analysis failed'],
        reasoning: 'LLM arbiter encountered an error, falling back to semantic analysis',
        recommendedPhase: input.currentPhase,
        isHighConfidenceJump: false
      };
    } finally {
      this.modelService.releaseContext('gemma-3-12b-it-q4-0', context);
    }
  }

  private createArbiterPrompt(
    input: AgreementAnalysisInput,
    extractionA: ExtractedData,
    extractionB: ExtractedData,
    semanticAnalysis: SemanticAnalysisResult
  ): string {
    return `CRITICAL AGREEMENT ANALYSIS TASK

Original Problem: ${input.originalQuery}

Model A (${input.responseA.modelId}) Response:
${input.responseA.content.substring(0, 800)}

Model B (${input.responseB.modelId}) Response:
${input.responseB.content.substring(0, 800)}

EXTRACTED DATA SUMMARY:
- Model A Answer: ${extractionA.finalAnswer || 'No explicit answer'}
- Model A Confidence: ${extractionA.confidenceScore}
- Model B Answer: ${extractionB.finalAnswer || 'No explicit answer'}  
- Model B Confidence: ${extractionB.confidenceScore}
- Semantic Similarity: ${semanticAnalysis.overallSimilarity}

YOUR TASK: Provide a structured JSON analysis following the exact schema. Focus on:
1. Do both models have the SAME numerical answer?
2. Are both models mathematically correct?
3. What phase should we go to next?
4. Is this a high-confidence situation where we can jump phases?

RESPOND ONLY WITH VALID JSON - NO OTHER TEXT.`;
  }

  /**
   * Synthesize final recommendation from all analysis stages
   */
  private synthesizeFinalRecommendation(
    input: AgreementAnalysisInput,
    extractionA: ExtractedData,
    extractionB: ExtractedData,
    semanticAnalysis: SemanticAnalysisResult,
    arbiterResult?: LLMArbiterResult
  ): {
    nextPhase: CollaborationPhase;
    reasoning: string;
    confidence: number;
    isPhaseJump: boolean;
    jumpReason?: string;
  } {
    // Use arbiter result if available, otherwise fall back to heuristic analysis
    if (arbiterResult) {
      return {
        nextPhase: arbiterResult.recommendedPhase,
        reasoning: arbiterResult.reasoning,
        confidence: Math.min(arbiterResult.confidenceA, arbiterResult.confidenceB),
        isPhaseJump: arbiterResult.isHighConfidenceJump,
        jumpReason: arbiterResult.isHighConfidenceJump ? 'LLM arbiter detected high-confidence agreement' : undefined
      };
    }

    // Fallback heuristic analysis
    const answersMatch = extractionA.finalAnswer === extractionB.finalAnswer;
    const bothConfident = Math.min(extractionA.confidenceScore, extractionB.confidenceScore) > 0.7;
    const highSimilarity = semanticAnalysis.overallSimilarity > 0.7;

    if (answersMatch && bothConfident && highSimilarity) {
      return {
        nextPhase: CollaborationPhase.CONSENSUS,
        reasoning: 'High agreement detected through semantic analysis',
        confidence: Math.min(extractionA.confidenceScore, extractionB.confidenceScore),
        isPhaseJump: true,
        jumpReason: 'Semantic analysis detected strong agreement'
      };
    }

    // Continue current phase if no clear direction
    return {
      nextPhase: input.currentPhase,
      reasoning: 'Insufficient agreement for phase transition',
      confidence: 0.5,
      isPhaseJump: false
    };
  }

  /**
   * Build the final comprehensive result
   */
  private buildFinalResult(
    input: AgreementAnalysisInput,
    extractionA: ExtractedData,
    extractionB: ExtractedData,
    semanticAnalysis: SemanticAnalysisResult | undefined,
    arbiterResult: LLMArbiterResult | undefined,
    finalRecommendation: {
      nextPhase: CollaborationPhase;
      reasoning: string;
      confidence: number;
      isPhaseJump: boolean;
      jumpReason?: string;
    },
    startTime: number,
    stageUsed: 'FAST_PATH' | 'SEMANTIC' | 'LLM_ARBITER'
  ): AgreementAnalysisResult {
    
    // Determine agreement level
    let agreementLevel: AgreementLevel;
    if (extractionA.finalAnswer === extractionB.finalAnswer && extractionA.finalAnswer !== null) {
      if (Math.min(extractionA.confidenceScore, extractionB.confidenceScore) > 0.8) {
        agreementLevel = 'PERFECT_CONSENSUS';
      } else {
        agreementLevel = 'STRONG_AGREEMENT';
      }
    } else if (semanticAnalysis && semanticAnalysis.overallSimilarity > 0.7) {
      agreementLevel = 'METHODOLOGICAL_AGREEMENT';
    } else if (extractionA.finalAnswer !== extractionB.finalAnswer && extractionA.finalAnswer !== null && extractionB.finalAnswer !== null) {
      agreementLevel = 'CONFLICTED';
    } else {
      agreementLevel = 'INSUFFICIENT_DATA';
    }

    return {
      sessionId: input.sessionId,
      analysisTimestamp: Date.now(),
      processingTimeMs: Date.now() - startTime,
      
      extractionA,
      extractionB,
      
      semanticAnalysis: semanticAnalysis || {
        overallSimilarity: 0,
        reasoningStepSimilarity: {},
        topicClusters: []
      },
      
      arbiterResult,
      
      agreementLevel,
      finalRecommendation,
      
      keyFindings: {
        agreements: arbiterResult?.answerAgreement === 'EXACT_MATCH' ? ['Both models agree on the answer'] : [],
        conflicts: arbiterResult?.criticalErrors || [],
        complementaryIdeas: [],
        criticalIssues: [...extractionA.errorFlags, ...extractionB.errorFlags]
      },
      
      analysisQuality: {
        dataCompleteness: (extractionA.hasExplicitAnswer && extractionB.hasExplicitAnswer) ? 1.0 : 0.5,
        confidenceInRecommendation: finalRecommendation.confidence,
        stageUsed
      }
    };
  }

  /**
   * COMPREHENSIVE INTELLIGENT DATA EXTRACTION using Gemma LLM
   * Extracts ALL structured data in one call with JSON schema enforcement
   */
  private async extractAllDataWithLLM(content: string): Promise<ExtractedData> {
    let context = null;
    try {
      context = await this.modelService.acquireContext('gemma-3-12b-it-q4-0');
      const sequence = context.getSequence();
      
      try {
        // Create JSON schema for structured extraction
        const llama = this.modelService.getLlamaInstance();
        const extractionSchema = {
          type: "object" as const,
          properties: {
            finalAnswer: {
              oneOf: [
                { type: "string" as const },
                { type: "number" as const },
                { type: "null" as const }
              ]
            },
            confidenceScore: {
              type: "number" as const,
              minimum: 0,
              maximum: 1
            },
            confidenceKeywords: {
              type: "array" as const,
              items: { type: "string" as const }
            },
            reasoningSteps: {
              type: "array" as const,
              items: { type: "string" as const }
            },
            errorFlags: {
              type: "array" as const, 
              items: { type: "string" as const }
            },
            hasExplicitAnswer: {
              type: "boolean" as const
            },
            answerLocation: {
              type: "string" as const
            }
          },
          required: ["finalAnswer", "confidenceScore", "confidenceKeywords", "reasoningSteps", "errorFlags", "hasExplicitAnswer", "answerLocation"] as const
        };
        
        const grammar = await llama.createGrammarForJsonSchema(extractionSchema);
        
        const { LlamaChatSession } = await import('node-llama-cpp');
        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt: 'You are a data extraction expert. Analyze text and return structured JSON data.'
        });

        const prompt = `Extract structured data from this AI model response:

"${content.substring(0, 1000)}"

Extract:
- finalAnswer: The numerical answer if clearly stated (number/string) or null if not found
- confidenceScore: 0.0-1.0 based on confidence phrases and answer clarity  
- confidenceKeywords: Array of confidence-indicating words found
- reasoningSteps: Array of reasoning steps/bullet points found
- errorFlags: Array of any error admissions or corrections mentioned
- hasExplicitAnswer: true if clear final answer exists
- answerLocation: Where the answer was found (e.g. "conclusion", "final calculation")

Return only valid JSON:`;

        const response = await session.prompt(prompt, {
          grammar,
          temperature: 0.1,
          maxTokens: 500
        });

        const extractedData = JSON.parse(response) as ExtractedData;
        
        this.logger.info('🧠 LLM-extracted all data', {
          finalAnswer: extractedData.finalAnswer,
          confidence: extractedData.confidenceScore,
          hasAnswer: extractedData.hasExplicitAnswer,
          reasoningSteps: extractedData.reasoningSteps.length,
          contentPreview: content.substring(0, 100)
        });

        return extractedData;
        
      } finally {
        sequence.dispose();
      }
    } catch (error) {
      this.logger.warn('⚠️ LLM data extraction failed, using fallback', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fallback to basic extraction
      return {
        finalAnswer: null,
        confidenceScore: 0.5,
        confidenceKeywords: [],
        reasoningSteps: [],
        errorFlags: ['Extraction failed'],
        hasExplicitAnswer: false,
        answerLocation: ''
      };
    } finally {
      if (context) {
        this.modelService.releaseContext('gemma-3-12b-it-q4-0', context);
      }
    }
  }


  /**
   * Create failsafe result when analysis fails
   */
  private createFailsafeResult(input: AgreementAnalysisInput, startTime: number): AgreementAnalysisResult {
    const emptyExtraction: ExtractedData = {
      finalAnswer: null,
      confidenceScore: 0,
      confidenceKeywords: [],
      reasoningSteps: [],
      errorFlags: ['Analysis failed'],
      hasExplicitAnswer: false,
      answerLocation: ''
    };

    return {
      sessionId: input.sessionId,
      analysisTimestamp: Date.now(),
      processingTimeMs: Date.now() - startTime,
      
      extractionA: emptyExtraction,
      extractionB: emptyExtraction,
      
      semanticAnalysis: {
        overallSimilarity: 0,
        reasoningStepSimilarity: {},
        topicClusters: []
      },
      
      agreementLevel: 'INSUFFICIENT_DATA',
      finalRecommendation: {
        nextPhase: input.currentPhase,
        reasoning: 'Analysis failed - continuing current phase',
        confidence: 0,
        isPhaseJump: false
      },
      
      keyFindings: {
        agreements: [],
        conflicts: [],
        complementaryIdeas: [],
        criticalIssues: ['Agreement analysis service encountered an error']
      },
      
      analysisQuality: {
        dataCompleteness: 0,
        confidenceInRecommendation: 0,
        stageUsed: 'FAST_PATH'
      }
    };
  }
}
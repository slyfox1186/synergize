/**
 * ANALYSIS TOOLBOX - COMPREHENSIVE AGREEMENT ANALYSIS TOOLS
 * 
 * Professional toolkit for LLM-driven agreement analysis using the ReAct pattern.
 * Each tool is stateless, well-tested, and returns structured data for LLM interpretation.
 */

import { EmbeddingService } from './embeddingService.js';
import { createLogger } from '../utils/logger.js';
import { ExtractedData } from '../models/agreementAnalysisTypes.js';
import { CollaborationPhase } from '../models/types.js';

export interface ToolResult {
  success: boolean;
  data: unknown;
  reasoning: string;
}

export interface ConfidenceAnalysis {
  averageConfidence: number;
  confidenceGap: number;
  highConfidenceCount: number;
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
}

export interface AnswerComparison {
  match: 'EXACT_MATCH' | 'EQUIVALENT' | 'DIFFERENT' | 'ONE_MISSING' | 'BOTH_MISSING';
  answerA: string | number | null;
  answerB: string | number | null;
  similarity: number;
}

export interface ReasoningAnalysis {
  pathAlignment: 'IDENTICAL' | 'COMPLEMENTARY' | 'DIVERGENT' | 'CONTRADICTORY';
  stepCount: { a: number; b: number };
  keyConceptOverlap: number;
  logicalConsistency: 'CONSISTENT' | 'MINOR_ISSUES' | 'MAJOR_CONFLICTS';
}

export interface ErrorAssessment {
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  errorCount: { a: number; b: number };
  criticalIssues: string[];
  canProceed: boolean;
}

export interface PhaseJumpSignals {
  explicitSuggestions: { a: boolean; b: boolean };
  consensusKeywords: string[];
  jumpConfidence: number;
  recommendedPhase: CollaborationPhase | null;
}

/**
 * Professional analysis toolbox for agreement detection
 */
export class AnalysisToolbox {
  private logger = createLogger('AnalysisToolbox');
  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  async initialize(): Promise<void> {
    await this.embeddingService.initialize();
    this.logger.info('🔧 AnalysisToolbox initialized with professional analysis capabilities');
  }

  /**
   * TOOL 1: Compare final answers with sophisticated matching
   */
  async compareFinalAnswers(extractionA: ExtractedData, extractionB: ExtractedData): Promise<ToolResult> {
    try {
      const answerA = extractionA.finalAnswer;
      const answerB = extractionB.finalAnswer;

      // Handle null cases
      if (answerA === null && answerB === null) {
        return {
          success: true,
          data: {
            match: 'BOTH_MISSING',
            answerA,
            answerB,
            similarity: 1.0
          } as AnswerComparison,
          reasoning: 'Both models failed to provide final answers'
        };
      }

      if (answerA === null || answerB === null) {
        return {
          success: true,
          data: {
            match: 'ONE_MISSING',
            answerA,
            answerB,
            similarity: 0.0
          } as AnswerComparison,
          reasoning: `Only one model provided an answer: ${answerA || answerB}`
        };
      }

      // Exact match check
      if (answerA === answerB) {
        return {
          success: true,
          data: {
            match: 'EXACT_MATCH',
            answerA,
            answerB,
            similarity: 1.0
          } as AnswerComparison,
          reasoning: `Perfect match: both models answered "${answerA}"`
        };
      }

      // Numerical equivalence check
      const numA = typeof answerA === 'number' ? answerA : parseFloat(String(answerA));
      const numB = typeof answerB === 'number' ? answerB : parseFloat(String(answerB));
      
      if (!isNaN(numA) && !isNaN(numB)) {
        const tolerance = Math.max(Math.abs(numA), Math.abs(numB)) * 0.001; // 0.1% tolerance
        if (Math.abs(numA - numB) <= tolerance) {
          return {
            success: true,
            data: {
              match: 'EQUIVALENT',
              answerA,
              answerB,
              similarity: 0.95
            } as AnswerComparison,
            reasoning: `Numerically equivalent: ${answerA} ≈ ${answerB} (within tolerance)`
          };
        }
      }

      // String similarity for text answers
      if (typeof answerA === 'string' && typeof answerB === 'string') {
        const similarity = this.calculateStringSimilarity(answerA, answerB);
        if (similarity > 0.8) {
          return {
            success: true,
            data: {
              match: 'EQUIVALENT',
              answerA,
              answerB,
              similarity
            } as AnswerComparison,
            reasoning: `Highly similar text answers (${Math.round(similarity * 100)}% similarity)`
          };
        }
      }

      return {
        success: true,
        data: {
          match: 'DIFFERENT',
          answerA,
          answerB,
          similarity: 0.2
        } as AnswerComparison,
        reasoning: `Different answers: "${answerA}" vs "${answerB}"`
      };

    } catch (error) {
      this.logger.error('❌ Answer comparison failed', { error });
      return {
        success: false,
        data: null,
        reasoning: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * TOOL 2: Analyze confidence levels comprehensively
   */
  async analyzeConfidenceLevels(extractionA: ExtractedData, extractionB: ExtractedData): Promise<ToolResult> {
    try {
      const confidenceA = extractionA.confidenceScore;
      const confidenceB = extractionB.confidenceScore;
      const averageConfidence = (confidenceA + confidenceB) / 2;
      const confidenceGap = Math.abs(confidenceA - confidenceB);
      const highConfidenceCount = [confidenceA, confidenceB].filter(c => c >= 0.8).length;

      let confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
      if (averageConfidence >= 0.9) confidenceLevel = 'VERY_HIGH';
      else if (averageConfidence >= 0.75) confidenceLevel = 'HIGH';
      else if (averageConfidence >= 0.5) confidenceLevel = 'MEDIUM';
      else confidenceLevel = 'LOW';

      const analysis: ConfidenceAnalysis = {
        averageConfidence,
        confidenceGap,
        highConfidenceCount,
        confidenceLevel
      };

      return {
        success: true,
        data: analysis,
        reasoning: `Confidence analysis: ${confidenceLevel} (avg: ${Math.round(averageConfidence * 100)}%, gap: ${Math.round(confidenceGap * 100)}%)`
      };

    } catch (error) {
      this.logger.error('❌ Confidence analysis failed', { error });
      return {
        success: false,
        data: null,
        reasoning: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * TOOL 3: Compare reasoning paths and logical flow
   */
  async compareReasoningPaths(extractionA: ExtractedData, extractionB: ExtractedData): Promise<ToolResult> {
    try {
      const stepsA = extractionA.reasoningSteps;
      const stepsB = extractionB.reasoningSteps;

      // Calculate step similarity using embeddings
      let keyConceptOverlap = 0;
      if (stepsA.length > 0 && stepsB.length > 0) {
        const combinedA = stepsA.join(' ');
        const combinedB = stepsB.join(' ');
        keyConceptOverlap = await this.calculateSemanticSimilarity(combinedA, combinedB);
      }

      // Determine path alignment
      let pathAlignment: 'IDENTICAL' | 'COMPLEMENTARY' | 'DIVERGENT' | 'CONTRADICTORY';
      if (keyConceptOverlap > 0.9) pathAlignment = 'IDENTICAL';
      else if (keyConceptOverlap > 0.7) pathAlignment = 'COMPLEMENTARY';
      else if (keyConceptOverlap > 0.3) pathAlignment = 'DIVERGENT';
      else pathAlignment = 'CONTRADICTORY';

      // Check logical consistency
      const hasContradictions = this.detectContradictions(stepsA, stepsB);
      let logicalConsistency: 'CONSISTENT' | 'MINOR_ISSUES' | 'MAJOR_CONFLICTS';
      if (hasContradictions) logicalConsistency = 'MAJOR_CONFLICTS';
      else if (pathAlignment === 'DIVERGENT') logicalConsistency = 'MINOR_ISSUES';
      else logicalConsistency = 'CONSISTENT';

      const analysis: ReasoningAnalysis = {
        pathAlignment,
        stepCount: { a: stepsA.length, b: stepsB.length },
        keyConceptOverlap,
        logicalConsistency
      };

      return {
        success: true,
        data: analysis,
        reasoning: `Reasoning analysis: ${pathAlignment} paths with ${Math.round(keyConceptOverlap * 100)}% concept overlap, ${logicalConsistency.toLowerCase()} logic`
      };

    } catch (error) {
      this.logger.error('❌ Reasoning comparison failed', { error });
      return {
        success: false,
        data: null,
        reasoning: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * TOOL 4: Assess error flags and critical issues
   */
  async assessErrorFlags(extractionA: ExtractedData, extractionB: ExtractedData): Promise<ToolResult> {
    try {
      const errorsA = extractionA.errorFlags;
      const errorsB = extractionB.errorFlags;
      const totalErrors = errorsA.length + errorsB.length;

      // Identify critical issues
      const criticalKeywords = ['critical', 'major', 'fatal', 'wrong', 'incorrect', 'impossible'];
      const criticalIssues = [...errorsA, ...errorsB].filter(error =>
        criticalKeywords.some(keyword => error.toLowerCase().includes(keyword))
      );

      // Determine severity
      let severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      if (criticalIssues.length > 0) severity = 'CRITICAL';
      else if (totalErrors > 3) severity = 'HIGH';
      else if (totalErrors > 1) severity = 'MEDIUM';
      else if (totalErrors > 0) severity = 'LOW';
      else severity = 'NONE';

      const canProceed = severity !== 'CRITICAL' && criticalIssues.length === 0;

      const assessment: ErrorAssessment = {
        severity,
        errorCount: { a: errorsA.length, b: errorsB.length },
        criticalIssues,
        canProceed
      };

      return {
        success: true,
        data: assessment,
        reasoning: `Error assessment: ${severity} severity, ${totalErrors} total errors, ${criticalIssues.length} critical issues`
      };

    } catch (error) {
      this.logger.error('❌ Error assessment failed', { error });
      return {
        success: false,
        data: null,
        reasoning: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * TOOL 5: Detect phase jump suggestions and consensus signals
   */
  async detectPhaseJumpSignals(responseA: string, responseB: string): Promise<ToolResult> {
    try {
      const consensusKeywords = [
        'jump to consensus', 'skip to final', 'go straight to', 'directly to consensus',
        'final answer', 'we agree', 'both correct', 'perfect agreement', 'consensus reached'
      ];

      // Check for explicit suggestions
      const explicitA = consensusKeywords.some(keyword => 
        responseA.toLowerCase().includes(keyword)
      );
      const explicitB = consensusKeywords.some(keyword => 
        responseB.toLowerCase().includes(keyword)
      );

      // Find matching keywords
      const foundKeywords = consensusKeywords.filter(keyword =>
        responseA.toLowerCase().includes(keyword) || responseB.toLowerCase().includes(keyword)
      );

      // Calculate jump confidence
      let jumpConfidence = 0;
      if (explicitA && explicitB) jumpConfidence = 0.95;
      else if (explicitA || explicitB) jumpConfidence = 0.7;
      else if (foundKeywords.length > 0) jumpConfidence = 0.5;

      // Recommend phase based on signals
      let recommendedPhase: CollaborationPhase | null = null;
      if (jumpConfidence >= 0.8) recommendedPhase = CollaborationPhase.COMPLETE;
      else if (jumpConfidence >= 0.6) recommendedPhase = CollaborationPhase.CONSENSUS;

      const signals: PhaseJumpSignals = {
        explicitSuggestions: { a: explicitA, b: explicitB },
        consensusKeywords: foundKeywords,
        jumpConfidence,
        recommendedPhase
      };

      return {
        success: true,
        data: signals,
        reasoning: `Phase jump analysis: ${Math.round(jumpConfidence * 100)}% confidence, ${foundKeywords.length} consensus signals detected`
      };

    } catch (error) {
      this.logger.error('❌ Phase jump detection failed', { error });
      return {
        success: false,
        data: null,
        reasoning: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * TOOL 6: Calculate semantic similarity between texts
   */
  async calculateSemanticSimilarity(textA: string, textB: string): Promise<number> {
    try {
      const [vectorA, vectorB] = await Promise.all([
        this.embeddingService.embed(textA),
        this.embeddingService.embed(textB)
      ]);

      return this.cosineSimilarity(vectorA, vectorB);
    } catch (error) {
      this.logger.warn('⚠️ Semantic similarity calculation failed, using string similarity', { error });
      return this.calculateStringSimilarity(textA, textB);
    }
  }

  /**
   * Helper: Calculate cosine similarity between vectors
   */
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
   * Helper: Calculate string similarity using edit distance
   */
  private calculateStringSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    const maxLength = Math.max(a.length, b.length);
    const editDistance = this.levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    return 1 - (editDistance / maxLength);
  }

  /**
   * Helper: Calculate Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // insertion
          matrix[j - 1][i] + 1, // deletion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Helper: Detect contradictions in reasoning steps
   */
  private detectContradictions(stepsA: string[], stepsB: string[]): boolean {
    const contradictionPatterns = [
      ['correct', 'incorrect'], ['right', 'wrong'], ['true', 'false'],
      ['valid', 'invalid'], ['accurate', 'inaccurate']
    ];

    for (const stepA of stepsA) {
      for (const stepB of stepsB) {
        for (const [pos, neg] of contradictionPatterns) {
          if ((stepA.toLowerCase().includes(pos) && stepB.toLowerCase().includes(neg)) ||
              (stepA.toLowerCase().includes(neg) && stepB.toLowerCase().includes(pos))) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
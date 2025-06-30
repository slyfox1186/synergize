/**
 * AGREEMENT ANALYSIS ENGINE - TYPE DEFINITIONS
 * 
 * Sophisticated type definitions for the state-of-the-art Agreement Analysis Engine
 * implementing Gemini's "Agreement Funnel" algorithm with structured JSON output.
 */

import { CollaborationPhase } from './types.js';

/**
 * Input structure for agreement analysis
 */
export interface AgreementAnalysisInput {
  sessionId: string;
  currentPhase: CollaborationPhase;
  originalQuery: string;
  responseA: {
    modelId: string;
    content: string;
  };
  responseB: {
    modelId: string;
    content: string;
  };
}

/**
 * Structured data extracted from each model response (Stage 1)
 */
export interface ExtractedData {
  finalAnswer: string | number | null; // null = answer sought but not found
  confidenceScore: number; // 0.0 to 1.0
  confidenceKeywords: string[]; // Words indicating confidence level
  reasoningSteps: string[];
  errorFlags: string[]; // Explicit error admissions
  hasExplicitAnswer: boolean; // Whether response contains clear final answer
  answerLocation: string; // Where in text the answer was found
}

/**
 * Semantic analysis results (Stage 2)
 */
export interface SemanticAnalysisResult {
  overallSimilarity: number; // 0.0 to 1.0
  reasoningStepSimilarity: { [stepIndex: number]: number };
  topicClusters: {
    cluster: string;
    similarityScore: number;
    contentA: string;
    contentB: string;
  }[];
}

/**
 * LLM Arbiter verification results (Stage 3) - JSON Schema Enforced
 */
export interface LLMArbiterResult {
  answerAgreement: 'EXACT_MATCH' | 'EQUIVALENT' | 'PARTIAL' | 'DISAGREE' | 'UNCLEAR';
  extractedAnswerA: string | number | null;
  extractedAnswerB: string | number | null;
  confidenceA: number; // 0.0 to 1.0
  confidenceB: number; // 0.0 to 1.0
  verificationStatus: 'BOTH_CORRECT' | 'A_CORRECT' | 'B_CORRECT' | 'BOTH_INCORRECT' | 'INSUFFICIENT_INFO';
  criticalErrors: string[];
  reasoning: string;
  recommendedPhase: CollaborationPhase;
  isHighConfidenceJump: boolean;
}

/**
 * Agreement classification levels
 */
export type AgreementLevel = 
  | 'PERFECT_CONSENSUS'     // Exact same answer, high confidence
  | 'STRONG_AGREEMENT'      // Equivalent answers, good confidence  
  | 'PARTIAL_AGREEMENT'     // Same answer, different confidence levels
  | 'METHODOLOGICAL_AGREEMENT' // Different methods, same result
  | 'CONFLICTED'           // Different answers
  | 'INSUFFICIENT_DATA';   // Can't determine agreement

/**
 * Comprehensive agreement analysis result
 */
export interface AgreementAnalysisResult {
  // Metadata
  sessionId: string;
  analysisTimestamp: number;
  processingTimeMs: number;
  
  // Stage 1: Structured extraction
  extractionA: ExtractedData;
  extractionB: ExtractedData;
  
  // Stage 2: Semantic analysis
  semanticAnalysis: SemanticAnalysisResult;
  
  // Stage 3: LLM arbiter (when used)
  arbiterResult?: LLMArbiterResult;
  
  // Final synthesis
  agreementLevel: AgreementLevel;
  finalRecommendation: {
    nextPhase: CollaborationPhase;
    reasoning: string;
    confidence: number;
    isPhaseJump: boolean;
    jumpReason?: string;
  };
  
  // Detailed insights
  keyFindings: {
    agreements: string[];
    conflicts: string[];
    complementaryIdeas: string[];
    criticalIssues: string[];
  };
  
  // Quality metrics
  analysisQuality: {
    dataCompleteness: number; // 0.0 to 1.0
    confidenceInRecommendation: number; // 0.0 to 1.0
    stageUsed: 'FAST_PATH' | 'SEMANTIC' | 'LLM_ARBITER';
  };
}

/**
 * Configuration for the Agreement Analysis Engine
 */
export interface AgreementAnalysisConfig {
  // Stage 1 thresholds
  fastPathConfidenceThreshold: number; // Skip to Stage 3 if both models exceed this
  exactMatchRequiredForFastPath: boolean;
  
  // Stage 2 settings
  semanticSimilarityThreshold: number; // When to escalate to Stage 3
  useTopicClustering: boolean;
  maxReasoningSteps: number;
  
  // Stage 3 LLM Arbiter settings
  enableJsonSchemaEnforcement: boolean;
  arbiterTemperature: number;
  arbiterMaxTokens: number;
  
  // Phase jumping rules
  enableIntelligentPhaseJumping: boolean;
  consensusJumpThreshold: number; // Confidence needed for direct CONSENSUS jump
  allowBackwardJumps: boolean;
}

/**
 * JSON Schema for LLM Arbiter structured output
 */
export const LLM_ARBITER_JSON_SCHEMA = {
  type: "object",
  properties: {
    answerAgreement: {
      type: "string",
      enum: ["EXACT_MATCH", "EQUIVALENT", "PARTIAL", "DISAGREE", "UNCLEAR"]
    },
    extractedAnswerA: {
      oneOf: [
        { type: "string" },
        { type: "number" },
        { type: "null" }
      ]
    },
    extractedAnswerB: {
      oneOf: [
        { type: "string" },
        { type: "number" },
        { type: "null" }
      ]
    },
    confidenceA: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    confidenceB: {
      type: "number", 
      minimum: 0,
      maximum: 1
    },
    verificationStatus: {
      type: "string",
      enum: ["BOTH_CORRECT", "A_CORRECT", "B_CORRECT", "BOTH_INCORRECT", "INSUFFICIENT_INFO"]
    },
    criticalErrors: {
      type: "array",
      items: { type: "string" }
    },
    reasoning: {
      type: "string"
    },
    recommendedPhase: {
      type: "string",
      enum: ["IDLE", "BRAINSTORM", "CRITIQUE", "REVISE", "SYNTHESIZE", "CONSENSUS", "COMPLETE"]
    },
    isHighConfidenceJump: {
      type: "boolean"
    }
  },
  required: [
    "answerAgreement",
    "extractedAnswerA", 
    "extractedAnswerB",
    "confidenceA",
    "confidenceB", 
    "verificationStatus",
    "criticalErrors",
    "reasoning",
    "recommendedPhase",
    "isHighConfidenceJump"
  ]
} as const;
import { CollaborationPhase } from './types.js';
import { TokenAllocation } from '../services/contextAllocator.js';

/**
 * Structured solution format for final answers
 * Phase 2 improvement for deterministic solution extraction
 */
export interface StructuredSolution {
  value: string | number;           // The main answer (e.g., "263")
  confidence: 'high' | 'medium' | 'low';
  status: 'conclusive' | 'tentative' | 'error';
  reasoning?: string;               // Brief explanation
  calculations?: {                  // For math problems
    steps?: string[];
    finalResult?: number | string;
    verification?: string;
  };
  metadata?: {
    sumOfDigits?: number;          // For specific problem types
    [key: string]: string | number | boolean | undefined;  // Allow undefined for optional properties
  };
}

export interface ConversationTurn {
  id: string;
  sessionId: string;
  modelId: string;
  phase: CollaborationPhase;
  content: string;
  timestamp: number;
  turnNumber: number;
  responseToTurn?: string; // ID of the turn this is responding to
  metadata: {
    tokenCount: number;
    processingTime: number;
    contextUsed: number;
    // Phase 2 additions for better state management
    isFinalAnswer?: boolean;       // Marks conclusive turns
    isVerification?: boolean;      // Marks verification turns
    structuredSolution?: StructuredSolution; // Extracted solution data
    // History optimization metadata
    isCompressed?: boolean;        // Marks compressed turns
    isOptimized?: boolean;         // Marks optimized turns
    originalTokens?: number;       // Original token count before compression
    compressedTokens?: number;     // Token count after compression
    compressionRatio?: number;     // Compression ratio achieved
    keyPoints?: string[];          // Preserved key points
    optimizedBy?: string;          // Model that performed optimization
    optimizedAt?: number;          // Timestamp of optimization
  };
}

export interface ConversationState {
  sessionId: string;
  originalQuery: string;
  currentPhase: CollaborationPhase;
  participants: string[]; // model IDs
  turns: ConversationTurn[];
  sharedContext: {
    keyPoints: string[];
    agreements: string[];
    disagreements: string[];
    workingHypotheses: string[];
    nextSteps: string[];
  };
  phaseProgress: {
    [phase in CollaborationPhase]?: {
      completed: boolean;
      outcome: string;
      consensus: number; // 0-1 scale
      timestamp: number;
    };
  };
  phaseHistory: {
    phase: CollaborationPhase;
    completed: boolean;
    outcome: string;
    consensus: number;
    timestamp: number;
  }[];
  peakContextUsage: {
    percentage: number;
    turnNumber: number;
    tokenCount: number;
    phase: CollaborationPhase;
  };
  lastUpdate: number;
  status: 'active' | 'paused' | 'completed' | 'error';
}

export interface ConversationPrompt {
  systemPrompt: string;
  conversationContext: string;
  currentTurn: string;
  metadata: {
    phase: CollaborationPhase;
    turnNumber: number;
    otherModelLastResponse?: string;
    sharedContextSummary: string;
    tokenAllocation: TokenAllocation;
  };
}

export enum ConversationEvent {
  TURN_STARTED = 'TURN_STARTED',
  TURN_COMPLETED = 'TURN_COMPLETED',
  PHASE_TRANSITION = 'PHASE_TRANSITION',
  CONTEXT_UPDATED = 'CONTEXT_UPDATED',
  AGREEMENT_REACHED = 'AGREEMENT_REACHED',
  SYNTHESIS_GENERATED = 'SYNTHESIS_GENERATED'
}
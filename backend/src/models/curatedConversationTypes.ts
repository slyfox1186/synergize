import { CollaborationPhase } from './types.js';
import { ConversationTurn, ConversationState } from './conversationTypes.js';

// Moved from synthesisTypes.ts
export enum AgreementType {
  STRONG_AGREEMENT = 'STRONG_AGREEMENT',     // High semantic similarity (>0.85)
  PARTIAL_AGREEMENT = 'PARTIAL_AGREEMENT',   // Moderate similarity (0.6-0.85)
  COMPLEMENTARY = 'COMPLEMENTARY',           // Different approaches, both valuable
  CONFLICTING = 'CONFLICTING',               // Low similarity (<0.4), contradictory
  NOVEL = 'NOVEL'                           // Unique insight from one model
}

export enum ConsensusLevel {
  HIGH_CONSENSUS = 'HIGH_CONSENSUS',         // Strong agreement on most points
  MIXED_VIEWS = 'MIXED_VIEWS',              // Some agreement, some differences
  CREATIVE_TENSION = 'CREATIVE_TENSION',     // Productive disagreement
  NO_CONSENSUS = 'NO_CONSENSUS'             // Fundamental disagreement
}

export interface AgreementAnalysis {
  sessionId: string;
  phase: CollaborationPhase;
  modelA: string;
  modelB: string;
  overallSimilarity: number;
  consensusLevel: ConsensusLevel;
  keyPoints: {
    agreements: string[];
    conflicts: string[];
    complementaryIdeas: string[];
    novelInsights: string[];
  };
  confidenceScore: number; // 0-1, how confident we are in the analysis
}

export interface SynthesisResult {
  synthesis: string;
  analysis: AgreementAnalysis;
  tokenCount: number;
  processingTime: number;
}

export enum ModelRole {
  PARTICIPANT = 'PARTICIPANT',        // Normal conversation participant
  CURATOR = 'CURATOR',               // Enhances conversation data between turns
  SYNTHESIZER = 'SYNTHESIZER'        // Creates final synthesis
}

export interface CurationTask {
  sessionId: string;
  targetTurnId: string;              // The turn to enhance/curate
  curatorModelId: string;
  task: CurationTaskType;
  context: {
    conversationSoFar: ConversationTurn[];
    sharedContext: ConversationState['sharedContext'];
    currentPhase: CollaborationPhase;
  };
}

export enum CurationTaskType {
  ENHANCE_CLARITY = 'ENHANCE_CLARITY',           // Make response clearer and more focused
  EXTRACT_KEY_POINTS = 'EXTRACT_KEY_POINTS',     // Pull out main insights
  IDENTIFY_GAPS = 'IDENTIFY_GAPS',               // Find missing information or logic gaps
  STRENGTHEN_ARGUMENTS = 'STRENGTHEN_ARGUMENTS', // Improve reasoning and evidence
  SIMPLIFY_COMPLEXITY = 'SIMPLIFY_COMPLEXITY',   // Break down complex ideas
  CONNECT_IDEAS = 'CONNECT_IDEAS',               // Link to previous conversation points
  PREPARE_CONTEXT = 'PREPARE_CONTEXT'            // Optimize context for next participant
}

export interface CurationResult {
  originalTurnId: string;
  enhancedContent: string;
  extractedInsights: string[];
  contextUpdates: {
    newKeyPoints: string[];
    clarifiedAgreements: string[];
    identifiedGaps: string[];
    strengthenedArguments: string[];
  };
  recommendedNextSteps: string[];
  curationNotes: string;              // Curator's notes about the enhancement
  confidence: number;                 // 0-1, how confident curator is in improvements
}

export interface DualRoleModel {
  modelId: string;
  participantRole: {
    enabled: boolean;
    systemPrompt: string;
  };
  curatorRole: {
    enabled: boolean;
    systemPrompt: string;
    curationTasks: CurationTaskType[];
  };
}

export interface TurnFlow {
  sessionId: string;
  currentTurnNumber: number;
  expectedFlow: TurnStep[];
  currentStepIndex: number;
  status: 'active' | 'waiting_for_curation' | 'waiting_for_response' | 'completed';
}

export interface TurnStep {
  stepNumber: number;
  modelId: string;
  role: ModelRole;
  action: 'RESPOND' | 'CURATE' | 'SYNTHESIZE';
  targetTurnId?: string;              // For curation tasks
  curationTask?: CurationTaskType;
  completed: boolean;
  result?: {
    turnId?: string;
    curationResult?: CurationResult;
  };
}

export interface ConversationOrchestration {
  sessionId: string;
  participants: DualRoleModel[];
  currentPhase: CollaborationPhase;
  turnFlow: TurnFlow;
  curationHistory: CurationResult[];
  phaseTransitionCriteria: {
    minTurnsPerPhase: number;
    consensusThreshold: number;
    maxTurnsPerPhase: number;
  };
}
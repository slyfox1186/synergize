export enum CollaborationPhase {
  IDLE = 'IDLE',
  BRAINSTORM = 'BRAINSTORM',
  CRITIQUE = 'CRITIQUE',
  REVISE = 'REVISE',
  SYNTHESIZE = 'SYNTHESIZE',
  CONSENSUS = 'CONSENSUS',
  COMPLETE = 'COMPLETE'
}

export enum SSEMessageType {
  CONNECTION = 'CONNECTION',
  PHASE_UPDATE = 'PHASE_UPDATE',
  TOKEN_CHUNK = 'TOKEN_CHUNK',
  MODEL_STATUS = 'MODEL_STATUS',
  SYNTHESIS_UPDATE = 'SYNTHESIS_UPDATE',
  COLLABORATION_COMPLETE = 'COLLABORATION_COMPLETE',
  ERROR = 'ERROR'
}

export interface SSEMessage {
  type: SSEMessageType;
  payload: Record<string, unknown>;
}

export interface TokenChunk {
  modelId: string;
  phase: CollaborationPhase;
  tokens: string[];
  isComplete: boolean;
}

export interface ModelConfig {
  id: string;
  name: string;
}

export interface CollaborationState {
  sessionId: string | null;
  isConnected: boolean;
  currentPhase: CollaborationPhase;
  models: ModelConfig[];
  selectedModels: [string, string] | null;
  prompt: string;
  isStreaming: boolean;
  error: string | null;
  statusMessage: string | null;
}
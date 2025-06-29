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
  AGREEMENT_ANALYSIS = 'AGREEMENT_ANALYSIS',
  COLLABORATION_COMPLETE = 'COLLABORATION_COMPLETE',
  ERROR = 'ERROR'
}

export interface SSEMessage {
  type: SSEMessageType;
  payload: Record<string, unknown>;
}

export interface TokenChunk extends Record<string, unknown> {
  modelId: string;
  phase: CollaborationPhase;
  tokens: string[];
  isComplete: boolean;
}

export interface ModelConfig {
  id: string;
  name: string;
  path: string;
  contextSize: number;
  settings: {
    temperature?: number;
    topP?: number;
    topK?: number;
    minP?: number;
    repeatPenalty?: number;
  };
}

export interface CollaborationSession {
  id: string;
  prompt: string;
  models: string[];
  phase: CollaborationPhase;
  outputs: Map<CollaborationPhase, PhaseOutput>;
  startTime: number;
  status: 'active' | 'completed' | 'failed';
}

export interface PhaseOutput {
  modelOutputs: Map<string, string>;
  synthesis?: string;
  timestamp: number;
}

export interface ContextPoolOptions {
  maxSize: number;
  modelPath: string;
  contextSize: number;
  batchSize: number;
  threads: number;
  gpuLayers: number;
}
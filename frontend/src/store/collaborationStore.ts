import { create } from 'zustand';

import { CollaborationState, CollaborationPhase, ModelConfig } from '@/types';

interface CollaborationStore extends CollaborationState {
  // Actions
  setSessionId: (id: string) => void;
  setConnected: (connected: boolean) => void;
  setPhase: (phase: CollaborationPhase) => void;
  setModels: (models: ModelConfig[]) => void;
  selectModels: (models: [string, string]) => void;
  setPrompt: (prompt: string) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  setStatusMessage: (message: string | null) => void;
  reset: () => void;
}

const initialState: CollaborationState = {
  sessionId: null,
  isConnected: false,
  currentPhase: CollaborationPhase.IDLE,
  models: [],
  selectedModels: null,
  prompt: '',
  isStreaming: false,
  error: null,
  statusMessage: null,
};

export const useCollaborationStore = create<CollaborationStore>((set) => ({
  ...initialState,

  setSessionId: (id: string): void => set({ sessionId: id }),
  setConnected: (connected: boolean): void => set({ isConnected: connected }),
  setPhase: (phase: CollaborationPhase): void => set({ currentPhase: phase }),
  setModels: (models: ModelConfig[]): void => set({ models }),
  selectModels: (models: [string, string]): void => set({ selectedModels: models }),
  setPrompt: (prompt: string): void => set({ prompt }),
  setStreaming: (streaming: boolean): void => set({ isStreaming: streaming }),
  setError: (error: string | null): void => set({ error }),
  setStatusMessage: (message: string | null): void => set({ statusMessage: message }),
  
  reset: (): void => set(initialState),
}));
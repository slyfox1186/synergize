import { SSEMessage, SSEMessageType, TokenChunk, CollaborationPhase } from '../models/types.js';

export class StreamingService {
  constructor(private readonly sendMessage: (message: SSEMessage) => void) {}

  addToken(modelId: string, phase: CollaborationPhase, token: string): void {
    // Stream tokens immediately without filtering
    this.sendMessage({
      type: SSEMessageType.TOKEN_CHUNK,
      payload: {
        modelId,
        phase,
        tokens: [token],
        isComplete: false,
      } as TokenChunk,
    });
  }

  completeStream(modelId: string, phase: CollaborationPhase): void {
    // Send completion message
    this.sendMessage({
      type: SSEMessageType.TOKEN_CHUNK,
      payload: {
        modelId,
        phase,
        tokens: [],
        isComplete: true,
      } as TokenChunk,
    });
  }

  cleanup(): void {
    // No cleanup needed since we're not using buffers or timers anymore
  }
}
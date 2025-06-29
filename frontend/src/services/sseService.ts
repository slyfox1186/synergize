import { SSEMessage, SSEMessageType, CollaborationPhase, ModelConfig } from '@/types';
import { useCollaborationStore } from '@/store/collaborationStore';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SSEService');

export class SSEService {
  private eventSource: EventSource | null = null;
  private userInitiated: boolean = false;

  /**
   * Enable user-initiated connections (must be called before connect)
   */
  enableUserInitiatedConnection(): void {
    this.userInitiated = true;
    logger.info('SSE connections enabled for user-initiated actions');
  }

  connect(sessionId: string, onMessage: (message: SSEMessage) => void): void {
    // Prevent any connections unless explicitly enabled by user action
    if (!this.userInitiated) {
      logger.warn('SSE connection blocked - not user initiated', {
        sessionId,
        stackTrace: new Error().stack
      });
      return;
    }

    if (this.eventSource) {
      this.disconnect();
    }

    const url = `/api/synergize/stream/${sessionId}`;
    const connectionStartTime = Date.now();
    
    logger.info('SSE connection initiated by user action', {
      sessionId,
      url
    });
    
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = (): void => {
      const connectionTime = Date.now() - connectionStartTime;
      logger.info('SSE connection established', {
        sessionId,
        connectionTimeMs: connectionTime
      });
      useCollaborationStore.getState().setConnected(true);
    };

    this.eventSource.onmessage = (event): void => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        logger.debug('Message received', {
          type: message.type,
          payloadSize: JSON.stringify(message.payload).length,
          hasTokens: message.type === SSEMessageType.TOKEN_CHUNK
        });
        this.handleMessage(message);
        onMessage(message);
      } catch (error) {
        logger.error('Failed to parse SSE message', error, {
          rawData: event.data.substring(0, 200),
          eventType: event.type
        });
      }
    };

    this.eventSource.onerror = (error): void => {
      const readyState = this.eventSource?.readyState;
      logger.error('SSE connection error', error, {
        sessionId,
        readyState,
        willReconnect: false, // No automatic reconnection
        connectionDuration: Date.now() - connectionStartTime
      });
      
      useCollaborationStore.getState().setConnected(false);
      
      // No automatic reconnection - user must initiate new session
      if (readyState === EventSource.CLOSED) {
        logger.info('SSE connection closed, no automatic reconnection attempted', {
          sessionId,
          reason: 'automatic_reconnection_disabled'
        });
        useCollaborationStore.getState().setError('Connection lost. Please start a new collaboration.');
      }
    };
  }

  private handleMessage(message: SSEMessage): void {
    const store = useCollaborationStore.getState();

    switch (message.type) {
    case SSEMessageType.CONNECTION:
      store.setConnected(true);
      break;

    case SSEMessageType.PHASE_UPDATE:
      store.setPhase(message.payload.phase as CollaborationPhase);
      // Handle status messages for verification and other phase updates
      if (message.payload.message) {
        store.setStatusMessage(message.payload.message as string);
        // Clear status message after 10 seconds
        setTimeout(() => {
          store.setStatusMessage(null);
        }, 10000);
      } else {
        // Clear status message if phase changes without a message
        store.setStatusMessage(null);
      }
      break;

    case SSEMessageType.MODEL_STATUS:
      if (message.payload.models) {
        store.setModels(message.payload.models as ModelConfig[]);
      }
      break;

    case SSEMessageType.ERROR:
      store.setError(message.payload.error as string | null);
      break;

    case SSEMessageType.COLLABORATION_COMPLETE:
      store.setStreaming(false);
      store.setPhase((message.payload.phase as CollaborationPhase) || CollaborationPhase.COMPLETE);
      break;
    }
  }


  disconnect(): void {
    if (this.eventSource) {
      logger.info('Disconnecting SSE', {
        readyState: this.eventSource.readyState
      });
      this.eventSource.close();
      this.eventSource = null;
      useCollaborationStore.getState().setConnected(false);
    }
    
    // Reset user-initiated flag to prevent automatic reconnections
    this.userInitiated = false;
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}
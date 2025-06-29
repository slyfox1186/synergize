import { useState, useEffect } from 'react';

import { useCollaborationStore } from '@/store/collaborationStore';
import { SynergizerArena } from '@/components/SynergizerArena';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { PhaseIndicator } from '@/components/PhaseIndicator';
import { SSEService } from '@/services/sseService';
import { createLogger } from '@/utils/logger';
import { ModelConfig } from '@/types';

const logger = createLogger('App');

function App(): JSX.Element {
  const [sseService] = useState(() => new SSEService());
  const { isConnected, error, models } = useCollaborationStore();

  useEffect(() => {
    logger.info('App initializing - disconnecting any existing SSE connections');
    
    // Ensure no stale SSE connections exist and reset store
    sseService.disconnect();
    useCollaborationStore.getState().reset();
    
    // Clear any potential stale state from previous sessions
    useCollaborationStore.getState().setSessionId('');
    
    // Emergency cleanup: Force close any lingering EventSource connections
    // This is aggressive but necessary to prevent stale reconnect attempts
    try {
      // Clear any existing intervals/timeouts that might be running
      for (let i = 1; i < 99999; i++) window.clearTimeout(i);
    } catch (e) {
      // Ignore errors, this is just aggressive cleanup
    }
    
    logger.info('Checking backend readiness...');
    
    // Function to check if backend is ready
    const checkBackendHealth = async (): Promise<boolean> => {
      try {
        const response = await fetch('/health', { 
          method: 'GET',
          signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        return response.ok;
      } catch (error) {
        // Backend not ready yet
        return false;
      }
    };

    // Function to wait for backend and then fetch models
    const waitForBackendAndFetchModels = async (): Promise<void> => {
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max wait
      
      while (attempts < maxAttempts) {
        const isReady = await checkBackendHealth();
        
        if (isReady) {
          logger.info('Backend ready! Fetching models...');
          // Backend is ready, now fetch models
          try {
            const res = await fetch('/api/models');
            logger.debug('Models API response status', { status: res.status });
            const data = await res.json();
            logger.debug('Models API response data:', data);
            
            const store = useCollaborationStore.getState();
            
            if (data.models && Array.isArray(data.models)) {
              logger.info('Setting models in store:', data.models);
              store.setModels(data.models);
              
              // Auto-select models with Gemma on the left
              if (data.models.length >= 2) {
                // Find Gemma and Qwen models
                const gemmaModel = data.models.find((m: ModelConfig) => m.id.includes('gemma'));
                const qwenModel = data.models.find((m: ModelConfig) => m.id.includes('qwen'));
                
                let selectedIds: [string, string];
                if (gemmaModel && qwenModel) {
                  // Gemma left, Qwen right
                  selectedIds = [gemmaModel.id, qwenModel.id];
                } else {
                  // Fallback to first two models
                  selectedIds = [data.models[0].id, data.models[1].id];
                }
                
                logger.info('Auto-selecting models', { selectedIds });
                store.selectModels(selectedIds);
              } else {
                logger.error('Not enough models found', undefined, { modelCount: data.models.length });
              }
            } else {
              logger.error('Invalid models data', undefined, { data });
            }
          } catch (err) {
            logger.error('Failed to fetch models:', err);
            useCollaborationStore.getState().setError('Failed to connect to server');
          }
          return; // Exit the function once we've successfully connected
        }
        
        // Backend not ready, wait 1 second and try again
        attempts++;
        logger.debug(`Backend not ready, attempt ${attempts}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // If we get here, backend didn't become ready within timeout
      logger.error('Backend failed to become ready within timeout');
      useCollaborationStore.getState().setError('Server is taking too long to start. Please refresh the page.');
    };

    // Start the health check process
    waitForBackendAndFetchModels().catch(err => {
      logger.error('Health check process failed:', err);
    });

    return (): void => {
      sseService.disconnect();
    };
  }, [sseService]);

  return (
    <div className="min-h-screen bg-jarvis-darker">
      {/* Header */}
      <header className="border-b border-jarvis-primary/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-tech font-bold text-jarvis-primary text-glow">
              SYNERGIZE
            </h1>
            <div className="flex items-center gap-4">
              <PhaseIndicator />
              <ConnectionStatus connected={isConnected} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {!models.length ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-jarvis-primary"></div>
            <p className="mt-4 text-jarvis-muted">Loading models...</p>
          </div>
        ) : (
          <SynergizerArena sseService={sseService} />
        )}
      </main>
    </div>
  );
}

export default App;
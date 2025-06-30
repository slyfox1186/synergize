import { useState, useEffect, useRef } from 'react';

import { useCollaborationStore } from '@/store/collaborationStore';
import { SynergizerArena } from '@/components/SynergizerArena';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { PhaseIndicator } from '@/components/PhaseIndicator';
import { SSEService } from '@/services/sseService';
import { createLogger } from '@/utils/logger';
import { ModelConfig } from '@/types';

// Extend Window interface for development tools
declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
      onCommitFiberRoot: unknown;
      onCommitFiberUnmount: unknown;
    };
    gc?: () => void;
  }
}

const logger = createLogger('App');

function App(): JSX.Element {
  const [sseService] = useState(() => new SSEService());
  const { isConnected, error, models } = useCollaborationStore();
  const initializationRef = useRef(false);

  useEffect(() => {
    // Prevent double initialization in development
    if (initializationRef.current) {
      logger.debug('App initialization already in progress, skipping');
      return;
    }
    initializationRef.current = true;
    
    logger.info('App initializing - performing comprehensive cleanup for fresh start');
    
    // STEP 1: Disconnect and cleanup SSE service
    sseService.disconnect();
    logger.debug('SSE service disconnected');
    
    // STEP 2: Force complete store reset
    const store = useCollaborationStore.getState();
    store.reset();
    store.setSessionId(''); // Ensure no session ID persists
    store.setConnected(false);
    store.setStreaming(false);
    store.setError(null);
    store.setStatusMessage(null);
    
    // STEP 3: Clear all browser storage to prevent any client-side persistence
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear any Zustand persistence keys that might exist
      const persistenceKeys = [
        'collaboration-store',
        'synergize-store', 
        'session-store',
        'app-state'
      ];
      
      persistenceKeys.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
      
      logger.info('Browser storage completely cleared');
    } catch (e) {
      logger.warn('Could not clear browser storage', { 
        error: e instanceof Error ? e.message : String(e) 
      });
    }
    
    // STEP 4: Clear intervals/timeouts from previous sessions
    try {
      // Clear up to 10000 IDs to be thorough
      for (let i = 1; i < 10000; i++) {
        window.clearTimeout(i);
        window.clearInterval(i);
      }
      logger.debug('Cleared intervals and timeouts');
    } catch (e) {
      // Ignore errors, this is just cleanup
    }
    
    // STEP 5: Additional development mode cleanup
    if (process.env.NODE_ENV === 'development') {
      // Clear any React DevTools or hot reload state
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        try {
          window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot = null;
          window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberUnmount = null;
        } catch (e) {
          // Ignore DevTools cleanup errors
        }
      }
      
      // Force garbage collection if available
      if (window.gc) {
        try {
          window.gc();
        } catch (e) {
          // gc() not available, that's fine
        }
      }
      
      logger.debug('Development mode cleanup completed');
    }
    
    // STEP 6: Log final clean state
    const finalState = useCollaborationStore.getState();
    logger.info('Comprehensive cleanup completed - final state', {
      sessionId: finalState.sessionId,
      isConnected: finalState.isConnected,
      phase: finalState.currentPhase,
      isStreaming: finalState.isStreaming,
      hasError: finalState.error !== null,
      modelCount: finalState.models.length
    });
    
    logger.info('Checking backend readiness...');
    
    // Function to check if backend is ready
    const checkBackendHealth = async (): Promise<boolean> => {
      try {
        // Use /api/health endpoint through existing proxy
        const response = await fetch('/api/health', { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        // Check JSON content even for 503 responses (Vite proxy issue)
        const healthData = await response.json();
        // Make sure models are actually loaded, not just that server is running
        return healthData.status === 'healthy' && 
               healthData.checks?.models?.status === 'ok';
      } catch (error) {
        // Backend not ready yet (ECONNREFUSED is expected during startup)
        // The Vite proxy will handle this gracefully now
        return false;
      }
    };

    // Function to wait for backend and then fetch models
    const waitForBackendAndFetchModels = async (): Promise<void> => {
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max wait (models take time to load)
      
      // Add initial delay to let backend start
      logger.info('Waiting for backend to start...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second initial delay
      
      while (attempts < maxAttempts) {
        logger.debug(`Health check attempt ${attempts + 1}/${maxAttempts}`);
        const isReady = await checkBackendHealth();
        
        if (isReady) {
          logger.info('Backend ready! Models are loaded. Fetching model list...');
          // Backend is ready, mark as connected
          useCollaborationStore.getState().setConnected(true);
          // Backend is ready with models loaded, now fetch models via proxy
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
        
        // Backend not ready, wait 2 seconds and try again (longer interval for startup)
        attempts++;
        if (attempts <= 10) {
          // More frequent checks in first 20 seconds
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second
        } else {
          // Less frequent checks after that
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
        }
      }
      
      // If we get here, backend didn't become ready within timeout
      logger.error('Backend failed to become ready within timeout');
      useCollaborationStore.getState().setError('Server is taking too long to start. Please refresh the page.');
    };

    // Start the health check process
    waitForBackendAndFetchModels().catch(err => {
      logger.error('Health check process failed:', err);
      useCollaborationStore.getState().setConnected(false);
    });

    // Set up periodic health check to monitor backend status
    const healthCheckInterval = setInterval(async () => {
      const isHealthy = await checkBackendHealth();
      const currentlyConnected = useCollaborationStore.getState().isConnected;
      
      // Only update if status changed to avoid unnecessary re-renders
      if (isHealthy !== currentlyConnected && !useCollaborationStore.getState().isStreaming) {
        useCollaborationStore.getState().setConnected(isHealthy);
        if (!isHealthy) {
          logger.warn('Backend connection lost');
        } else {
          logger.info('Backend connection restored');
        }
      }
    }, 5000); // Check every 5 seconds

    return (): void => {
      clearInterval(healthCheckInterval);
      sseService.disconnect();
    };
  }, [sseService]);

  return (
    <div className="h-screen bg-synergy-darker flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-synergy-primary/20 backdrop-blur-sm flex-shrink-0 z-50">
        <div className="container mx-auto px-6 py-4" style={{ maxWidth: '85vw' }}>
          <div className="flex items-center justify-between">
            <h1 className="rainbow-text font-tech font-bold">
              SYNERGIZE
            </h1>
            <div className="flex items-center gap-4">
              <PhaseIndicator />
              <ConnectionStatus connected={isConnected} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Flex grow to fill remaining space */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full container mx-auto px-6 py-8" style={{ maxWidth: '85vw' }}>
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {!models.length ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-synergy-primary"></div>
                <p className="mt-4 text-synergy-muted">Loading models...</p>
              </div>
            </div>
          ) : (
            <SynergizerArena sseService={sseService} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
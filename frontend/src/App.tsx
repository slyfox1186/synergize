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
    logger.info('Starting model fetch...');
    // Fetch available models on mount and auto-select them
    fetch('/api/models')
      .then(res => {
        logger.debug('Models API response status:', res.status);
        return res.json();
      })
      .then(data => {
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
            
            logger.info('Auto-selecting models:', selectedIds);
            store.selectModels(selectedIds);
          } else {
            logger.error('Not enough models found:', data.models.length);
          }
        } else {
          logger.error('Invalid models data:', data);
        }
      })
      .catch((err: Error) => {
        logger.error('Failed to fetch models:', err);
        useCollaborationStore.getState().setError('Failed to connect to server');
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
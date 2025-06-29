import { useCollaborationStore } from '@/store/collaborationStore';
import { ModelConfig } from '@/types';

export function ModelSelector(): JSX.Element {
  const { models, selectedModels, selectModels, isStreaming } = useCollaborationStore();

  const handleModelSelect = (index: 0 | 1, modelId: string): void => {
    const current = selectedModels || ['', ''];
    const updated: [string, string] = [...current] as [string, string];
    updated[index] = modelId;
    
    if (updated[0] && updated[1] && updated[0] !== updated[1]) {
      selectModels(updated);
    }
  };

  return (
    <div className="mb-8 space-y-4">
      <h2 className="text-xl font-tech text-jarvis-primary">Select Models for Collaboration</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Model 1 Selector */}
        <div>
          <label className="block text-sm text-jarvis-muted mb-2">Model 1</label>
          <select
            value={selectedModels?.[0] || ''}
            onChange={(e) => handleModelSelect(0, e.target.value)}
            disabled={isStreaming}
            className="jarvis-input"
          >
            <option value="">Select a model...</option>
            {models.map((model: ModelConfig) => (
              <option 
                key={model.id} 
                value={model.id}
                disabled={selectedModels?.[1] === model.id}
              >
                {model.name}
              </option>
            ))}
          </select>
        </div>

        {/* Model 2 Selector */}
        <div>
          <label className="block text-sm text-jarvis-muted mb-2">Model 2</label>
          <select
            value={selectedModels?.[1] || ''}
            onChange={(e) => handleModelSelect(1, e.target.value)}
            disabled={isStreaming}
            className="jarvis-input"
          >
            <option value="">Select a model...</option>
            {models.map((model: ModelConfig) => (
              <option 
                key={model.id} 
                value={model.id}
                disabled={selectedModels?.[0] === model.id}
              >
                {model.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedModels?.[0] && selectedModels[1] && (
        <div className="text-sm text-jarvis-accent text-center animate-pulse-glow">
          {selectedModels[0]} ⚡ {selectedModels[1]}
        </div>
      )}
    </div>
  );
}
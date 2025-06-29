import { useRef, useState, useCallback, useEffect } from 'react';

import { useCollaborationStore } from '@/store/collaborationStore';
import { useStreamManager } from '@/hooks/useStreamManager';
import { SSEService } from '@/services/sseService';
import { SSEMessage, SSEMessageType, TokenChunk } from '@/types';
import { createLogger } from '@/utils/logger';
import { SynchronizedResizablePanels } from './SynchronizedResizablePanels';

interface Props {
  sseService: SSEService;
}

// Type guard to check if payload is a TokenChunk
function isTokenChunk(payload: unknown): payload is TokenChunk {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'modelId' in payload &&
    'phase' in payload &&
    'tokens' in payload &&
    'isComplete' in payload
  );
}

const logger = createLogger('SynergizerArena');

export function SynergizerArena({ sseService }: Props): JSX.Element {
  const { 
    selectedModels,
    models, 
    isStreaming, 
    setPrompt, 
    setStreaming,
    setSessionId, 
  } = useCollaborationStore();

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const synthesisRef = useRef<HTMLDivElement>(null);

  const leftStreamManager = useStreamManager({ containerRef: leftPanelRef });
  const rightStreamManager = useStreamManager({ containerRef: rightPanelRef });
  const synthesisStreamManager = useStreamManager({ containerRef: synthesisRef });

  const [promptInput, setPromptInput] = useState('');
  const [hasScrolledToSynthesis, setHasScrolledToSynthesis] = useState(false);
  const [isSynthesisActive, setIsSynthesisActive] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return (): void => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const scrollToSynthesis = useCallback(() => {
    if (synthesisRef.current && !hasScrolledToSynthesis && isSynthesisActive) {
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Debounce the scroll to avoid conflicts
      scrollTimeoutRef.current = setTimeout(() => {
        if (!synthesisRef.current) return;
        
        // Get the header height (sticky header)
        const header = document.querySelector('header');
        const headerHeight = header ? header.offsetHeight : 64; // fallback to 64px
        
        // Calculate target position
        const targetPosition = synthesisRef.current.offsetTop - headerHeight - 20; // 20px extra padding
        
        // Smooth scroll to synthesis panel
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
        
        setHasScrolledToSynthesis(true);
        logger.info('Auto-scrolled to synthesis panel');
      }, 500); // Wait 500ms to let other scrolls settle
    }
  }, [hasScrolledToSynthesis, isSynthesisActive]);

  const handleSSEMessage = useCallback((message: SSEMessage) => {
    if (message.type === SSEMessageType.TOKEN_CHUNK && isTokenChunk(message.payload)) {
      const chunk = message.payload;
      
      // Check if this is synthesis content
      if (chunk.modelId === 'synthesis') {
        synthesisStreamManager.appendTokens(chunk);
        // Mark synthesis as active and trigger scroll on first synthesis token
        if (!isSynthesisActive && chunk.tokens.length > 0) {
          setIsSynthesisActive(true);
          // Disable auto-scrolling on model panels during synthesis
          leftStreamManager.setScrollingEnabled(false);
          rightStreamManager.setScrollingEnabled(false);
        }
        if (!hasScrolledToSynthesis && chunk.tokens.length > 0) {
          scrollToSynthesis();
        }
      } else if (selectedModels) {
        // Route tokens to appropriate panel
        if (chunk.modelId === selectedModels[0]) {
          leftStreamManager.appendTokens(chunk);
        } else if (chunk.modelId === selectedModels[1]) {
          rightStreamManager.appendTokens(chunk);
        }
      }
    } else if (message.type === SSEMessageType.SYNTHESIS_UPDATE && isTokenChunk(message.payload)) {
      const chunk = message.payload;
      synthesisStreamManager.appendTokens(chunk);
      // Mark synthesis as active and trigger scroll for SYNTHESIS_UPDATE messages
      if (!isSynthesisActive && chunk.tokens.length > 0) {
        setIsSynthesisActive(true);
        // Disable auto-scrolling on model panels during synthesis
        leftStreamManager.setScrollingEnabled(false);
        rightStreamManager.setScrollingEnabled(false);
      }
      if (!hasScrolledToSynthesis && chunk.tokens.length > 0) {
        scrollToSynthesis();
      }
    }
  }, [selectedModels, leftStreamManager, rightStreamManager, synthesisStreamManager, hasScrolledToSynthesis, isSynthesisActive, scrollToSynthesis]);

  const handleCopy = async (ref: React.RefObject<HTMLDivElement>, panelName: string): Promise<void> => {
    if (!ref.current) return;
    
    try {
      const text = ref.current.innerText;
      await navigator.clipboard.writeText(text);
      logger.info(`Copied ${panelName} content to clipboard`);
      
      // Optional: Show a toast or feedback
      // You could add a toast notification here
    } catch (error) {
      logger.error(`Failed to copy ${panelName} content:`, error);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    logger.info('Submit button clicked');
    logger.debug('Selected models:', selectedModels);
    logger.debug('Prompt input:', promptInput);
    
    if (!selectedModels || selectedModels.length < 2 || !promptInput.trim()) {
      logger.error('Validation failed - models or prompt missing');
      return;
    }

    try {
      logger.debug('Clearing previous content');
      // Clear previous content
      leftStreamManager.clear();
      rightStreamManager.clear();
      synthesisStreamManager.clear();

      // Reset scroll flags for new collaboration
      setHasScrolledToSynthesis(false);
      setIsSynthesisActive(false);
      
      // Re-enable scrolling on model panels
      leftStreamManager.setScrollingEnabled(true);
      rightStreamManager.setScrollingEnabled(true);
      
      // Clear any pending scroll timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }

      setPrompt(promptInput);
      setStreaming(true);

      const sessionId = crypto.randomUUID();
      const requestBody = {
        prompt: promptInput,
        models: selectedModels,
        sessionId: sessionId,
      };
      
      logger.info('Initiating collaboration with:', requestBody);

      // Initiate collaboration
      const response = await fetch('/api/synergize/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      logger.debug('Response status:', response.status);
      logger.debug('Response headers:', response.headers);

      const data = await response.json();
      logger.debug('Response data:', data);
      
      if (data.sessionId) {
        logger.info('Connecting to SSE with sessionId:', data.sessionId);
        setSessionId(data.sessionId);
        sseService.connect(data.sessionId, handleSSEMessage);
      } else {
        logger.error('No sessionId in response');
      }
    } catch (error) {
      logger.error('Failed to start collaboration:', error);
      useCollaborationStore.getState().setError('Failed to start collaboration');
      setStreaming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Prompt Input */}
      <div className="space-y-4">
        <textarea
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          placeholder="Enter your prompt here..."
          className="jarvis-input min-h-[120px] resize-none"
          disabled={isStreaming}
        />
        <button
          onClick={handleSubmit}
          disabled={isStreaming || !promptInput.trim()}
          className="jarvis-button disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStreaming ? 'Processing...' : 'Initiate Collaboration'}
        </button>
      </div>

      {/* Model Response Panels */}
      <SynchronizedResizablePanels
        leftPanel={{
          title: models.find(m => m.id === selectedModels?.[0])?.name || selectedModels?.[0] || 'Model 1',
          content: <div ref={leftPanelRef} className="h-full" />,
          onCopy: () => handleCopy(leftPanelRef, 'Gemma')
        }}
        rightPanel={{
          title: models.find(m => m.id === selectedModels?.[1])?.name || selectedModels?.[1] || 'Model 2',
          content: <div ref={rightPanelRef} className="h-full" />,
          onCopy: () => handleCopy(rightPanelRef, 'Qwen')
        }}
      />

      {/* Synthesis Panel */}
      <div className="model-panel relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-jarvis-accent font-tech">Synthesis</h3>
          <button
            onClick={() => handleCopy(synthesisRef, 'Synthesis')}
            className="text-jarvis-accent hover:text-jarvis-primary transition-colors p-2"
            title="Copy to clipboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
        <div 
          ref={synthesisRef}
          className="min-h-[200px] p-4 bg-jarvis-darker rounded"
        />
      </div>
    </div>
  );
}
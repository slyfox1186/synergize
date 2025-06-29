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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const leftStreamManager = useStreamManager({ containerRef: leftPanelRef });
  const rightStreamManager = useStreamManager({ containerRef: rightPanelRef });
  const synthesisStreamManager = useStreamManager({ containerRef: synthesisRef });

  const [promptInput, setPromptInput] = useState('');
  const [hasScrolledToSynthesis, setHasScrolledToSynthesis] = useState(false);
  const [isSynthesisActive, setIsSynthesisActive] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const beforeUnloadHandlerRef = useRef<((e: BeforeUnloadEvent) => string) | null>(null);

  // Cleanup timeout and beforeunload handler on unmount
  useEffect(() => {
    return (): void => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (beforeUnloadHandlerRef.current) {
        window.removeEventListener('beforeunload', beforeUnloadHandlerRef.current);
      }
    };
  }, []);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to calculate the correct scrollHeight
      textareaRef.current.style.height = '120px'; // minHeight
      
      // Calculate the new height based on scrollHeight
      const scrollHeight = textareaRef.current.scrollHeight;
      const lineHeight = 24; // Approximate line height in pixels (1.5rem)
      const maxHeight = lineHeight * 8; // 8 lines max
      
      // Set the new height, capped at maxHeight
      const newHeight = Math.min(scrollHeight, maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [promptInput]);

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
    // Remove beforeunload warning when collaboration completes
    if (message.type === SSEMessageType.COLLABORATION_COMPLETE) {
      if (beforeUnloadHandlerRef.current) {
        window.removeEventListener('beforeunload', beforeUnloadHandlerRef.current);
        beforeUnloadHandlerRef.current = null;
      }
    }
    
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

  const handleCopyPrompt = async (): Promise<void> => {
    if (!promptInput.trim()) return;
    
    try {
      await navigator.clipboard.writeText(promptInput);
      logger.info('Copied prompt to clipboard');
    } catch (error) {
      logger.error('Failed to copy prompt:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Check if Enter is pressed without Shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent new line
      
      // Only submit if not streaming and prompt is not empty
      if (!isStreaming && promptInput.trim()) {
        handleSubmit();
      }
    }
    // Shift+Enter will naturally create a new line
  };

  const handleSubmit = async (): Promise<void> => {
    logger.info('Submit button clicked');
    logger.debug('Selected models', { selectedModels });
    logger.debug('Prompt input', { promptInput });
    
    if (!selectedModels || selectedModels.length < 2 || !promptInput.trim()) {
      logger.error('Validation failed - models or prompt missing');
      return;
    }

    // Warn user about not refreshing during generation
    beforeUnloadHandlerRef.current = (e: BeforeUnloadEvent): string => {
      const message = 'AI models are still generating. Are you sure you want to leave?';
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    
    window.addEventListener('beforeunload', beforeUnloadHandlerRef.current);

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

      logger.debug('Response status', { status: response.status });
      logger.debug('Response headers', { headers: Array.from(response.headers.entries()) });

      const data = await response.json();
      logger.debug('Response data', { data });
      
      if (data.sessionId) {
        logger.info('Connecting to SSE', { sessionId: data.sessionId });
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
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your prompt here... (Press Enter to submit, Shift+Enter for new line)"
            className="jarvis-input resize-none overflow-y-auto transition-height duration-150"
            style={{
              minHeight: '120px',
              lineHeight: '1.5rem'
            }}
            disabled={isStreaming}
          />
          {/* Copy button */}
          {promptInput.trim() && (
            <button
              onClick={handleCopyPrompt}
              className="absolute top-2 right-2 text-jarvis-accent hover:text-jarvis-primary transition-colors p-1.5 rounded opacity-75 hover:opacity-100"
              title="Copy prompt to clipboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          {/* Line counter */}
          <div className="absolute bottom-2 right-2 text-jarvis-muted text-xs opacity-50">
            {promptInput.length > 0 && `${promptInput.split('\n').length} line${promptInput.split('\n').length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={handleSubmit}
            disabled={isStreaming || !promptInput.trim()}
            className="jarvis-button disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStreaming ? 'Processing...' : 'Initiate Collaboration'}
          </button>
          <span className="text-jarvis-muted text-sm">
            Press <kbd className="px-2 py-1 text-xs bg-jarvis-dark rounded border border-jarvis-muted/30">Enter</kbd> to submit
          </span>
        </div>
      </div>

      {/* Model Response Panels */}
      <SynchronizedResizablePanels
        leftPanel={{
          title: models.find(m => m.id === selectedModels?.[0])?.name || selectedModels?.[0] || 'Model 1',
          content: <div ref={leftPanelRef} className="h-full" />,
          onCopy: () => handleCopy(leftPanelRef, 'Gemma'),
          onFocus: () => {
            leftStreamManager.checkScrollPosition();
            logger.debug('Left panel focused - checking scroll position');
          },
          onResizeStart: () => {
            leftStreamManager.setResizing(true);
            logger.debug('Left panel resize started - ignoring scroll events');
          },
          onResizeEnd: () => {
            leftStreamManager.setResizing(false);
            leftStreamManager.checkScrollPosition();
            logger.debug('Left panel resize ended - re-enabling scroll detection');
          }
        }}
        rightPanel={{
          title: models.find(m => m.id === selectedModels?.[1])?.name || selectedModels?.[1] || 'Model 2',
          content: <div ref={rightPanelRef} className="h-full" />,
          onCopy: () => handleCopy(rightPanelRef, 'Qwen'),
          onFocus: () => {
            rightStreamManager.checkScrollPosition();
            logger.debug('Right panel focused - checking scroll position');
          },
          onResizeStart: () => {
            rightStreamManager.setResizing(true);
            logger.debug('Right panel resize started - ignoring scroll events');
          },
          onResizeEnd: () => {
            rightStreamManager.setResizing(false);
            rightStreamManager.checkScrollPosition();
            logger.debug('Right panel resize ended - re-enabling scroll detection');
          }
        }}
      />

      {/* Synthesis Panel - Only show when synthesis is active */}
      {isSynthesisActive && (
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
      )}
    </div>
  );
}
import { useRef, useState, useCallback, useEffect } from 'react';

import { useCollaborationStore } from '@/store/collaborationStore';
import { useStreamManager } from '@/hooks/useStreamManager';
import { SSEService } from '@/services/sseService';
import { SSEMessage, SSEMessageType, TokenChunk, CollaborationPhase } from '@/types';
import { createLogger } from '@/utils/logger';
import { SynchronizedResizablePanels } from './SynchronizedResizablePanels';
import { MathAwareRenderer, SynthesisMathRenderer } from './MathAwareRenderer';

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

  // Container refs for panels
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const synthesisRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Stream manager for content state (no more containerRef!)
  const streamManager = useStreamManager({});
  const { streamContents } = streamManager;


  const [promptInput, setPromptInput] = useState('');
  const [hasScrolledToSynthesis, setHasScrolledToSynthesis] = useState(false);
  const [isSynthesisActive, setIsSynthesisActive] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const beforeUnloadHandlerRef = useRef<((e: BeforeUnloadEvent) => string) | null>(null);

  // Initialize component - clear any residual content from previous sessions
  useEffect(() => {
    logger.info('SynergizerArena initializing - clearing all content');
    
    // Clear stream manager
    streamManager.clear();
    
    // Reset all local state
    setPromptInput('');
    setHasScrolledToSynthesis(false);
    setIsSynthesisActive(false);
    
    // Clear any pending timeouts
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    
    // Remove any existing beforeunload handlers
    if (beforeUnloadHandlerRef.current) {
      window.removeEventListener('beforeunload', beforeUnloadHandlerRef.current);
      beforeUnloadHandlerRef.current = null;
    }
    
    // Reset collaboration store to ensure clean state
    const store = useCollaborationStore.getState();
    store.setPrompt('');
    store.setStreaming(false);
    store.setPhase(CollaborationPhase.IDLE);
    store.setStatusMessage(null);
    store.setError(null);
    
    logger.info('SynergizerArena initialization complete - ready for new session');
  }, []); // Remove stream manager dependencies to prevent infinite loop

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

  // Simple token processing - just updates state and scrolls after DOM update
  const processTokens = useCallback((chunk: TokenChunk): void => {
    // Allow completion signals to pass through, but ignore empty non-completion chunks
    if (chunk.tokens.length === 0 && !chunk.isComplete) return;
    
    // Update state - this includes handling completion signals
    streamManager.appendTokens(chunk);
    
    // Skip scrolling logic for completion signals
    if (chunk.isComplete) return;
    
    // Double RAF to ensure React has completed render cycle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (chunk.modelId === selectedModels?.[0] && leftPanelRef.current) {
          const container = leftPanelRef.current;
          container.scrollTop = container.scrollHeight;
        } else if (chunk.modelId === selectedModels?.[1] && rightPanelRef.current) {
          const container = rightPanelRef.current;
          container.scrollTop = container.scrollHeight;
        }
      });
    });
  }, [streamManager, selectedModels]);

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
      
      // Process tokens with proper scrolling
      processTokens(chunk);
      
      // Check if this is synthesis content
      if (chunk.modelId === 'synthesis') {
        // Mark synthesis as active and trigger scroll on first synthesis token OR first empty activation signal
        if (!isSynthesisActive) {
          setIsSynthesisActive(true);
        }
        if (!hasScrolledToSynthesis && chunk.tokens.length > 0) {
          scrollToSynthesis();
        }
      }
    }
  }, [processTokens, hasScrolledToSynthesis, isSynthesisActive, scrollToSynthesis]);


  // Updated copy function to work with streamContents
  const handleCopyContent = async (modelId: string, panelName: string): Promise<void> => {
    try {
      // Get content for the specific model from streamContents
      const contentEntries = Array.from(streamContents.entries())
        .filter(([key]) => key.endsWith(`-${modelId}`))
        .map(([, content]) => content.content);
      
      if (contentEntries.length === 0) {
        logger.warn(`No content found for ${panelName}`);
        return;
      }
      
      // Join all content with separators, preserving LaTeX notation
      const text = contentEntries.join('\n\n---\n\n');
      await navigator.clipboard.writeText(text);
      logger.info(`Copied ${panelName} content to clipboard (${text.length} characters)`);
      
    } catch (error) {
      logger.error(`Failed to copy ${panelName} content:`, error);
    }
  };

  // Legacy copy function for synthesis panel
  const handleCopy = async (ref: React.RefObject<HTMLDivElement>, panelName: string): Promise<void> => {
    if (panelName === 'Synthesis') {
      // Use streamContents for synthesis
      return handleCopyContent('synthesis', panelName);
    }
    
    // Fallback to DOM method for other cases
    if (!ref.current) return;
    
    try {
      const text = ref.current.innerText;
      await navigator.clipboard.writeText(text);
      logger.info(`Copied ${panelName} content to clipboard`);
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
      streamManager.clear();

      // Reset scroll flags for new collaboration
      setHasScrolledToSynthesis(false);
      setIsSynthesisActive(false);
      
      
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
        createdAt: new Date().toISOString(), // Add timestamp for session validation
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
        // Enable user-initiated connection and then connect
        sseService.enableUserInitiatedConnection();
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
    <div className="flex flex-col h-full">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">

      {/* Processing Indicator - Centered */}
      {isStreaming && (
        <div className="text-center py-8">
          <p className="text-synergy-accent font-tech uppercase tracking-wider mb-4">Processing...</p>
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-synergy-primary"></div>
        </div>
      )}

      {/* Model Response Panels */}
      <SynchronizedResizablePanels
        leftPanel={{
          title: models.find(m => m.id === selectedModels?.[0])?.name || selectedModels?.[0] || 'Model 1',
          content: (
            <div ref={leftPanelRef} className="h-full overflow-y-auto overflow-x-hidden scroll-smooth p-4 pb-6">
              {((): JSX.Element[] => {
                const entries = Array.from(streamContents.entries());
                const filtered = entries.filter(([key]) => selectedModels && key.endsWith(`-${selectedModels[0]}`));
                
                logger.info('LEFT PANEL RENDER', {
                  totalEntries: entries.length,
                  filteredEntries: filtered.length,
                  keys: entries.map(([k]) => k),
                  selectedModel: selectedModels?.[0]
                });
                
                return filtered.map(([key, content]): JSX.Element => (
                  <MathAwareRenderer
                    key={key}
                    content={content.content}
                    phase={content.phase}
                    modelId={content.modelId}
                    className="mb-4"
                  />
                ));
              })()}
            </div>
          ),
          onCopy: () => handleCopyContent(selectedModels?.[0] || '', 'Left Panel'),
        }}
        rightPanel={{
          title: models.find(m => m.id === selectedModels?.[1])?.name || selectedModels?.[1] || 'Model 2',
          content: (
            <div ref={rightPanelRef} className="h-full overflow-y-auto overflow-x-hidden scroll-smooth p-4 pb-8">
              {((): JSX.Element[] => {
                const entries = Array.from(streamContents.entries());
                const filtered = entries.filter(([key]) => selectedModels && key.endsWith(`-${selectedModels[1]}`));
                
                logger.error('🟡 RIGHT PANEL RENDER', {
                  totalEntries: entries.length,
                  filteredEntries: filtered.length,
                  keys: entries.map(([k]) => k),
                  selectedModel: selectedModels?.[1],
                  contentLengths: filtered.map(([k, c]) => ({ 
                    key: k, 
                    len: c.content.length,
                    first20: c.content.substring(0, 20),
                    last20: c.content.slice(-20)
                  }))
                });
                
                // Check if content is actually there
                filtered.forEach(([key, content]): void => {
                  if (!content.content) {
                    logger.error('🔴 EMPTY CONTENT IN RENDER', { key });
                  }
                });
                
                return filtered.map(([key, content]): JSX.Element => (
                  <MathAwareRenderer
                    key={key}
                    content={content.content}
                    phase={content.phase}
                    modelId={content.modelId}
                    className="mb-4"
                  />
                ));
              })()}
            </div>
          ),
          onCopy: () => handleCopyContent(selectedModels?.[1] || '', 'Right Panel'),
        }}
      />

        {/* Synthesis Panel - Only show when synthesis is active */}
        {isSynthesisActive && (
          <div className="model-panel relative">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-synergy-accent font-tech">Synthesis</h3>
              <button
                onClick={() => handleCopy(synthesisRef, 'Synthesis')}
                className="text-synergy-accent hover:text-synergy-primary transition-colors p-2"
                title="Copy to clipboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <div 
              ref={synthesisRef}
              className="min-h-[200px] p-4 bg-synergy-darker rounded overflow-y-auto"
            >
              {Array.from(streamContents.entries())
                .filter(([key]) => key.includes('-synthesis'))
                .map(([key, content]) => (
                  <SynthesisMathRenderer
                    key={key}
                    content={content.content}
                    className="mb-4"
                  />
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom input area */}
      <div className="border-t border-synergy-primary/20 bg-synergy-darker/90 backdrop-blur-sm p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your prompt here... (Press Enter to submit, Shift+Enter for new line)"
              className="synergy-input resize-none overflow-y-auto transition-height duration-150 w-full"
              style={{
                minHeight: '80px',
                maxHeight: '200px',
                lineHeight: '1.5rem'
              }}
              disabled={isStreaming}
            />
            {/* Copy button */}
            {promptInput.trim() && (
              <button
                onClick={handleCopyPrompt}
                className="absolute top-2 right-2 text-synergy-accent hover:text-synergy-primary transition-colors p-1.5 rounded opacity-75 hover:opacity-100"
                title="Copy prompt to clipboard"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}
            {/* Line counter */}
            <div className="absolute bottom-2 right-2 text-synergy-muted text-xs opacity-50">
              {promptInput.length > 0 && `${promptInput.split('\n').length} line${promptInput.split('\n').length !== 1 ? 's' : ''}`}
            </div>
          </div>
          {!isStreaming && (
            <div className="flex justify-center">
              <button
                onClick={handleSubmit}
                disabled={!promptInput.trim()}
                className="synergy-button disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Initiate Collaboration
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
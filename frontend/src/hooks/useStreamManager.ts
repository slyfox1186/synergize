import { useRef, useEffect, useCallback } from 'react';
import markdownit from 'markdown-it';

import { TokenChunk } from '@/types';
import { createLogger } from '@/utils/logger';

interface StreamManagerOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPhaseChange?: (phase: string) => void;
}

// Initialize markdown-it with safe defaults
const md = markdownit({
  html: false,           // Disable raw HTML for safety
  linkify: true,         // Auto-convert URLs to links
  typographer: true,     // Enable smart quotes
  breaks: true,          // Convert \n to <br>
});

const logger = createLogger('StreamManager');

export class StreamManager {
  private readonly containerRef: React.RefObject<HTMLDivElement | null>;
  private currentPhase: string = '';
  private currentModelId: string = '';
  private readonly phaseContainers = new Map<string, HTMLDivElement>();
  private readonly bufferMap = new Map<string, string>();  // Store accumulated markdown per phase
  private readonly completedResponses = new Map<string, boolean>(); // Track completed responses per model/phase
  private scrollingEnabled: boolean = true;
  private scrollableParent: HTMLElement | null = null;
  private scrollListener: (() => void) | null = null;
  private lastScrollCheck: number = 0;
  private userHasScrolled: boolean = false;
  private ignoreNextScrollEvent: boolean = false;
  private isResizing: boolean = false;

  constructor(containerRef: React.RefObject<HTMLDivElement | null>) {
    this.containerRef = containerRef;
    // Don't initialize scroll detection immediately - wait for content
  }

  private initializeScrollDetection(): void {
    const container = this.containerRef.current;
    if (!container) return;

    // Find the scrollable parent
    this.scrollableParent = container.closest('.overflow-y-auto') as HTMLElement;
    if (!this.scrollableParent) {
      // Try to find it in parent elements
      let parent = container.parentElement;
      while (parent && !this.scrollableParent) {
        if (parent.classList.contains('overflow-y-auto')) {
          this.scrollableParent = parent;
          break;
        }
        parent = parent.parentElement;
      }
      
      if (!this.scrollableParent) {
        // Try again later if DOM is still loading
        setTimeout(() => this.initializeScrollDetection(), 50);
        return;
      }
    }

    // Remove existing listener if any
    if (this.scrollListener) {
      this.scrollableParent.removeEventListener('scroll', this.scrollListener);
    }

    // Add scroll listener to detect user interaction
    this.scrollListener = (): void => {
      if (!this.scrollableParent) return;
      
      // Ignore scroll events that happen immediately after DOM changes
      if (this.ignoreNextScrollEvent) {
        this.ignoreNextScrollEvent = false;
        return;
      }
      
      // Ignore scroll events during resize operations
      if (this.isResizing) {
        return;
      }
      
      const now = Date.now();
      // Throttle scroll checks to every 100ms
      if (now - this.lastScrollCheck < 100) return;
      this.lastScrollCheck = now;
      
      const { scrollTop, scrollHeight, clientHeight } = this.scrollableParent;
      const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
      const isAtBottom = distanceFromBottom < 80; // Increased from 50 to 80px - easier to re-engage
      
      // Only mark user interaction if they scroll significantly away from bottom
      if (distanceFromBottom > 40) { // Reduced from 100 to 40 - easier to disengage
        this.userHasScrolled = true;
      }
      
      // Re-enable autoscroll if user scrolls near bottom
      if (isAtBottom && !this.scrollingEnabled) {
        this.scrollingEnabled = true;
        this.userHasScrolled = false; // Reset user interaction flag
        logger.debug('Auto-scroll re-enabled', { distanceFromBottom });
      }
      // Disable autoscroll only if user scrolls significantly away from bottom
      else if (distanceFromBottom > 30 && this.scrollingEnabled) { // Reduced from 75 to 30 - easier to disengage
        this.scrollingEnabled = false;
        logger.debug('Auto-scroll disabled', { distanceFromBottom });
      }
    };

    this.scrollableParent.addEventListener('scroll', this.scrollListener, { 
      passive: true,
      capture: false
    });
    
    // Set initial scroll state
    if (this.scrollableParent) {
      const { scrollTop, scrollHeight, clientHeight } = this.scrollableParent;
      const isAtBottom = scrollHeight - clientHeight - scrollTop < 80; // Increased from 50 to 80px - easier to re-engage
      this.scrollingEnabled = isAtBottom;
    }
  }

  appendTokens(chunk: TokenChunk): void {
    // Handle phase changes
    if (chunk.phase !== this.currentPhase || chunk.modelId !== this.currentModelId) {
      this.currentPhase = chunk.phase;
      this.currentModelId = chunk.modelId;
      this.ensurePhaseContainer(chunk.phase, chunk.modelId);
    }

    const key = `${this.currentPhase}-${this.currentModelId}`;
    
    // Handle completion signal
    if (chunk.isComplete) {
      this.completedResponses.set(key, true);
      return; // Don't process empty tokens on completion
    }

    // Append tokens to buffer and render
    if (chunk.tokens.length > 0) {
      const contentContainer = this.phaseContainers.get(key);
      if (contentContainer) {
        const textToAppend = chunk.tokens.join('');
        
        // Check if this is the start of a new response after completion
        const wasCompleted = this.completedResponses.get(key) || false;
        
        // Accumulate text in buffer with proper separation
        const currentBuffer = this.bufferMap.get(key) || '';
        let newBuffer: string;
        
        if (wasCompleted && currentBuffer.length > 0) {
          // Add separator before new response (after previous was completed)
          newBuffer = currentBuffer + '\n\n---\n\n' + textToAppend;
          this.completedResponses.set(key, false); // Mark as active again
        } else {
          // Continue existing response or start first response
          newBuffer = currentBuffer + textToAppend;
        }
        
        this.bufferMap.set(key, newBuffer);
        
        // Render the entire accumulated markdown
        const rendered = md.render(newBuffer);
        contentContainer.innerHTML = rendered;

        // Auto-scroll to bottom (only for non-synthesis content and when enabled)
        if (this.currentModelId !== 'synthesis') {
          this.performAutoScroll();
        }
      }
    }
  }

  private ensurePhaseContainer(phase: string, modelId: string): void {
    const key = `${phase}-${modelId}`;
    if (!this.phaseContainers.has(key)) {
      const container = this.containerRef.current;
      if (!container) {
        return;
      }

      // Create phase section
      const phaseDiv = document.createElement('div');
      phaseDiv.className = 'phase-section mb-6 animate-phase-transition';
      phaseDiv.dataset.phase = phase;
      phaseDiv.dataset.model = modelId;

      // Add phase header
      const header = document.createElement('div');
      header.className = 'phase-header text-jarvis-accent font-tech text-sm mb-2 uppercase tracking-wider';
      header.textContent = `${phase} - ${modelId}`;
      phaseDiv.appendChild(header);

      // Add content container with markdown-specific styling
      const content = document.createElement('div');
      content.className = 'phase-content text-jarvis-text markdown-content prose prose-invert max-w-none';
      phaseDiv.appendChild(content);

      // Flag to ignore scroll events triggered by DOM changes
      this.ignoreNextScrollEvent = true;
      
      container.appendChild(phaseDiv);
      this.phaseContainers.set(key, content);
      
      // Initialize scroll detection when we start adding content
      if (!this.scrollableParent) {
        this.initializeScrollDetection();
      }
    }
  }

  clear(): void {
    this.phaseContainers.clear();
    this.bufferMap.clear();
    this.completedResponses.clear();
    
    const container = this.containerRef.current;
    if (container) {
      container.innerHTML = '';
    }
    
    // Reset state for new content
    this.scrollingEnabled = true;
    this.userHasScrolled = false;
    this.ignoreNextScrollEvent = false;
  }

  setScrollingEnabled(enabled: boolean): void {
    this.scrollingEnabled = enabled;
  }

  setResizing(resizing: boolean): void {
    this.isResizing = resizing;
  }

  isScrollingEnabled(): boolean {
    return this.scrollingEnabled;
  }

  private performAutoScroll(): void {
    if (!this.scrollingEnabled || !this.scrollableParent) return;
    
    // Don't auto-scroll if user has recently interacted and isn't near bottom
    if (this.userHasScrolled) {
      const { scrollTop, scrollHeight, clientHeight } = this.scrollableParent;
      const isNearBottom = scrollHeight - clientHeight - scrollTop < 80; // Increased from 50 to 80px - easier to re-engage
      if (!isNearBottom) return;
      // User is near bottom, so allow auto-scroll and reset interaction flag
      this.userHasScrolled = false;
    }
    
    // Use instant scrolling for streaming content to avoid interrupting
    // smooth scroll animations, which can cause jank or state issues
    const behavior = 'instant';
    
    // Schedule scroll for the next event loop tick to ensure the layout
    // has been updated with the new content
    setTimeout(() => {
      if (this.scrollableParent && this.scrollingEnabled) {
        const { scrollHeight } = this.scrollableParent;
        this.scrollableParent.scrollTo({
          top: scrollHeight,
          behavior: behavior as ScrollBehavior
        });
      }
    }, 0);
  }

  checkScrollPosition(): void {
    // Force re-check current scroll position and update autoscroll state
    if (!this.scrollableParent) {
      this.initializeScrollDetection();
      return;
    }
    
    const { scrollTop, scrollHeight, clientHeight } = this.scrollableParent;
    const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
    const wasEnabled = this.scrollingEnabled;
    
    // Update scroll state based on current position
    this.scrollingEnabled = distanceFromBottom < 80; // Increased from 50 to 80px - easier to re-engage
    
    if (wasEnabled !== this.scrollingEnabled) {
      logger.debug('Scroll state updated', { 
        enabled: this.scrollingEnabled, 
        distanceFromBottom 
      });
    }
    
    // If we're at bottom, perform an immediate scroll to ensure we're fully aligned
    if (this.scrollingEnabled && distanceFromBottom > 0 && distanceFromBottom < 80) { // Increased from 50 to 80px - easier to re-engage
      this.scrollableParent.scrollTo({
        top: scrollHeight,
        behavior: 'instant' as ScrollBehavior
      });
    }
  }

  cleanup(): void {
    // Remove scroll listener
    if (this.scrollListener && this.scrollableParent) {
      this.scrollableParent.removeEventListener('scroll', this.scrollListener);
      this.scrollListener = null;
      this.scrollableParent = null;
    }
  }
}

export function useStreamManager({ containerRef, onPhaseChange }: StreamManagerOptions): { appendTokens: (chunk: TokenChunk) => void; clear: () => void; setScrollingEnabled: (enabled: boolean) => void; checkScrollPosition: () => void; setResizing: (resizing: boolean) => void } {
  const managerRef = useRef<StreamManager | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const manager = new StreamManager(containerRef);
    managerRef.current = manager;

    return (): void => {
      manager.cleanup();
    };
  }, [containerRef]);

  const appendTokens = useCallback((chunk: TokenChunk) => {
    if (managerRef.current) {
      managerRef.current.appendTokens(chunk);
      if (onPhaseChange && chunk.phase) {
        onPhaseChange(chunk.phase);
      }
    }
  }, [onPhaseChange]);

  const clear = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.clear();
    }
  }, []);

  const setScrollingEnabled = useCallback((enabled: boolean) => {
    if (managerRef.current) {
      managerRef.current.setScrollingEnabled(enabled);
    }
  }, []);

  const checkScrollPosition = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.checkScrollPosition();
    }
  }, []);

  const setResizing = useCallback((resizing: boolean) => {
    if (managerRef.current) {
      managerRef.current.setResizing(resizing);
    }
  }, []);

  return { appendTokens, clear, setScrollingEnabled, checkScrollPosition, setResizing };
}
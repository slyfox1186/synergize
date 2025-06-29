import { useRef, useEffect, useCallback } from 'react';
import markdownit from 'markdown-it';

import { TokenChunk } from '@/types';

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
      // Try again later when DOM is fully ready
      setTimeout(() => this.initializeScrollDetection(), 100);
      return;
    }

    // Remove existing listener if any
    if (this.scrollListener) {
      this.scrollableParent.removeEventListener('scroll', this.scrollListener);
    }

    // Add scroll listener to detect when user scrolls to bottom
    this.scrollListener = (): void => {
      if (!this.scrollableParent) return;
      
      // Use requestAnimationFrame to avoid blocking other events
      requestAnimationFrame(() => {
        if (!this.scrollableParent) return;
        
        const { scrollTop, scrollHeight, clientHeight } = this.scrollableParent;
        const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 5; // 5px tolerance
        
        // Re-enable autoscroll if user scrolls to bottom
        if (isAtBottom && !this.scrollingEnabled) {
          this.scrollingEnabled = true;
        }
        // Disable autoscroll if user scrolls up
        else if (!isAtBottom && this.scrollingEnabled) {
          this.scrollingEnabled = false;
        }
      });
    };

    this.scrollableParent.addEventListener('scroll', this.scrollListener, { 
      passive: true
    });
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
        const container = this.containerRef.current;
        if (container && this.currentModelId !== 'synthesis' && this.scrollingEnabled) {
          // Find the scrollable parent container (has overflow-y-auto)
          const scrollableParent = container.closest('.overflow-y-auto') as HTMLElement;
          if (scrollableParent) {
            scrollableParent.scrollTop = scrollableParent.scrollHeight;
          }
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

      container.appendChild(phaseDiv);
      this.phaseContainers.set(key, content);
      
      // Initialize scroll detection only when we start adding content
      if (!this.scrollableParent && this.containerRef.current) {
        // Use a small delay to ensure DOM is ready
        setTimeout(() => this.initializeScrollDetection(), 10);
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
  }

  setScrollingEnabled(enabled: boolean): void {
    this.scrollingEnabled = enabled;
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

export function useStreamManager({ containerRef, onPhaseChange }: StreamManagerOptions): { appendTokens: (chunk: TokenChunk) => void; clear: () => void; setScrollingEnabled: (enabled: boolean) => void } {
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

  return { appendTokens, clear, setScrollingEnabled };
}
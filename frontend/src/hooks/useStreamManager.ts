import { useRef, useCallback, useState } from 'react';
import { TokenChunk } from '@/types';
import { createLogger } from '@/utils/logger';

interface StreamManagerOptions {
  onPhaseChange?: (phase: string) => void;
}

interface StreamContent {
  phase: string;
  modelId: string;
  content: string;
  isComplete: boolean;
  hasIncompleteMath: boolean;
}

const logger = createLogger('StreamManager');

/**
 * React-based stream manager for managing token stream state.
 * This hook is now decoupled from the DOM and only manages the content map.
 */
export function useStreamManager({ onPhaseChange }: StreamManagerOptions): {
  streamContents: Map<string, StreamContent>;
  appendTokens: (chunk: TokenChunk) => void;
  clear: () => void;
} {
  // State to store all stream content for React rendering
  const [streamContents, setStreamContents] = useState<Map<string, StreamContent>>(new Map());
  
  // Buffer management
  const bufferMap = useRef<Map<string, string>>(new Map());
  const completedResponses = useRef<Map<string, boolean>>(new Map());

  const appendTokens = useCallback((chunk: TokenChunk) => {
    const key = `${chunk.phase}-${chunk.modelId}`;
    
    // Handle completion signal
    if (chunk.isComplete) {
      completedResponses.current.set(key, true);
      
      // Log completion for debugging
      const bufferContent = bufferMap.current.get(key) || '';
      logger.info('✅ COMPLETION SIGNAL', {
        key,
        modelId: chunk.modelId,
        phase: chunk.phase,
        bufferLength: bufferContent.length,
        hasBuffer: Boolean(bufferContent),
        finalContent: bufferContent.slice(-50) // Last 50 chars for debugging
      });
      
      // Mark the final state as complete in the map
      setStreamContents(prev => {
        const newMap = new Map(prev);
        const existingContent = newMap.get(key);
        // CRITICAL FIX: Preserve the buffer content when marking as complete
        const finalContent = bufferMap.current.get(key) || existingContent?.content || '';
        
        // Ensure we don't lose content on completion
        if (finalContent.trim()) {
          newMap.set(key, {
            phase: chunk.phase,
            modelId: chunk.modelId,
            content: finalContent,  // Use the buffer content, not just existing
            isComplete: true,
            hasIncompleteMath: false
          });
          
          logger.info('✅ FINAL CONTENT SET', {
            key,
            contentLength: finalContent.length,
            preview: finalContent.substring(0, 100) + (finalContent.length > 100 ? '...' : '')
          });
        } else {
          logger.warn('⚠️ COMPLETION WITHOUT CONTENT', { key, existingContent: existingContent?.content?.slice(0, 50) });
        }
        
        return newMap;
      });
      return;
    }

    // Append tokens to buffer
    if (chunk.tokens.length > 0) {
      const textToAppend = chunk.tokens.join('');
      
      // Check if this is the start of a new response after completion
      const wasCompleted = completedResponses.current.get(key) || false;
      
      // Accumulate text in buffer with proper separation
      const currentBuffer = bufferMap.current.get(key) || '';
      let newBuffer: string;
      
      if (wasCompleted && currentBuffer.length > 0) {
        // Add separator before new response (after previous was completed)
        newBuffer = currentBuffer + '\n\n---\n\n' + textToAppend;
        completedResponses.current.set(key, false); // Mark as active again
      } else {
        // Continue existing response or start first response
        newBuffer = currentBuffer + textToAppend;
      }
      
      bufferMap.current.set(key, newBuffer);

      // Update React state immediately for smooth streaming
      setStreamContents(prev => {
        const newMap = new Map(prev);
        newMap.set(key, {
          phase: chunk.phase,
          modelId: chunk.modelId,
          content: newBuffer,
          isComplete: false,
          hasIncompleteMath: false
        });
        return newMap;
      });

      // Trigger phase change callback
      if (onPhaseChange && chunk.phase) {
        onPhaseChange(chunk.phase);
      }
    }
  }, [onPhaseChange]);

  const clear = useCallback(() => {
    setStreamContents(new Map());
    bufferMap.current.clear();
    completedResponses.current.clear();
    logger.debug('Stream manager cleared');
  }, []);

  return {
    streamContents,
    appendTokens,
    clear,
  };
}

export default useStreamManager;
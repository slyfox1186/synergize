import React, { useMemo, useRef, useEffect } from 'react';
import markdownit from 'markdown-it';

// markdown-it state types
interface MarkdownItState {
  src: string;
  pos: number;
  posMax: number;
  push: (type: string, tag: string, nesting: number) => { content: string };
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  line: number;
  getLines: (start: number, end: number, indent: number, keepEmpty: boolean) => string;
}

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements: Element[]) => Promise<void>;
      startup?: {
        promise?: Promise<void>;
      };
    };
  }
}

// Custom rule to protect math delimiters from markdown processing
function mathProtect(md: markdownit): void {
  const mathInline = (state: MarkdownItState, silent: boolean): boolean => {
    const start = state.pos;
    const max = state.posMax;
    
    // Check for opening $
    if (state.src[start] !== '$') return false;
    
    // Find closing $
    let pos = start + 1;
    while (pos < max && state.src[pos] !== '$') {
      if (state.src[pos] === '\\') pos++; // Skip escaped characters
      pos++;
    }
    
    // No closing delimiter found
    if (pos >= max || state.src[pos] !== '$') return false;
    
    // Don't match empty content
    if (pos === start + 1) return false;
    
    if (!silent) {
      const token = state.push('html_inline', '', 0);
      token.content = state.src.slice(start, pos + 1);
    }
    
    state.pos = pos + 1;
    return true;
  };
  
  const mathBlock = (state: MarkdownItState, startLine: number, endLine: number, silent: boolean): boolean => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    
    // Check for $$
    if (start + 2 > max) return false;
    if (state.src.slice(start, start + 2) !== '$$') return false;
    
    // Find closing $$
    let nextLine = startLine;
    let found = false;
    
    while (nextLine < endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      
      if (lineStart < lineEnd) {
        const pos = state.src.indexOf('$$', lineStart);
        if (pos >= lineStart && pos < lineEnd) {
          found = true;
          break;
        }
      }
      nextLine++;
    }
    
    if (!found) return false;
    
    if (!silent) {
      const token = state.push('html_block', '', 0);
      token.content = state.getLines(startLine, nextLine + 1, 0, true).trim();
    }
    
    state.line = nextLine + 1;
    return true;
  };
  
  md.inline.ruler.before('escape', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock);
}

const md = markdownit({
  html: true,
  linkify: true,
  typographer: false,
  breaks: true,
}).use(mathProtect);

interface MathAwareRendererProps {
  content: string;
  phase: string;
  modelId: string;
  className?: string;
}

/**
 * Component that renders markdown content with MathJax support
 * Optimized for real-time token streaming
 */
export const MathAwareRenderer: React.FC<MathAwareRendererProps> = ({
  content,
  phase,
  modelId,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Early return for empty content
  if (!content.trim()) {
    return <div className={className} />;
  }

  // Render markdown
  const html = useMemo(() => {
    try {
      return md.render(content);
    } catch (e) {
      // If markdown-it fails, return escaped content
      return `<pre>${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    }
  }, [content]);

  // Use effect to update innerHTML to avoid React reconciliation issues
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = html;
      
      // Process math with MathJax if available
      if (window.MathJax?.typesetPromise) {
        // Ensure MathJax is ready before typesetting
        const typesetMath = async (): Promise<void> => {
          try {
            // Wait for MathJax to be ready if needed
            if (window.MathJax.startup?.promise) {
              await window.MathJax.startup.promise;
            }
            await window.MathJax.typesetPromise([containerRef.current]);
          } catch (e) {
            // Ignore errors during streaming
          }
        };
        typesetMath();
      }
    }
  }, [html]);

  return (
    <div 
      className={`markdown-wrapper ${className}`}
      data-phase={phase}
      data-model={modelId}
    >
      <div ref={containerRef} className="markdown-content" />
    </div>
  );
};

/**
 * Optimized version for synthesis content that may have complex mathematics
 */
export const SynthesisMathRenderer: React.FC<Omit<MathAwareRendererProps, 'phase' | 'modelId'>> = ({
  content,
  className = ''
}) => {
  return (
    <MathAwareRenderer
      content={content}
      phase="synthesis"
      modelId="synthesis"
      className={`synthesis-content ${className}`}
    />
  );
};


export default MathAwareRenderer;
import React, { useMemo, useRef, useEffect } from 'react';
import markdownit from 'markdown-it';

const md = markdownit({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
});

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
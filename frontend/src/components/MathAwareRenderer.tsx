import React, { useMemo } from 'react';
import MarkdownIt from 'markdown-it';

interface MarkdownRendererProps {
  content: string;
  phase: string;
  modelId: string;
  className?: string;
}

// Initialize markdown-it with proper settings
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight: function (str: string, lang: string): string {
    // Basic syntax highlighting support
    if (lang) {
      return `<pre class="language-${lang}"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    }
    return `<pre><code>${md.utils.escapeHtml(str)}</code></pre>`;
  }
});

export const MathAwareRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  phase,
  modelId,
  className = ''
}) => {
  // Render markdown to HTML
  const html = useMemo(() => {
    if (!content) return '';
    try {
      return md.render(content);
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return md.utils.escapeHtml(content);
    }
  }, [content]);

  return (
    <div 
      className={`${className}`}
      data-phase={phase}
      data-model={modelId}
    >
      <div 
        className="markdown-content" 
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

/**
 * Optimized version for synthesis content
 */
export const SynthesisMathRenderer: React.FC<Omit<MarkdownRendererProps, 'phase' | 'modelId'>> = ({
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
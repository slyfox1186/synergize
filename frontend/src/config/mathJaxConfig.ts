/**
 * MathJax Configuration for Synergize
 * Optimized for real-time token streaming and performance
 */
import { createLogger } from '@/utils/logger';

const logger = createLogger('MathJax');

export const mathJaxConfig = {
  // Use MathJax v3 for better performance
  loader: { 
    load: [
      '[tex]/html',      // HTML extension for better styling
      '[tex]/ams',       // AMS extensions for advanced math
      'ui/lazy'          // Lazy loading for off-screen equations
    ] 
  },
  
  // TeX input configuration
  tex: {
    packages: { 
      '[+]': ['html', 'ams']  // Enable HTML and AMS packages
    },
    
    // Configure delimiters for inline and display math
    inlineMath: [
      ['$', '$'],           // Standard LaTeX inline: $x^2$
      ['\\(', '\\)']        // Alternative inline: \(x^2\)
    ],
    displayMath: [
      ['$$', '$$'],         // Standard LaTeX display: $$x^2$$
      ['\\[', '\\]']        // Alternative display: \[x^2\]
    ],
    
    // Processing options for streaming content
    processEscapes: true,   // Allow \$ for literal dollar signs
    processEnvironments: true, // Process LaTeX environments
    processRefs: true,      // Process cross-references
    
    // Macros for common mathematical expressions
    macros: {
      RR: '\\mathbb{R}',    // Real numbers
      NN: '\\mathbb{N}',    // Natural numbers
      ZZ: '\\mathbb{Z}',    // Integers
      QQ: '\\mathbb{Q}',    // Rational numbers
      CC: '\\mathbb{C}',    // Complex numbers
      // Add more macros as needed for AI model outputs
    }
  },
  
  // Output configuration - use CHTML for best performance
  chtml: {
    fontURL: '/fonts/mathjax',  // Local font hosting for offline support
    adaptiveCSS: true,          // Adapt to container styling
    mathmlSpacing: false,       // Disable extra spacing
    displayAlign: 'left',       // Align with text flow
    displayIndent: '0',         // No indentation for display math
  },
  
  // Startup configuration for token streaming
  startup: {
    ready: () => {
      logger.info('MathJax loaded and ready for Synergize');
      // Custom initialization if needed
    },
    pageReady: () => {
      logger.info('MathJax page ready - initial typesetting complete');
    },
    
    // Typesetting options optimized for streaming
    typeset: true,              // Enable automatic typesetting
    
    // Performance optimization for large documents
    renderActions: {
      addMenu: [0, '', ''],     // Disable context menu for performance
    }
  },
  
  // Options configuration for better streaming performance
  options: {
    // Skip initial typesetting - we'll handle it manually for streaming
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    
    // Ignore classes that shouldn't be processed
    ignoreHtmlClass: 'no-mathjax|skip-mathjax',
    
    // Process classes that should be typeset
    processHtmlClass: 'mathjax|tex2jax_process',
    
    // Enable safe mode for user-generated content
    safeOptions: {
      allow: {
        URLs: 'none',           // Don't allow external URLs
        classes: 'none',        // Don't allow class attributes
        cssIDs: 'none',         // Don't allow id attributes
        styles: 'none'          // Don't allow style attributes
      }
    }
  },
  
  // Error handling for malformed math expressions
  errorSettings: {
    message: ['[Math Error]'],  // Custom error message
    style: {
      color: '#ff6b6b',         // Error color matching synergy theme
      border: '1px solid #ff6b6b',
      padding: '2px',
      'font-size': '90%'
    }
  }
} as const;

/**
 * Streaming-specific MathJax options for better-react-mathjax components
 */
export const streamingMathJaxOptions = {
  // Use standard rendering mode for token streaming with dangerouslySetInnerHTML
  renderMode: 'post' as const,
  
  // Hide content until typeset to prevent FOUC (Flash of Untypeset Content)
  hideUntilTypeset: 'first' as const,
  
  // Enable dynamic content updates for token streaming
  dynamic: true,
  
  // Typesetting options optimized for streaming
  typesettingOptions: {
    fn: 'tex2chtml' as const,   // Use CHTML output for speed
  }
} as const;

/**
 * Configuration for inline math in token streams
 */
export const inlineMathOptions = {
  ...streamingMathJaxOptions,
  inline: true,
} as const;

/**
 * Configuration for display math in token streams  
 */
export const displayMathOptions = {
  ...streamingMathJaxOptions,
  inline: false,
} as const;
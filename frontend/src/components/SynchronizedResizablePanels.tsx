import { useState, useRef, useCallback, ReactNode } from 'react';

interface SynchronizedResizablePanelsProps {
  leftPanel: {
    title: string;
    content: ReactNode;
    onCopy: () => void;
    onFocus?: () => void;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
  };
  rightPanel: {
    title: string;
    content: ReactNode;
    onCopy: () => void;
    onFocus?: () => void;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
  };
  minHeight?: number;
  maxHeight?: number;
  defaultHeight?: number;
}

export function SynchronizedResizablePanels({
  leftPanel,
  rightPanel,
  minHeight = 200,
  maxHeight = 800,
  defaultHeight = 400
}: SynchronizedResizablePanelsProps): JSX.Element {
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const previousHeightRef = useRef(defaultHeight);

  const handleDoubleClick = useCallback(() => {
    if (isMaximized) {
      // Restore to previous height
      setHeight(previousHeightRef.current);
      setIsMaximized(false);
    } else {
      // Store current height and maximize
      previousHeightRef.current = height;
      setHeight(maxHeight);
      setIsMaximized(true);
    }
  }, [height, maxHeight, isMaximized]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;

    // Notify stream managers that resize is starting
    leftPanel.onResizeStart?.();
    rightPanel.onResizeStart?.();

    // Add event listeners to document for smooth dragging
    const handleMouseMove = (e: MouseEvent): void => {
      const deltaY = e.clientY - startYRef.current;
      const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeightRef.current + deltaY));
      setHeight(newHeight);
      
      // If user manually resizes, exit maximize mode
      if (isMaximized) {
        setIsMaximized(false);
      }
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Notify stream managers that resize has ended
      leftPanel.onResizeEnd?.();
      rightPanel.onResizeEnd?.();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height, minHeight, maxHeight, leftPanel, rightPanel, isMaximized]);

  const resizeHandleClass = `
    absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize
    flex items-center justify-center
    transition-all duration-200
    bg-synergy-darker/80 backdrop-blur-sm
    ${isResizing 
      ? 'bg-synergy-primary/40 border-t-2 border-synergy-primary shadow-lg' 
      : 'hover:bg-synergy-primary/20 border-t-2 border-synergy-primary/40'
    }
  `;

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left Model Panel */}
      <div className="model-panel relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-synergy-primary font-tech">{leftPanel.title}</h3>
          <button
            onClick={leftPanel.onCopy}
            className="text-synergy-accent hover:text-synergy-primary transition-colors p-2"
            title="Copy to clipboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
        <div className="relative">
          <div 
            style={{ height: `${height}px` }}
            className="overflow-hidden bg-synergy-darker rounded"
            onClick={leftPanel.onFocus}
            onFocus={leftPanel.onFocus}
            tabIndex={0}
          >
            <div className="h-full">
              {leftPanel.content}
            </div>
          </div>
          
          {/* Resize Handle */}
          <div className={resizeHandleClass} onMouseDown={handleMouseDown} onDoubleClick={handleDoubleClick}>
            <div className="w-20 h-1.5 bg-synergy-primary/80 rounded-full shadow-sm" />
          </div>
        </div>
      </div>

      {/* Right Model Panel */}
      <div className="model-panel relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-synergy-primary font-tech">{rightPanel.title}</h3>
          <button
            onClick={rightPanel.onCopy}
            className="text-synergy-accent hover:text-synergy-primary transition-colors p-2"
            title="Copy to clipboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
        <div className="relative">
          <div 
            style={{ height: `${height}px` }}
            className="overflow-hidden bg-synergy-darker rounded"
            onClick={rightPanel.onFocus}
            onFocus={rightPanel.onFocus}
            tabIndex={0}
          >
            <div className="h-full">
              {rightPanel.content}
            </div>
          </div>
          
          {/* Resize Handle */}
          <div className={resizeHandleClass} onMouseDown={handleMouseDown} onDoubleClick={handleDoubleClick}>
            <div className="w-20 h-1.5 bg-synergy-primary/80 rounded-full shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
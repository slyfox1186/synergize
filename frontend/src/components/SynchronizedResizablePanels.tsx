import { useState, useRef, useCallback, ReactNode } from 'react';

interface SynchronizedResizablePanelsProps {
  leftPanel: {
    title: string;
    content: ReactNode;
    onCopy: () => void;
  };
  rightPanel: {
    title: string;
    content: ReactNode;
    onCopy: () => void;
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
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;

    // Add event listeners to document for smooth dragging
    const handleMouseMove = (e: MouseEvent): void => {
      const deltaY = e.clientY - startYRef.current;
      const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeightRef.current + deltaY));
      setHeight(newHeight);
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height, minHeight, maxHeight]);

  const resizeHandleClass = `
    absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize
    flex items-center justify-center
    transition-all duration-200
    ${isResizing 
      ? 'bg-jarvis-primary/30 border-t-2 border-jarvis-primary' 
      : 'hover:bg-jarvis-primary/10 border-t border-jarvis-primary/20'
    }
  `;

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left Model Panel */}
      <div className="model-panel relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-jarvis-primary font-tech">{leftPanel.title}</h3>
          <button
            onClick={leftPanel.onCopy}
            className="text-jarvis-accent hover:text-jarvis-primary transition-colors p-2"
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
            className="overflow-y-auto p-4 bg-jarvis-darker rounded"
          >
            {leftPanel.content}
          </div>
          
          {/* Resize Handle */}
          <div className={resizeHandleClass} onMouseDown={handleMouseDown}>
            <div className="w-16 h-1 bg-jarvis-primary/50 rounded-full" />
          </div>
        </div>
      </div>

      {/* Right Model Panel */}
      <div className="model-panel relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-jarvis-primary font-tech">{rightPanel.title}</h3>
          <button
            onClick={rightPanel.onCopy}
            className="text-jarvis-accent hover:text-jarvis-primary transition-colors p-2"
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
            className="overflow-y-auto p-4 bg-jarvis-darker rounded"
          >
            {rightPanel.content}
          </div>
          
          {/* Resize Handle */}
          <div className={resizeHandleClass} onMouseDown={handleMouseDown}>
            <div className="w-16 h-1 bg-jarvis-primary/50 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
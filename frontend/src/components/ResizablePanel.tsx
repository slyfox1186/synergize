import { useState, useRef, useCallback, ReactNode } from 'react';

interface ResizablePanelProps {
  children: ReactNode;
  minHeight?: number;
  maxHeight?: number;
  defaultHeight?: number;
  className?: string;
}

export function ResizablePanel({
  children,
  minHeight = 200,
  maxHeight = 800,
  defaultHeight = 400,
  className = ''
}: ResizablePanelProps): JSX.Element {
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="relative">
      <div
        ref={panelRef}
        style={{ height: `${height}px` }}
        className={`overflow-y-auto ${className}`}
      >
        {children}
      </div>
      
      {/* Resize Handle */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize
          flex items-center justify-center
          transition-all duration-200
          ${isResizing 
            ? 'bg-jarvis-primary/30 border-t-2 border-jarvis-primary' 
            : 'hover:bg-jarvis-primary/10 border-t border-jarvis-primary/20'
          }
        `}
        onMouseDown={handleMouseDown}
      >
        <div className="w-16 h-1 bg-jarvis-primary/50 rounded-full" />
      </div>
    </div>
  );
}
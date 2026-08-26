import { useCallback, useRef, useState } from 'react';

interface UseResizablePanelOptions {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export interface ResizablePanel {
  width: number;
  isDragging: boolean;
  onDividerMouseDown: (event: React.MouseEvent) => void;
}

export function useResizablePanel({ defaultWidth, minWidth, maxWidth }: UseResizablePanelOptions): ResizablePanel {
  const [width, setWidth] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const onDividerMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = startWidth + (moveEvent.clientX - startX);
      setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
    };
    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [minWidth, maxWidth]);

  return { width, isDragging, onDividerMouseDown };
}

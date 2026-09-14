import { useState, useEffect, useCallback, RefObject } from 'react';

interface FloatingPositionOptions {
  estimatedHeight?: number;
  estimatedWidth?: number;
  gap?: number;
  align?: 'left' | 'right';
  matchWidth?: boolean;
}

export interface FloatingCoords {
  top?: number;
  bottom?: number;
  left: number;
  width?: number;
  isFlipped: boolean;
}

export function useFloatingPosition(
  anchorRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  options: FloatingPositionOptions = {}
) {
  const {
    estimatedHeight = 320,
    estimatedWidth = 288,
    gap = 6,
    align = 'left',
    matchWidth = false,
  } = options;

  const [coords, setCoords] = useState<FloatingCoords>({
    left: 0,
    top: 0,
    isFlipped: false,
  });

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const actualWidth = matchWidth ? rect.width : (estimatedWidth || rect.width);
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Determine if we flip upwards
    const shouldFlip = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    // Calculate vertical position
    let top: number | undefined;
    let bottom: number | undefined;

    if (shouldFlip) {
      // Place above anchor
      bottom = viewportHeight - rect.top + gap;
    } else {
      // Place below anchor
      top = rect.bottom + gap;
    }

    // Calculate horizontal position with viewport safety margin (12px)
    let left: number;
    if (align === 'right') {
      left = rect.right - actualWidth;
    } else {
      left = rect.left;
    }

    // Clamp inside viewport
    if (left + actualWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - actualWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    setCoords({
      top,
      bottom,
      left,
      width: matchWidth ? rect.width : undefined,
      isFlipped: shouldFlip,
    });
  }, [anchorRef, estimatedHeight, estimatedWidth, gap, align, matchWidth]);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    // Recalculate on window scroll or resize
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  return { coords, updatePosition };
}

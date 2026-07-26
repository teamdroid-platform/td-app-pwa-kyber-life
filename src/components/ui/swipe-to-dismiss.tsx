"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SwipeToDismissProps {
    /** Called once the row has been swiped past the threshold and animated out. */
    onDismiss: () => void;
    children: React.ReactNode;
    /** Revealed behind the row while swiping (e.g. an icon + label). */
    background?: React.ReactNode;
    /** Horizontal distance (px) required to trigger the dismiss. */
    threshold?: number;
    disabled?: boolean;
    className?: string;
}

/**
 * Swipe-left-to-dismiss row. Uses pointer events so it works with touch and
 * mouse drag alike, and `touch-action: pan-y` so vertical scrolling inside a
 * list is never hijacked. Only leftward movement is tracked; releasing past
 * `threshold` slides the row out and then fires `onDismiss` (the parent removes
 * it), otherwise it springs back.
 *
 * A drag also swallows the click that would follow it, so a row that is both
 * swipeable and tappable never fires its tap handler at the end of a swipe.
 */
export function SwipeToDismiss({
    onDismiss,
    children,
    background,
    threshold = 72,
    disabled = false,
    className,
}: SwipeToDismissProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const startXRef = React.useRef<number | null>(null);
    const draggedRef = React.useRef(false);
    const [offset, setOffset] = React.useState(0);
    const [dragging, setDragging] = React.useState(false);
    const [dismissing, setDismissing] = React.useState(false);

    const progress = Math.min(1, Math.abs(offset) / threshold);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (disabled || dismissing) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        startXRef.current = e.clientX;
        draggedRef.current = false;
        setDragging(true);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (startXRef.current === null || dismissing) return;
        const dx = e.clientX - startXRef.current;
        if (dx >= 0) {
            setOffset(0);
            return;
        }
        if (!draggedRef.current && Math.abs(dx) > 6) {
            draggedRef.current = true;
            // Keep receiving moves even if the pointer leaves the row.
            e.currentTarget.setPointerCapture?.(e.pointerId);
        }
        setOffset(dx);
    };

    const endDrag = () => {
        if (startXRef.current === null) return;
        startXRef.current = null;
        setDragging(false);
        if (Math.abs(offset) >= threshold) {
            setDismissing(true);
            setOffset(-(containerRef.current?.offsetWidth ?? 400));
        } else {
            setOffset(0);
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn("relative overflow-hidden", className)}
            style={{ touchAction: "pan-y" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClickCapture={(e) => {
                // Swallow the click that closes a drag gesture.
                if (draggedRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    draggedRef.current = false;
                }
            }}
        >
            {background && (
                <div
                    className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none"
                    style={{ opacity: progress }}
                    aria-hidden
                >
                    {background}
                </div>
            )}
            <div
                className="relative"
                style={{
                    transform: `translate3d(${offset}px, 0, 0)`,
                    // Follow the finger while dragging; animate on release.
                    transition: dragging ? undefined : "transform 200ms ease-out",
                }}
                onTransitionEnd={() => {
                    if (dismissing) onDismiss();
                }}
            >
                {children}
            </div>
        </div>
    );
}

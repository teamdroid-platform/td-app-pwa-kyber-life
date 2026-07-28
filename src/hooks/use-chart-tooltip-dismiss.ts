"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
    /** Auto-hide delay after the last touch, in ms. Set to 0 to disable. */
    autoHideMs?: number;
}

/**
 * Makes a Recharts tooltip dismissable on touch devices.
 *
 * On a phone the tooltip gets stuck: Recharts opens it on tap but never
 * receives the `mouseleave` that closes it on desktop, so the point stays
 * selected until some unrelated tap clears it — the user ends up tapping around
 * the screen to get back to a clean chart.
 *
 * This closes it the three ways people naturally expect, without changing how
 * the charts look or how the tooltip opens:
 *   1. it fades away on its own a few seconds after the last touch,
 *   2. a single tap anywhere outside the chart closes it,
 *   3. scrolling the page closes it.
 *
 * Desktop behaviour is untouched: the auto-hide only arms for touch pointers,
 * so hovering with a mouse still works exactly as before.
 *
 * Wire it up as:
 *   const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss();
 *   <div ref={containerRef} onPointerDown={handlePointerDown}>
 *     …<Tooltip active={tooltipActive} />…
 */
export function useChartTooltipDismiss({ autoHideMs = 3200 }: Options = {}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** `true` once we've forced the tooltip closed; cleared on the next touch. */
    const [dismissed, setDismissed] = useState(false);

    const clearTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    /** Attach to the chart wrapper: re-opens on touch and re-arms the auto-hide. */
    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.pointerType !== "touch") return; // desktop keeps its hover behaviour
            setDismissed(false);
            clearTimer();
            if (autoHideMs > 0) {
                timerRef.current = setTimeout(() => setDismissed(true), autoHideMs);
            }
        },
        [autoHideMs],
    );

    useEffect(() => {
        const dismissFromOutside = (event: Event) => {
            if (containerRef.current?.contains(event.target as Node)) return;
            clearTimer();
            setDismissed(true);
        };
        const dismissOnScroll = () => {
            clearTimer();
            setDismissed(true);
        };

        // Capture phase so it still fires when the target stops propagation.
        document.addEventListener("pointerdown", dismissFromOutside, true);
        window.addEventListener("scroll", dismissOnScroll, true);
        return () => {
            document.removeEventListener("pointerdown", dismissFromOutside, true);
            window.removeEventListener("scroll", dismissOnScroll, true);
            clearTimer();
        };
    }, []);

    return {
        containerRef,
        /**
         * Pass to `<Tooltip active={...} />`: `false` forces it closed,
         * `undefined` hands control back to Recharts' own hover logic.
         */
        tooltipActive: dismissed ? (false as const) : undefined,
        handlePointerDown,
    };
}

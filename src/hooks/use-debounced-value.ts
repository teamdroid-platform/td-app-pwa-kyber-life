"use client";

import { useEffect, useState } from "react";

/**
 * Debounced copy of a fast-changing value.
 *
 * Used by the dashboards' custom date inputs: typing a date by hand emits every
 * intermediate value (year `0002`, `0202`, …) and each one would otherwise
 * trigger its own refetch. The input itself stays fully responsive — only the
 * value that drives the query settles.
 *
 * Values are passed through untouched on the first render, so the initial load
 * is not delayed.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        if (value === debounced) return;
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs, debounced]);

    return debounced;
}

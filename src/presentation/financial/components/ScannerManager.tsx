'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { triggerFinancialScanAction, getScanExecutionsAction, getScannerDayCountsAction } from '@/app/actions/financial-scanner';
import { Calendar, Search, RefreshCw, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, Mail, AlertCircle, Timer, ChevronDown, ChevronUp, Plus, Database } from 'lucide-react';
import { FinancialScanExecution } from '@/domain/entities/financial';
import { format, isAfter, isBefore, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useFinancialRealtime } from '../hooks/useFinancialRealtime';

type ScanRange = 'today' | 'week' | 'custom' | 'recommended';

/**
 * The current week, Monday through today.
 *
 * The end is clamped to today on purpose: the rest of the week hasn't happened,
 * so asking the scanner for it can only return nothing — and those future days
 * then show up in the calendar as if they had been scanned.
 */
export function getWeekRange(): { start: string; end: string } {
    const today = new Date();
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    return {
        start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        end: format(isAfter(weekEnd, today) ? today : weekEnd, 'yyyy-MM-dd'),
    };
}

function getFormattedDuration(start: string | Date, end: string | Date): string {
    const diffMs = Math.abs(new Date(end).getTime() - new Date(start).getTime());
    const totalSecs = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hrs > 0) return `${hrs}h ${pad(mins)}m`;
    if (mins > 0) return `${pad(mins)}m ${pad(secs)}s`;
    return `${secs}s`;
}

// Execution timestamps are real instants; render them in Ecuador time
// (America/Guayaquil, UTC-5) regardless of the viewer's device timezone.
const ECUADOR_TZ = 'America/Guayaquil';
function formatEcuadorTime(value: string | Date, withSeconds = false): string {
    return new Intl.DateTimeFormat('es-EC', {
        timeZone: ECUADOR_TZ,
        hour: '2-digit',
        minute: '2-digit',
        ...(withSeconds ? { second: '2-digit' as const } : {}),
        hour12: false,
    }).format(new Date(value));
}
function formatEcuadorDate(value: string | Date): string {
    return new Intl.DateTimeFormat('es-EC', {
        timeZone: ECUADOR_TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(value));
}
function formatEcuadorDayMonth(value: string | Date): string {
    return new Intl.DateTimeFormat('es-EC', {
        timeZone: ECUADOR_TZ,
        day: '2-digit',
        month: 'short',
    }).format(new Date(value));
}

// `en-CA` renders as YYYY-MM-DD, which is the shape the calendar compares.
const ecuadorDayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ECUADOR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/**
 * Normalize a scan-window boundary to the ECUADOR calendar date (YYYY-MM-DD).
 *
 * Automated scans store their boundaries as UTC instants (e.g.
 * "2026-08-03T04:59:59.999+00:00"), and that instant is still 02-ago in Ecuador
 * — taking the literal date part would attribute the scan to 03-ago and light
 * up a day that was never scanned. Anything between 00:00 and 04:59 UTC lands a
 * day ahead this way.
 *
 * Ecuador rather than the device's timezone, matching every other date shown on
 * this screen: which day a scan covered is a property of the scan, not of where
 * the phone happens to be.
 */
export function toEcuadorDatePart(value: unknown): string | undefined {
    if (typeof value !== 'string' || value === '') return undefined;
    // Already a plain calendar date (no time/zone) — keep verbatim.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // Only a real ISO instant is converted. V8 happily parses loose strings as
    // local midnight, and converting one of those would shift the day instead
    // of correcting it — for anything else, take the date it contains.
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return ecuadorDayFormatter.format(d);
    }
    const m = value.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : undefined;
}

/**
 * A scan boundary as a comparable Date sitting at local noon of its Ecuador
 * calendar day — noon so the day never drifts when compared across timezones.
 * Used by the calendar to decide which days an execution covered.
 */
function parseScanDay(value: string): Date {
    return new Date(`${toEcuadorDatePart(value) ?? ''}T12:00:00`);
}

function parsePayload(payload: any) {
    if (!payload) return null;

    let parsed = payload;
    let iter = 0;
    while (typeof parsed === 'string' && iter < 5) {
        try {
            parsed = JSON.parse(parsed);
        } catch (e) {
            break;
        }
        iter++;
    }

    // Resolve the object that carries startDate/endDate.
    let source: any = null;
    if (parsed && typeof parsed === 'object' && parsed.startDate) {
        source = parsed;
    } else if (parsed && typeof parsed === 'object' && parsed.body) {
        let body = parsed.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { }
        }
        if (body && typeof body === 'object' && body.startDate) {
            source = body;
        }
    }

    if (!source) {
        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const startMatch = payloadStr.match(/startDate.*?(\d{4}-\d{2}-\d{2})/);
        const endMatch = payloadStr.match(/endDate.*?(\d{4}-\d{2}-\d{2})/);
        if (startMatch || endMatch) {
            source = {
                startDate: startMatch ? startMatch[1] : undefined,
                endDate: endMatch ? endMatch[1] : undefined
            };
        }
    }

    if (!source) {
        return typeof parsed === 'object' ? parsed : null;
    }

    // Normalize the scan window to ECUADOR calendar dates so the calendar
    // coloring and the displayed range don't drift a day due to a UTC-stored
    // boundary.
    return {
        ...source,
        startDate: toEcuadorDatePart(source.startDate),
        endDate: toEcuadorDatePart(source.endDate),
    };
}

// Extract the ORIGINAL startDate/endDate strings from the request payload,
// WITHOUT the local-date normalization parsePayload() applies. We need the raw
// form to distinguish a plain calendar-date scan ("2026-07-06") from an
// instant-based one ("2026-07-07T02:30:02.856Z"): the former has no meaningful
// time-of-day, the latter does.
function rawPayloadDates(payload: any): { startDate?: string; endDate?: string } {
    let parsed = payload;
    let iter = 0;
    while (typeof parsed === 'string' && iter < 5) {
        try { parsed = JSON.parse(parsed); } catch (e) { break; }
        iter++;
    }
    if (!parsed || typeof parsed !== 'object') return {};

    let source: any = parsed;
    if (!parsed.startDate && !parsed.endDate && parsed.body) {
        let body = parsed.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { } }
        if (body && typeof body === 'object') source = body;
    }
    return {
        startDate: typeof source.startDate === 'string' ? source.startDate : undefined,
        endDate: typeof source.endDate === 'string' ? source.endDate : undefined,
    };
}

// Render a calendar-date window as a full Ecuador day span with explicit
// boundary times — "dd MMM 00:00 – dd MMM 23:59" — even for a single day. A date
// scan always covers 00:00:00.000–23:59:59.999 (Ecuador) of each chosen day.
// Parses at local noon so the day label never drifts across a timezone boundary.
function formatDateOnlyRange(sDate?: string, eDate?: string): string | null {
    if (!sDate) return null;
    const dayLabel = (d: string) => {
        const dt = new Date(`${d.split('T')[0]}T12:00:00`);
        return isNaN(dt.getTime()) ? null : format(dt, "dd MMM", { locale: es });
    };
    const sf = dayLabel(sDate);
    const ef = dayLabel(eDate || sDate);
    if (!sf || !ef) return null;
    return `${sf} 00:00 – ${ef} 23:59`;
}

const EXECUTION_STATUS_STYLES: Record<string, { label: string; badge: string; ring: string; Icon: React.ElementType }> = {
    COMPLETED: { label: 'COMPLETADO', badge: 'bg-success-bg/30 border-accent-success/30 text-success-text', ring: 'border-accent-success/40', Icon: CheckCircle2 },
    FAILED: { label: 'FALLIDO', badge: 'bg-danger-bg/30 border-accent-danger/30 text-danger-text', ring: 'border-accent-danger/40', Icon: XCircle },
    PROCESSING: { label: 'EN PROGRESO', badge: 'bg-info-bg/30 border-accent-info/30 text-info-text', ring: 'border-accent-info/40', Icon: Clock },
};

function ExecutionHistoryCard({ exec, dayCount, defaultExpanded = false }: { exec: FinancialScanExecution, dayCount?: number, defaultExpanded?: boolean }) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const meta = EXECUTION_STATUS_STYLES[exec.status] ?? EXECUTION_STATUS_STYLES.PROCESSING;
    const StatusIcon = meta.Icon;

    // Scan window. A manual/date-range scan carries plain calendar dates in the
    // payload (e.g. "2026-07-06"); the backend also stores search_range_start/end
    // as UTC-midnight instants, which — rendered in Ecuador time — drift a day
    // back to "05-jul 19:00". So for a calendar-date scan we show the requested
    // date(s) with no misleading time. Only automated/incremental scans carry
    // real ISO instants, which we render in Ecuador local time with the hour,
    // e.g. "06 jul 21:30 – 06 jul 23:59".
    let rangoText = "Rango no determinado";
    const rawDates = rawPayloadDates(exec.requestPayload);
    const isCalendarDateScan = !!rawDates.startDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDates.startDate);

    if (isCalendarDateScan) {
        rangoText = formatDateOnlyRange(rawDates.startDate, rawDates.endDate) ?? rangoText;
    } else if (exec.searchRangeStart && exec.searchRangeEnd) {
        rangoText = `${formatEcuadorDayMonth(exec.searchRangeStart)} ${formatEcuadorTime(exec.searchRangeStart)} – ${formatEcuadorDayMonth(exec.searchRangeEnd)} ${formatEcuadorTime(exec.searchRangeEnd)}`;
    } else {
        const payload = parsePayload(exec.requestPayload);
        const sDate = payload?.startDate || exec.stats?.startDate;
        const eDate = payload?.endDate || exec.stats?.endDate;
        rangoText = formatDateOnlyRange(sDate, eDate) ?? rangoText;
    }

    const timeLabel = formatEcuadorTime(exec.startedAt);
    const duration = exec.completedAt
        ? getFormattedDuration(exec.startedAt, exec.completedAt)
        : (exec.status === 'PROCESSING' ? 'En curso' : '—');

    const statusBadge = (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border ${meta.badge} uppercase shrink-0`}>
            <StatusIcon className="w-3 h-3" />
            {meta.label}
        </span>
    );

    return (
        <div
            onClick={() => setIsExpanded((v) => !v)}
            className={`p-4 rounded-[1.25rem] border bg-bg-secondary/60 hover:bg-bg-secondary transition-all cursor-pointer ${isExpanded ? meta.ring : 'border-border/40'}`}
        >
            {/* Header: status + time + chevron */}
            <div className="flex items-center justify-between gap-2">
                {exec.status === 'FAILED' ? (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button onClick={(e) => e.stopPropagation()} className="focus:outline-none">{statusBadge}</button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="max-w-xs bg-bg-secondary border border-accent-danger/20 text-danger-text p-4 shadow-xl rounded-xl z-50">
                            <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap">
                                {exec.errorDetails || "La ejecución falló sin reportar un mensaje de error detallado."}
                            </p>
                        </PopoverContent>
                    </Popover>
                ) : statusBadge}

                <div className="flex items-center gap-2 text-text-tertiary shrink-0">
                    <span className="text-xs font-semibold tabular-nums">{timeLabel}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </div>

            {/* Rango */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-text-secondary">Rango:</span>
                <span className="font-semibold text-text-primary">{rangoText}</span>
            </div>

            {/* Expanded: key metrics (stacked label ↔ value to fit the narrow panel) */}
            {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border/30 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs text-text-secondary min-w-0">
                            <Database className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                            <span className="truncate">Transacciones detectadas</span>
                        </span>
                        <span className="text-base font-bold text-text-primary tabular-nums shrink-0">{dayCount === undefined ? '…' : dayCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs text-text-secondary min-w-0">
                            <Timer className="w-3.5 h-3.5 text-accent-info shrink-0" />
                            <span className="truncate">Tiempo de procesamiento</span>
                        </span>
                        <span className="text-base font-bold text-text-primary tabular-nums shrink-0">{duration}</span>
                    </div>

                    <div className="flex flex-col gap-2 mt-1 pt-2.5 border-t border-border/20 text-[11px] text-text-secondary">
                        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                            <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3 opacity-60 shrink-0" /> {formatEcuadorDate(exec.startedAt)}</span>
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 opacity-60 shrink-0" />
                                {formatEcuadorTime(exec.startedAt, true)}{exec.completedAt ? ` - ${formatEcuadorTime(exec.completedAt, true)}` : ''}
                            </span>
                        </div>
                        {exec.source && (
                            <span className="inline-flex w-fit items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-text-secondary bg-bg-primary px-2 py-0.5 rounded-md">
                                {exec.source === 'GMAIL_N8N_WEBHOOK' ? <Mail className="w-3 h-3 text-accent-primary shrink-0" /> : null}
                                {exec.source === 'GMAIL_N8N_WEBHOOK' ? 'GMAIL' : exec.source}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function ScannerManager() {
    const weekRange = getWeekRange();
    const [range, setRange] = useState<ScanRange>('recommended');
    const [startDate, setStartDate] = useState(weekRange.start);
    const [endDate, setEndDate] = useState(weekRange.end);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isNewScanOpen, setIsNewScanOpen] = useState(false);

    // Recommended Ranges State
    const [recommendedRanges, setRecommendedRanges] = useState<{ start: string, end: string }[]>([]);
    const [selectedRecommendedIndex, setSelectedRecommendedIndex] = useState<number>(0);

    // History State
    const [executions, setExecutions] = useState<FinancialScanExecution[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Calendar State
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());

    // Per-day scanner transaction counts, keyed by day → { externalExecutionId: count }.
    // These are transactions DATED on the day, broken down per scan — so a range
    // scan shows only the portion of its findings that fall on the selected day.
    const [dayCountsByDate, setDayCountsByDate] = useState<Record<string, Record<string, number>>>({});

    // Force-refresh a day's counts, bypassing the lazy cache. Used by realtime so
    // the processing card's "Transacciones detectadas" climbs as scans find rows.
    const fetchDayCounts = useCallback(async (dateStr: string) => {
        const res = await getScannerDayCountsAction(dateStr);
        if (res.success && res.data) {
            setDayCountsByDate(prev => ({ ...prev, [dateStr]: res.data as Record<string, number> }));
        }
    }, []);

    // Keep the selected date reachable from realtime callbacks without
    // re-subscribing the channel every time the user picks a different day.
    const selectedDateRef = useRef(selectedDate);
    useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

    const refreshSelectedDayCounts = useCallback(() => {
        void fetchDayCounts(format(selectedDateRef.current, 'yyyy-MM-dd'));
    }, [fetchDayCounts]);

    // Lazy initial load for a newly selected day (only when not already cached).
    useEffect(() => {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        if (dayCountsByDate[dateStr]) return;

        let active = true;
        (async () => {
            const res = await getScannerDayCountsAction(dateStr);
            if (!active) return;
            if (res.success && res.data) {
                setDayCountsByDate(prev => ({ ...prev, [dateStr]: res.data as Record<string, number> }));
            }
        })();
        return () => { active = false; };
    }, [selectedDate, dayCountsByDate]);

    // Count of transactions a given scan found dated on the selected day
    // (undefined while the day's counts are still loading).
    const getDayCount = useCallback((executionId?: string | null): number | undefined => {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const counts = dayCountsByDate[dateStr];
        if (!counts) return undefined;
        return executionId ? (counts[executionId] ?? 0) : 0;
    }, [selectedDate, dayCountsByDate]);

    // -- Realtime & Polling for Executions --
    const [showPollingNotice, setShowPollingNotice] = useState(false);
    const pollingNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const pollHistoryInBackground = useCallback(async () => {
        setShowPollingNotice(true);
        if (pollingNoticeTimerRef.current) {
            clearTimeout(pollingNoticeTimerRef.current);
        }
        pollingNoticeTimerRef.current = setTimeout(() => {
            setShowPollingNotice(false);
        }, 2500);

        try {
            // Load more items to ensure calendar has good data
            const res = await getScanExecutionsAction(1, 50);
            if (res.success && res.data) {
                const fetchedExecutions = res.data.data;
                setExecutions(prev => {
                    const next = [...prev];
                    fetchedExecutions.forEach(fe => {
                        const idx = next.findIndex(e => e.id === fe.id);
                        if (idx >= 0) {
                            next[idx] = fe;
                        }
                    });

                    if (page === 1) {
                        const existingIds = new Set(next.map(e => e.id));
                        const newItems = fetchedExecutions.filter(e => !existingIds.has(e.id));
                        return [...newItems, ...next].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
                    }

                    return next;
                });
            }
        } catch (error) {
            console.error("Error al recargar historial en realtime:", error);
        }
    }, [page]);

    const subscriptions = useMemo(
        () => [
            { table: "financial_scanner_executions", event: "UPDATE" as const },
            { table: "financial_scanner_executions", event: "INSERT" as const },
            // New scanner rows land as a scan runs — used to keep the day's
            // "Transacciones detectadas" count live for the processing card.
            { table: "financial_scanner_transactions", event: "INSERT" as const },
        ],
        [],
    );

    const callbacks = useMemo(
        () => ({
            onUpdate: () => {
                // Execution status/stats changed (e.g. PROCESSING → COMPLETED):
                // reload the history (recolors the calendar, updates the badge)
                // and settle the final transaction count.
                void pollHistoryInBackground();
                refreshSelectedDayCounts();
            },
            onInsert: (payload: { table?: string }) => {
                if (payload?.table === "financial_scanner_transactions") {
                    // A scan found another transaction — bump the day's count only.
                    refreshSelectedDayCounts();
                    return;
                }
                void pollHistoryInBackground();
                refreshSelectedDayCounts();
            },
        }),
        [pollHistoryInBackground, refreshSelectedDayCounts],
    );

    // Combined poll used when Realtime is unavailable: refresh both the history
    // (calendar/status) and the selected day's transaction count.
    const pollFallback = useCallback(() => {
        void pollHistoryInBackground();
        refreshSelectedDayCounts();
    }, [pollHistoryInBackground, refreshSelectedDayCounts]);

    const { isPollingFallback } = useFinancialRealtime({
        channelName: "scanner-executions-realtime",
        subscriptions,
        callbacks,
        onPollFallback: pollFallback,
    });
    // ----------------------------------------

    const loadHistory = useCallback(async (pageNum: number, isInitial = false) => {
        setIsLoadingHistory(true);
        try {
            const res = await getScanExecutionsAction(pageNum, 50);
            if (res.success && res.data) {
                if (isInitial) {
                    setExecutions(res.data.data);
                } else {
                    setExecutions(prev => [...prev, ...res.data.data]);
                }
                setHasMore(res.data.pagination.hasNextPage);
            }
        } catch (error) {
            console.error("Error al cargar historial:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        setPage(1);
        loadHistory(1, true);
    }, [loadHistory]);

    // Calendar logic
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDateCalendar = startOfWeek(monthStart, { weekStartsOn: 1 }); // weekStartsOn 1 = Monday
    const endDateCalendar = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const calendarDays = useMemo(() => eachDayOfInterval({
        start: startDateCalendar,
        end: endDateCalendar
    }), [startDateCalendar, endDateCalendar]);

    const getDayStatus = useCallback((date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        let hasFailed = false;
        let hasCompleted = false;
        let hasProcessing = false;

        executions.forEach(exec => {
            const payload = parsePayload(exec.requestPayload);
            const sDate = payload?.startDate || exec.stats?.startDate;
            const eDate = payload?.endDate || exec.stats?.endDate;
            if (!sDate || !eDate) return;

            const startObj = parseScanDay(sDate);
            const endObj = parseScanDay(eDate);

            const dTime = new Date(`${dateStr}T12:00:00`).getTime();

            if (dTime >= startObj.getTime() && dTime <= endObj.getTime()) {
                if (exec.status === 'COMPLETED') hasCompleted = true;
                if (exec.status === 'FAILED') hasFailed = true;
                if (exec.status === 'PROCESSING') hasProcessing = true;
            }
        });

        if (hasProcessing) return 'processing';
        if (hasCompleted) return 'completed';
        if (hasFailed) return 'failed';
        return 'none';
    }, [executions]);

    useEffect(() => {
        const completedIntervals = executions
            .filter(e => e.status === 'COMPLETED' || e.status === 'PROCESSING')
            .map(e => {
                const payload = parsePayload(e.requestPayload);
                const sDate = payload?.startDate || e.stats?.startDate;
                const eDate = payload?.endDate || e.stats?.endDate;
                if (!sDate || !eDate) return null;
                const startObj = parseScanDay(sDate);
                const endObj = parseScanDay(eDate);
                if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) return null;
                return {
                    startStr: format(startObj, 'yyyy-MM-dd'),
                    endStr: format(endObj, 'yyyy-MM-dd')
                };
            })
            .filter(Boolean) as { startStr: string, endStr: string }[];

        const today = new Date();
        today.setHours(12, 0, 0, 0);

        const isDateScanned = (dateStr: string) => {
            return completedIntervals.some(interval => {
                return dateStr >= interval.startStr && dateStr <= interval.endStr;
            });
        };

        const ranges: { start: string, end: string }[] = [];
        let currentIterDate = new Date(today);
        let currentRangeEnd: string | null = null;
        let currentRangeLength = 0;

        for (let i = 0; i < 365 && ranges.length < 3; i++) {
            const currentStr = format(currentIterDate, 'yyyy-MM-dd');

            if (!isDateScanned(currentStr)) {
                if (!currentRangeEnd) {
                    currentRangeEnd = currentStr;
                }
                currentRangeLength++;

                if (currentRangeLength === 15) {
                    ranges.push({
                        start: currentStr,
                        end: currentRangeEnd
                    });
                    currentRangeEnd = null;
                    currentRangeLength = 0;
                }
            } else {
                if (currentRangeEnd) {
                    const rangeStart = new Date(currentIterDate);
                    rangeStart.setDate(rangeStart.getDate() + 1);
                    ranges.push({
                        start: format(rangeStart, 'yyyy-MM-dd'),
                        end: currentRangeEnd
                    });
                    currentRangeEnd = null;
                    currentRangeLength = 0;
                }
            }

            currentIterDate.setDate(currentIterDate.getDate() - 1);
        }

        if (currentRangeEnd && ranges.length < 3) {
            const rangeStart = new Date(currentIterDate);
            rangeStart.setDate(rangeStart.getDate() + 1);
            ranges.push({
                start: format(rangeStart, 'yyyy-MM-dd'),
                end: currentRangeEnd
            });
        }

        setRecommendedRanges(ranges);
    }, [executions]);

    useEffect(() => {
        if (range === 'recommended' && recommendedRanges.length > 0) {
            const selected = recommendedRanges[selectedRecommendedIndex] || recommendedRanges[0];
            setStartDate(selected.start);
            setEndDate(selected.end);
        }
    }, [recommendedRanges, range, selectedRecommendedIndex]);

    const handleRangeChange = (newRange: ScanRange) => {
        setRange(newRange);
        const today = new Date();
        if (newRange === 'today') {
            setStartDate(format(today, 'yyyy-MM-dd'));
            setEndDate(format(today, 'yyyy-MM-dd'));
        } else if (newRange === 'week') {
            const week = getWeekRange();
            setStartDate(week.start);
            setEndDate(week.end);
        } else if (newRange === 'recommended' && recommendedRanges.length > 0) {
            setSelectedRecommendedIndex(0);
        }
    };

    const handleTriggerScan = async () => {
        if (!startDate || !endDate) {
            toast.error("Seleccione las fechas correctamente");
            return;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isAfter(start, end)) {
            toast.error("La fecha de inicio no puede ser posterior a la de fin");
            return;
        }

        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 15) {
            toast.error("El rango no puede superar los 15 días");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await triggerFinancialScanAction(startDate, endDate);
            if (res.success) {
                toast.success("El escaneo se ha iniciado en segundo plano");
                setIsNewScanOpen(false); // Close dialog on success
                setTimeout(() => {
                    setPage(1);
                    loadHistory(1, true);
                }, 1000);
            } else {
                toast.error(res.error || "Error al iniciar el escaneo");
            }
        } catch (error) {
            toast.error("Ocurrió un error inesperado");
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedDayExecutions = useMemo(() => {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        return executions.filter(exec => {
            const payload = parsePayload(exec.requestPayload);
            const sDate = payload?.startDate || exec.stats?.startDate;
            const eDate = payload?.endDate || exec.stats?.endDate;
            if (!sDate || !eDate) return false;

            const startObj = parseScanDay(sDate);
            const endObj = parseScanDay(eDate);

            const dTime = new Date(`${dateStr}T12:00:00`).getTime();

            return dTime >= startObj.getTime() && dTime <= endObj.getTime();
        }).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    }, [executions, selectedDate]);

    // Total transactions dated on the selected day across all of its scans
    // (sum of what each card shows). Undefined while the day's counts are loading.
    const selectedDayTotalFound = useMemo(() => {
        const counts = dayCountsByDate[format(selectedDate, 'yyyy-MM-dd')];
        if (!counts) return undefined;
        return selectedDayExecutions.reduce(
            (sum, exec) => sum + (exec.id ? (counts[exec.id] ?? 0) : 0),
            0,
        );
    }, [dayCountsByDate, selectedDate, selectedDayExecutions]);

    return (
        <div className="w-full flex flex-col relative pb-24">

            <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-accent-primary shrink-0" />
                    <h2 className="text-lg sm:text-xl font-bold text-text-primary">
                        Historial de Ejecuciones
                    </h2>
                </div>
                <button
                    onClick={() => setIsNewScanOpen(true)}
                    className="hidden sm:inline-flex items-center gap-2 bg-accent-primary text-accent-primary-foreground hover:bg-accent-primary/90 px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-accent-primary/20 transition-all hover:scale-[1.02]"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Escaneo
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
                <div className="lg:col-span-6 xl:col-span-7 bg-bg-secondary/40 rounded-3xl p-4 sm:p-6 flex flex-col border border-border/40">
                    <div className="flex items-center justify-between mb-6">
                        <button
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                            className="p-2.5 bg-bg-primary hover:bg-bg-primary/80 transition-colors rounded-xl border border-border/40"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="font-bold text-lg sm:text-xl capitalize text-text-primary">
                            {format(currentMonth, 'MMMM yyyy', { locale: es })}
                        </span>
                        <button
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                            className="p-2.5 bg-bg-primary hover:bg-bg-primary/80 transition-colors rounded-xl border border-border/40"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-2 sm:gap-3">
                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                            <div key={d} className="text-center text-xs font-semibold text-text-tertiary mb-2">
                                {d}
                            </div>
                        ))}

                        {calendarDays.map((day, idx) => {
                            const status = getDayStatus(day);
                            let statusClasses = "bg-bg-secondary border-dashed border-border/40 text-text-secondary hover:border-border";

                            if (status === 'completed') {
                                statusClasses = "bg-accent-success hover:bg-accent-success/90 border-transparent text-white font-bold shadow-md";
                            } else if (status === 'failed') {
                                statusClasses = "bg-accent-danger hover:bg-accent-danger/90 border-transparent text-white font-bold shadow-md";
                            } else if (status === 'processing') {
                                statusClasses = "bg-accent-info hover:bg-accent-info/90 border-transparent text-white font-bold shadow-md animate-pulse";
                            }

                            const isSelected = isSameDay(day, selectedDate);
                            const isCurrentMonth = isSameMonth(day, currentMonth);

                            return (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setSelectedDate(day);
                                        if (!isSameMonth(day, currentMonth)) {
                                            setCurrentMonth(day);
                                        }
                                    }}
                                    className={`aspect-square rounded-xl sm:rounded-2xl border flex items-center justify-center text-sm sm:text-base transition-all
                                        ${statusClasses}
                                        ${isSelected ? 'ring-4 ring-bg-primary outline outline-2 outline-accent-primary scale-[1.02] z-10' : ''}
                                        ${!isCurrentMonth ? 'opacity-30' : ''}
                                    `}
                                >
                                    {format(day, 'd')}
                                </button>
                            )
                        })}
                    </div>

                    <div className="flex flex-col gap-2 mt-8 pt-6 border-t border-border/30 text-xs font-medium text-text-secondary">
                        <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-md bg-accent-success shadow-sm"></div><span>Días Escaneados y Completados</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-md bg-accent-danger shadow-sm"></div><span>Intentos de Escaneo Fallidos en estas fechas</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-md bg-accent-info shadow-sm"></div><span>Días en Proceso de Escaneo</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-md bg-bg-secondary border border-dashed border-border/50"></div><span>Días no Escaneados (Agujeros)</span></div>
                    </div>
                </div>

                {/* Details (Desktop) */}
                <div className="hidden lg:block lg:col-span-6 xl:col-span-5 relative rounded-3xl border border-border/40 bg-bg-secondary/10">
                    <div className="absolute inset-0 flex flex-col p-5 overflow-hidden">
                        <div className="flex items-start justify-between gap-2 shrink-0 mb-4 px-1">
                            <h3 className="text-base font-semibold text-text-primary leading-tight">
                                Detalles del día
                                <span className="block text-xs font-normal text-text-tertiary mt-0.5 capitalize">{format(selectedDate, "dd MMM yyyy", { locale: es })}</span>
                            </h3>
                            {selectedDayTotalFound !== undefined && (
                                <span className="text-xs font-bold bg-accent-primary/10 text-accent-primary px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
                                    {selectedDayTotalFound} trx en total
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden pr-1.5 pb-2 h-full">
                            {selectedDayExecutions.length > 0 ? (
                                selectedDayExecutions.map((exec, idx) => <ExecutionHistoryCard key={exec.id} exec={exec} dayCount={getDayCount(exec.id)} defaultExpanded={idx === 0} />)
                            ) : (
                                <div className="p-6 text-center text-sm text-text-tertiary border border-border/30 rounded-2xl bg-bg-secondary/30">
                                    No hay registros de ejecución para esta fecha.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Details (Mobile) */}
                <div className="lg:hidden flex flex-col gap-4 mt-2">
                    <div className="flex items-start justify-between gap-2 px-1">
                        <h3 className="text-base font-semibold text-text-primary leading-tight">
                            Detalles del día
                            <span className="block text-xs font-normal text-text-tertiary mt-0.5 capitalize">{format(selectedDate, "dd MMM yyyy", { locale: es })}</span>
                        </h3>
                        {selectedDayTotalFound !== undefined && (
                            <span className="text-xs font-bold bg-accent-primary/10 text-accent-primary px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
                                {selectedDayTotalFound} trx en total
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-2.5">
                        {selectedDayExecutions.length > 0 ? (
                            selectedDayExecutions.map((exec, idx) => <ExecutionHistoryCard key={exec.id} exec={exec} dayCount={getDayCount(exec.id)} defaultExpanded={idx === 0} />)
                        ) : (
                            <div className="p-6 text-center text-sm text-text-tertiary border border-border/30 rounded-2xl bg-bg-secondary/30">
                                No hay registros de ejecución para esta fecha.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Dialog open={isNewScanOpen} onOpenChange={setIsNewScanOpen}>
                <DialogTrigger asChild>
                    <button className="sm:hidden fixed bottom-6 right-6 bg-accent-primary text-accent-primary-foreground hover:bg-accent-primary/90 h-14 rounded-full px-6 shadow-xl shadow-accent-primary/20 flex items-center gap-2 font-bold transition-all hover:scale-105 z-50">
                        <Plus className="w-5 h-5" />
                    </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md bg-bg-secondary border-border/40 p-0 overflow-hidden rounded-[1.75rem]">
                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="flex items-center gap-2 text-xl text-text-primary">
                                <Search className="w-5 h-5 text-accent-primary" />
                                Nuevo Escaneo
                            </DialogTitle>
                            <DialogDescription>
                                Inicia un nuevo escaneo financiero definiendo el rango de fechas.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col gap-5 w-full">
                            <Tabs value={range} onValueChange={(v) => handleRangeChange(v as ScanRange)} className="w-full">
                                <TabsList className="grid w-full grid-cols-4 bg-bg-primary/40 border border-border/30 p-1.5 rounded-xl h-12 shadow-inner">
                                    <TabsTrigger
                                        value="recommended"
                                        className="rounded-lg text-xs font-semibold data-[state=active]:bg-bg-secondary data-[state=active]:text-accent-primary data-[state=active]:shadow-sm transition-all h-full truncate px-1"
                                    >
                                        Sugerido
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="custom"
                                        className="rounded-lg text-xs font-semibold data-[state=active]:bg-bg-secondary data-[state=active]:text-accent-primary data-[state=active]:shadow-sm transition-all h-full truncate px-1"
                                    >
                                        Manual
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="week"
                                        className="rounded-lg text-xs font-semibold data-[state=active]:bg-bg-secondary data-[state=active]:text-accent-primary data-[state=active]:shadow-sm transition-all h-full truncate px-1"
                                    >
                                        Semana
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="today"
                                        className="rounded-lg text-xs font-semibold data-[state=active]:bg-bg-secondary data-[state=active]:text-accent-primary data-[state=active]:shadow-sm transition-all h-full truncate px-1"
                                    >
                                        Hoy
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>

                            <div className="flex flex-col gap-5 items-start bg-bg-primary/20 p-5 rounded-2xl border border-border/40 shadow-inner">
                                <div className="flex-1 w-full">
                                    <h3 className="text-sm font-semibold text-text-secondary mb-3">
                                        {range === 'today' && 'Escaneo de hoy'}
                                        {range === 'week' && 'Escaneo de la semana actual'}
                                        {range === 'recommended' && 'Rangos sugeridos'}
                                        {range === 'custom' && 'Selección de rango manual'}
                                    </h3>

                                    {range === 'today' && (
                                        <div className="flex flex-col items-center justify-center px-4 py-3 rounded-xl border bg-accent-primary/10 border-accent-primary text-accent-primary shadow-sm ring-1 ring-accent-primary/20 w-full">
                                            <span className="text-sm font-bold">{startDate}</span>
                                            <span className="text-[10px] uppercase tracking-wider opacity-70 mt-1">único día</span>
                                        </div>
                                    )}

                                    {range === 'week' && (
                                        <div className="flex flex-col items-center justify-center px-4 py-3 rounded-xl border bg-accent-primary/10 border-accent-primary text-accent-primary shadow-sm ring-1 ring-accent-primary/20 w-full">
                                            <span className="text-sm font-bold">{startDate}</span>
                                            <span className="text-[10px] uppercase tracking-wider opacity-70 my-1">hasta</span>
                                            <span className="text-sm font-bold">{endDate}</span>
                                        </div>
                                    )}

                                    {range === 'recommended' && recommendedRanges.length > 0 && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                                            {recommendedRanges.map((r, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setSelectedRecommendedIndex(i)}
                                                    className={`flex flex-col items-center justify-center px-3 py-2 sm:px-4 sm:py-3 rounded-xl border transition-all ${selectedRecommendedIndex === i
                                                        ? 'bg-accent-primary/10 border-accent-primary text-accent-primary shadow-sm ring-1 ring-accent-primary/20'
                                                        : 'bg-bg-secondary border-border/40 text-text-secondary hover:bg-bg-primary/60 hover:border-border/60 hover:text-text-primary'
                                                        }`}
                                                >
                                                    <span className="text-sm font-bold">{r.start}</span>
                                                    <span className="text-[10px] uppercase tracking-wider opacity-70 my-0.5 sm:my-1">hasta</span>
                                                    <span className="text-sm font-bold">{r.end}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {range === 'recommended' && recommendedRanges.length === 0 && (
                                        <div className="text-sm text-text-tertiary py-3 px-4 bg-bg-secondary border border-border/40 rounded-xl inline-block w-full">
                                            No hay recomendaciones disponibles (historial completo o sin espacios).
                                        </div>
                                    )}

                                    {/* One calendar for both ends: the range is a
                                        single decision, and two separate fields let
                                        the user pick an end before its start. */}
                                    {range === 'custom' && (
                                        <div className="flex flex-col gap-2 w-full">
                                            <DateRangePicker
                                                start={startDate}
                                                end={endDate}
                                                onChange={(from, to) => {
                                                    setStartDate(from);
                                                    setEndDate(to);
                                                }}
                                                triggerClassName="h-12 rounded-xl bg-bg-secondary border-border/40 text-sm font-medium text-text-primary"
                                            />
                                            <p className="text-[11px] text-text-tertiary">
                                                Elige el día de inicio y luego el de fin. Máximo 15 días.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleTriggerScan}
                                disabled={isSubmitting}
                                className="w-full shrink-0 justify-center bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-foreground font-semibold px-8 h-12 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                            >
                                {isSubmitting ? (
                                    <><RefreshCw className="w-5 h-5 animate-spin" /> Procesando...</>
                                ) : (
                                    <><Search className="w-5 h-5" /> Ejecutar Escáner</>
                                )}
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

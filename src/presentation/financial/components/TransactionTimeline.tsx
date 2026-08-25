"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { FinancialTransaction } from "@/domain/entities/financial";
import type { PaginatedResult } from "@/domain/pagination";
import { TransactionCard } from "./TransactionCard";
import { financialOfflineStore } from "@/infrastructure/offline/financial-offline-store";
import { searchPaginatedTransactionsAction, createTransactionAction } from "@/app/actions/financial-transactions";
import { buildFallbackTitle, isTransactionPaidWithCredit } from "@/lib/financial-utils";
import { useFinancialRealtime } from "../hooks/useFinancialRealtime";
import { WifiOff, Loader2 } from "lucide-react";
import { TransactionSummary } from "./TransactionSummary";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ─── Props ───────────────────────────────────────────────────

interface TransactionTimelineProps {
    /** Server-rendered first page */
    initialTransactions: FinancialTransaction[];
    /** All transactions matching current filters, regardless of pagination */
    allFilteredTransactions?: FinancialTransaction[];
    /** Current URL search-params so infinite scroll can re-apply the same filters */
    searchFilters?: Record<string, any>;
}

// ─── Supabase row shape (snake_case) ─────────────────────────

interface TransactionRow extends Record<string, unknown> {
    id: string;
    owner_user_id: string;
    type: string;
    status: string;
    amount: number;
    original_amount: number | null;
    currency: string;
    merchant: string | null;
    category_id: string | null;
    institution_id: string | null;
    account_id: string | null;
    bank_source_account_id?: string | null;
    bank_destination_account_id?: string | null;
    bank_card_id?: string | null;
    bank_institution_id?: string | null;
    paid_with_credit?: boolean | null;
    tags: string[] | null;
    description: string;
    notes: string | null;
    possible_duplicate: boolean;
    execution_id: string | null;
    origin_stats: Record<string, unknown> | null;
    date: string;
    created_at: string;
    updated_at: string;
    is_deleted?: boolean;
}

/** Map Supabase snake_case row to domain camelCase entity */
function mapRowToTransaction(row: TransactionRow): FinancialTransaction {
    const isCredit = isTransactionPaidWithCredit({
        type: row.type,
        paidWithCredit: row.paid_with_credit,
        description: row.description,
        notes: row.notes,
        originStats: row.origin_stats,
    });

    return {
        id: row.id,
        ownerUserId: row.owner_user_id,
        type: row.type as FinancialTransaction["type"],
        status: row.status as FinancialTransaction["status"],
        amount: Number(row.amount),
        originalAmount: row.original_amount != null ? Number(row.original_amount) : null,
        currency: row.currency,
        merchant: row.merchant,
        categoryId: row.category_id,
        institutionId: row.institution_id,
        bankSourceAccountId: row.bank_source_account_id ?? null,
        bankDestinationAccountId: row.bank_destination_account_id ?? null,
        bankCardId: row.bank_card_id ?? null,
        bankInstitutionId: row.bank_institution_id ?? null,
        paidWithCredit: isCredit,
        tags: row.tags,
        description: row.description,
        notes: row.notes,
        possibleDuplicate: row.possible_duplicate ?? false,
        executionId: row.execution_id,
        originStats: row.origin_stats as Record<string, unknown> | null,
        date: row.date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isDeleted: row.is_deleted ?? false,
    };
}

// ─── Helpers ─────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
    const src = new Date(dateStr);
    if (isNaN(src.getTime())) return "Fecha no detectada";
    // The stored `date` is a literal wall-clock value (tagged UTC): take its UTC
    // calendar day so the group header matches the time shown on each card.
    const date = new Date(src.getUTCFullYear(), src.getUTCMonth(), src.getUTCDate());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.getTime() === today.getTime()) return "Hoy";
    if (date.getTime() === yesterday.getTime()) return "Ayer";

    return date.toLocaleDateString("es-ES", { month: "long", day: "numeric", year: "numeric" });
}

function groupTransactionsByDate(transactions: FinancialTransaction[]) {
    const groups: Record<string, FinancialTransaction[]> = {};

    transactions.forEach(t => {
        const dateKey = formatDateLabel(t.date);
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(t);
    });

    return groups;
}

// ─── Default page size ───────────────────────────────────────

const PAGE_SIZE = 20;

/**
 * A queued offline draft may predate the rule that makes the description
 * required, or have been saved before the user typed one. Rather than let the
 * sync fail, fall back to the title the app would show for it anyway.
 */
function withFallbackDescription(draft: unknown): Record<string, unknown> {
    const data = { ...(draft as Record<string, unknown>) };
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (!description) {
        data.description = buildFallbackTitle(
            typeof data.type === "string" ? data.type : null,
            typeof data.merchant === "string"
                ? data.merchant
                : typeof data.institutionName === "string" ? data.institutionName : null,
        );
    }
    return data;
}

// ─── Component ───────────────────────────────────────────────

export function TransactionTimeline({ initialTransactions, allFilteredTransactions, searchFilters }: TransactionTimelineProps) {
    const [transactions, setTransactions] = useState<FinancialTransaction[]>(initialTransactions);
    const [isFromCache, setIsFromCache] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const sentinelRef = useRef<HTMLDivElement>(null);

    // ── Realtime: prepend new transactions on INSERT ─────────
    const handleRealtimeInsert = useCallback(
        (payload: RealtimePostgresChangesPayload<TransactionRow>) => {
            const newRow = payload.new;
            if (!newRow || typeof newRow !== "object" || !("id" in newRow)) return;

            const mapped = mapRowToTransaction(newRow as TransactionRow);

            // Skip if the new transaction doesn't match the active type filter
            const activeTypes = searchFilters?.types as string[] | undefined;
            if (activeTypes && activeTypes.length > 0 && !activeTypes.includes(mapped.type)) return;

            setTransactions(prev => {
                // Prevent duplicates
                if (prev.some(t => t.id === mapped.id)) return prev;
                return [mapped, ...prev];
            });
        },
        [searchFilters?.types],
    );

    const handleRealtimeUpdate = useCallback(
        (payload: RealtimePostgresChangesPayload<TransactionRow>) => {
            const newRow = payload.new;
            if (!newRow || typeof newRow !== "object" || !("id" in newRow)) return;

            const mapped = mapRowToTransaction(newRow as TransactionRow);

            setTransactions(prev => {
                if (mapped.status === 'DELETED') return prev.filter(t => t.id !== mapped.id);
                if (mapped.status === 'ARCHIVED' && searchFilters?.status !== 'ARCHIVED') return prev.filter(t => t.id !== mapped.id);

                return prev.map(t => t.id === mapped.id ? mapped : t);
            });
        },
        [searchFilters?.status],
    );

    const handleRealtimeDelete = useCallback(
        (payload: RealtimePostgresChangesPayload<TransactionRow>) => {
            const oldRow = payload.old;
            if (!oldRow || typeof oldRow !== "object" || !("id" in oldRow)) return;

            setTransactions(prev => prev.filter(t => t.id !== oldRow.id));
        },
        [],
    );

    const realtimeSubscriptions = useMemo(
        () => [
            { table: "financial_transactions", event: "INSERT" as const },
            { table: "financial_transactions", event: "UPDATE" as const },
            { table: "financial_transactions", event: "DELETE" as const }
        ],
        [],
    );

    const realtimeCallbacks = useMemo(
        () => ({ 
            onInsert: handleRealtimeInsert,
            onUpdate: handleRealtimeUpdate,
            onDelete: handleRealtimeDelete
        }),
        [handleRealtimeInsert, handleRealtimeUpdate, handleRealtimeDelete],
    );

    const { isPollingFallback } = useFinancialRealtime({
        channelName: "timeline-realtime",
        subscriptions: realtimeSubscriptions,
        callbacks: realtimeCallbacks as never,
        enabled: !isFromCache,
    });

    // ── Reset when server data / filters change ──────────────
    useEffect(() => {
        setTransactions(initialTransactions);
        setPage(1);
        // If the server sent fewer items than a full page, there's nothing left.
        setHasMore(initialTransactions.length >= PAGE_SIZE);
    }, [initialTransactions]);

    // ── Persist to IndexedDB for offline access ──────────────
    useEffect(() => {
        if (initialTransactions.length > 0) {
            financialOfflineStore.transactions.set("current-user", initialTransactions).catch(() => {
                // Silently ignore IndexedDB errors (e.g. private browsing)
            });
        }
    }, [initialTransactions]);

    // ── Offline fallback ─────────────────────────────────────
    useEffect(() => {
        const hasFilters = searchFilters && Object.values(searchFilters).some(v => v !== undefined && v !== '');
        
        // Trust server data if we have it, or if user is explicitly filtering
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        
        if (!isOffline || initialTransactions.length > 0 || hasFilters) {
            setIsFromCache(false);
            return;
        }

        (async () => {
            try {
                const cached = await financialOfflineStore.transactions.getAll();
                const flat = (cached?.[0] ?? []) as FinancialTransaction[];
                if (flat.length > 0) {
                    setTransactions(flat);
                    setIsFromCache(true);
                    setHasMore(false);
                } else {
                    setIsFromCache(true);
                }
            } catch {
                // IndexedDB unavailable
            }
        })();
    }, [initialTransactions, searchFilters]);

    // ── Load next page ───────────────────────────────────────
    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore || isFromCache) return;

        setIsLoadingMore(true);
        const nextPage = page + 1;

        try {
            const result = await searchPaginatedTransactionsAction({
                ...searchFilters,
                page: nextPage,
                pageSize: PAGE_SIZE,
            });

            if (result.success && result.data) {
                const paginatedData = result.data as PaginatedResult<FinancialTransaction>;
                setTransactions(prev => [...prev, ...paginatedData.data]);
                setPage(nextPage);
                setHasMore(paginatedData.pagination.hasNextPage);
            } else {
                setHasMore(false);
            }
        } catch {
            setHasMore(false);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMore, isFromCache, page, searchFilters]);

    // Use a ref to store the latest loadMore function to avoid recreating the observer
    const loadMoreRef = useRef(loadMore);
    useEffect(() => {
        loadMoreRef.current = loadMore;
    }, [loadMore]);

    // ── Background Sync for Drafts ───────────────────────────
    useEffect(() => {
        const syncDrafts = async () => {
            if (!navigator.onLine || isFromCache) return;
            try {
                const drafts = await financialOfflineStore.drafts.getAll();
                // Find completed drafts (starts with 'draft_')
                const completedDrafts = drafts.filter(d => d.id.startsWith('draft_'));
                
                if (completedDrafts.length > 0) {
                    let syncedCount = 0;
                    for (const draft of completedDrafts) {
                        try {
                            const result = await createTransactionAction(withFallbackDescription(draft.data));
                            if (result.success) {
                                await financialOfflineStore.drafts.remove(draft.id);
                                syncedCount++;
                            }
                        } catch (e) {
                            console.error(`Error syncing draft ${draft.id}`, e);
                        }
                    }
                    if (syncedCount > 0) {
                        toast.success(`Se sincronizaron ${syncedCount} transacciones pendientes.`);
                        // Optimistically reload the page (or let realtime handle it)
                        loadMoreRef.current(); 
                    }
                }
            } catch (e) {
                console.error("Error during draft synchronization", e);
            }
        };

        syncDrafts();

        const handleOnline = () => {
            syncDrafts();
            setIsFromCache(false);
        };
        const handleOffline = () => setIsFromCache(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [isFromCache]);

    // ── IntersectionObserver for infinite scroll ─────────────
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    loadMoreRef.current();
                }
            },
            { rootMargin: "200px" },
        );

        observer.observe(sentinel);

        return () => {
            observer.disconnect();
        };
    }, []);

    // ── Handlers ─────────────────────────────────────────────

    const updateLocalTransaction = useCallback((id: string, updates: Partial<FinancialTransaction>) => {
        setTransactions(prev => {
            const nextStatus = updates.status;
            if (nextStatus === 'DELETED') return prev.filter(t => t.id !== id);
            if (nextStatus === 'ARCHIVED' && searchFilters?.status !== 'ARCHIVED') return prev.filter(t => t.id !== id);
            return prev.map(t => t.id === id ? { ...t, ...updates } : t);
        });
    }, [searchFilters?.status]);

    // ── Client-side reactive type filter ─────────────────────
    // The list + charts must always reflect the active type filter from the URL.
    // The server filters the first page, but a search-param navigation can leave
    // the server-rendered children stale (router / PWA front-end-nav cache), while
    // `useSearchParams` is always reactive. Filtering here keeps the UI in sync
    // regardless — the same approach that makes the scans inbox reliable.
    const searchParams = useSearchParams();
    const typeFilter = searchParams.get("type");

    const visibleTransactions = useMemo(() => {
        if (!typeFilter) return transactions;
        const activeTypes = typeFilter.split(",").filter(Boolean);
        if (activeTypes.length === 0) return transactions;
        return transactions.filter(t => t.type && activeTypes.includes(t.type));
    }, [transactions, typeFilter]);

    // ── Render ───────────────────────────────────────────────
    const grouped = groupTransactionsByDate(visibleTransactions);

    return (
        <div className="flex flex-col gap-4 sm:gap-6">
            {isFromCache && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-400">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    <span>Mostrando transacciones en caché; parece que estás sin conexión.</span>
                </div>
            )}

            {/* Use allFilteredTransactions for the summary if available, otherwise fallback to visible */}
            <TransactionSummary transactions={allFilteredTransactions || visibleTransactions} />

            {visibleTransactions.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                    No se encontraron transacciones.
                </div>
            ) : (
                /* The gaps are deliberately tight: the day headings are short
                   labels, and the air around them was pushing transactions —
                   the thing the user came for — off the screen. */
                <div className="flex flex-col gap-3 sm:gap-5">
                    {Object.entries(grouped).map(([dateLabel, items]) => (
                        <div key={dateLabel} className="flex flex-col gap-1.5">
                            <h3 className="text-sm font-medium text-muted-foreground tracking-tight sticky top-0 bg-background/80 backdrop-blur-sm py-1.5 z-10">
                                {dateLabel}
                            </h3>
                            <div className="flex flex-col gap-1.5 sm:gap-2">
                                {items.map(t => (
                                    <TransactionCard
                                        key={t.id}
                                        transaction={t}
                                        onStatusChange={(status) => updateLocalTransaction(t.id!, { status })}
                                        onDeleted={() => setTransactions(prev => prev.filter(x => x.id !== t.id))}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Infinite-scroll sentinel */}
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />

            {isLoadingMore && (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm">Cargando más transacciones...</span>
                </div>
            )}

            {!hasMore && visibleTransactions.length > 0 && (
                <p className="text-center text-xs text-muted-foreground py-4">
                    Todas las transacciones fueron cargadas.
                </p>
            )}

            {/* Edit Modal implementation removed, using inline edit in TransactionCard */}
        </div>
    );
}

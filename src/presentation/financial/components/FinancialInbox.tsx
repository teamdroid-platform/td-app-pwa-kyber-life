"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getUnprocessedInboxTransactionsAction, mapInboxTransactionAction, dismissInboxTransactionAction } from "@/app/actions/financial-inbox";
import { getInstitutionsAction } from "@/app/actions/financial-settings";
import { getInstitutionMatchInfo, INSTITUTION_MATCH_THRESHOLD } from "@/lib/institution-match";
import { InstitutionMatchBadge } from "./InstitutionMatchBadge";
import { FinancialScannerTransaction } from "@/domain/entities/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Check, CircleAlert, Inbox as InboxIcon, RefreshCw, FileText, X, Edit2, Search, Eye, ChevronDown, ChevronUp, Clock, Tag, Receipt } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { isoToWallClockInput, wallClockInputToISO } from "@/lib/date-range";
import { useFinancialRealtime } from "../hooks/useFinancialRealtime";
import { useSearchParams } from "next/navigation";

interface EditState {
    type: string;
    merchant: string;
    amount?: number | null;
    date?: string | null;
    summary?: string;
}

const TYPE_OPTIONS = [
    { value: "EXPENSE", label: "Gasto" },
    { value: "INCOME", label: "Ingreso" },
    { value: "TRANSFER", label: "Transferencias" },
    { value: "WITHDRAWAL", label: "Retiro" },
] as const;

const DEFAULT_TRANSACTION_TYPE = "EXPENSE";

function normalizeTransactionType(type?: string | null) {
    if (!type) {
        return DEFAULT_TRANSACTION_TYPE;
    }

    const normalizedType = type.toUpperCase();
    const supportedType = TYPE_OPTIONS.find((option) => option.value === normalizedType);

    return supportedType?.value ?? DEFAULT_TRANSACTION_TYPE;
}

function formatAmount(amount?: number | null, currency = "USD") {
    if (amount == null) {
        return "--";
    }

    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * Extract the best available summary from a scanner transaction.
 * Priority: summary → originStats.emailBody → originStats.snippet
 */
function extractSummary(tx: FinancialScannerTransaction): string {
    if (tx.summary && tx.summary.trim() !== "") {
        return tx.summary;
    }
    const stats = tx.originStats as Record<string, unknown> | null | undefined;
    const emailBody = stats?.emailBody as string | undefined;
    if (emailBody && emailBody.trim() !== "") {
        return `[MAIL] ${emailBody}`;
    }
    const snippet = stats?.snippet as string | undefined;
    if (snippet && snippet.trim() !== "") {
        return `[SNIPPET] ${snippet}`;
    }
    return "";
}

function formatDate(value?: string | null) {
    if (!value) {
        return "Fecha no detectada";
    }

    return new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function formatTime(value?: string | null) {
    if (!value) {
        return "--:--";
    }

    return new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Hoy";
    if (date.toDateString() === yesterday.toDateString()) return "Ayer";

    return date.toLocaleDateString("es-ES", { month: "long", day: "numeric", year: "numeric" });
}

function groupTransactionsByDate(transactions: FinancialScannerTransaction[], editStates: Record<string, EditState>) {
    const groups: Record<string, FinancialScannerTransaction[]> = {};

    transactions.forEach(t => {
        const dateStr = editStates[t.id!]?.date || isoToWallClockInput(t.date || t.createdAt);
        const dateKey = dateStr ? formatDateLabel(dateStr) : "Fecha no detectada";
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(t);
    });

    return groups;
}

function InboxSkeleton() {
    return (
        <div className="space-y-4">
            <div className="h-20 rounded-3xl border border-border/50 bg-gradient-to-r from-bg-secondary to-bg-tertiary animate-pulse" />
            <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div
                        key={index}
                        className="h-[340px] rounded-3xl border border-border/50 bg-bg-secondary/80 animate-pulse"
                    />
                ))}
            </div>
        </div>
    );
}

export function FinancialInbox() {
    const searchParams = useSearchParams();
    const typeFilter = searchParams.get("type");

    const [transactions, setTransactions] = useState<FinancialScannerTransaction[]>([]);
    const [institutionNames, setInstitutionNames] = useState<string[]>([]);
    const [institutionsLoaded, setInstitutionsLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    // Which row is busy *and* what it's doing, so the spinner lands on the
    // button that was actually pressed (confirm vs dismiss).
    const [processing, setProcessing] = useState<{ id: string; action: "confirm" | "dismiss" } | null>(null);
    const [showPollingNotice, setShowPollingNotice] = useState(false);
    const hasLoadedOnceRef = useRef(false);
    const transactionsRef = useRef<FinancialScannerTransaction[]>([]);
    const pollingNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Editing State per transaction
    const [editStates, setEditStates] = useState<Record<string, EditState>>({});
    const [isEditing, setIsEditing] = useState<Record<string, boolean>>({});
    const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

    const toggleExpanded = (txId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setExpandedStates((prev) => ({ ...prev, [txId]: !prev[txId] }));
    };

    const toggleEdit = (txId: string) => {
        setIsEditing((prev) => ({ ...prev, [txId]: !prev[txId] }));
        if (!isEditing[txId]) {
            setExpandedStates((prev) => ({ ...prev, [txId]: true }));
        }
    };

    const cancelEdit = (txId: string, tx: FinancialScannerTransaction) => {
        setEditStates((prev) => ({
            ...prev,
            [txId]: {
                type: normalizeTransactionType(tx.type),
                merchant: tx.merchant || "",
                amount: tx.amount ?? null,
                date: isoToWallClockInput(tx.date || tx.createdAt),
                summary: extractSummary(tx),
            },
        }));
        setIsEditing((prev) => ({ ...prev, [txId]: false }));
    };

    const syncEditStates = useCallback((nextTransactions: FinancialScannerTransaction[]) => {
        setEditStates((prev) => {
            const nextState: Record<string, EditState> = {};

            nextTransactions.forEach((tx) => {
                const transactionId = tx.id;
                if (!transactionId) {
                    return;
                }

                nextState[transactionId] = prev[transactionId] ?? {
                    type: normalizeTransactionType(tx.type),
                    merchant: tx.merchant || "",
                    amount: tx.amount ?? null,
                    date: isoToWallClockInput(tx.date || tx.createdAt),
                    summary: extractSummary(tx),
                };
            });

            return nextState;
        });
    }, []);

    useEffect(() => {
        transactionsRef.current = transactions;
    }, [transactions]);

    useEffect(() => {
        return () => {
            if (pollingNoticeTimerRef.current) {
                clearTimeout(pollingNoticeTimerRef.current);
            }
        };
    }, []);

    // Load existing institutions once, to flag each card with its match confidence.
    useEffect(() => {
        let mounted = true;
        getInstitutionsAction()
            .then((insts) => {
                if (mounted) {
                    setInstitutionNames(insts.map((i) => i.name));
                    setInstitutionsLoaded(true);
                }
            })
            .catch(() => {
                if (mounted) setInstitutionsLoaded(true);
            });
        return () => { mounted = false; };
    }, []);

    const loadInbox = useCallback(async (options?: { silent?: boolean; mergeNewOnly?: boolean }) => {
        const { silent = false, mergeNewOnly = false } = options ?? {};

        if (!silent) {
            setLoading(true);
        }

        const result = await getUnprocessedInboxTransactionsAction();

        if (result.success && result.data) {
            const nextTransactions = result.data;
            const resolvedTransactions = (() => {
                if (!mergeNewOnly) {
                    return nextTransactions;
                }

                const existingTransactions = transactionsRef.current;
                const existingIds = new Set(existingTransactions.map((tx) => tx.id));
                const newTransactions = nextTransactions.filter((tx) => tx.id && !existingIds.has(tx.id));

                if (newTransactions.length === 0) {
                    return existingTransactions;
                }

                return [...newTransactions, ...existingTransactions];
            })();

            transactionsRef.current = resolvedTransactions;
            setTransactions(resolvedTransactions);
            syncEditStates(resolvedTransactions);
        } else {
            toast.error("No se pudo cargar la bandeja");
        }

        hasLoadedOnceRef.current = true;

        if (!silent) {
            setLoading(false);
        }
    }, [syncEditStates]);

    const pollInboxInBackground = useCallback(async () => {
        if (!hasLoadedOnceRef.current) {
            return;
        }

        setShowPollingNotice(true);
        if (pollingNoticeTimerRef.current) {
            clearTimeout(pollingNoticeTimerRef.current);
        }
        pollingNoticeTimerRef.current = setTimeout(() => {
            setShowPollingNotice(false);
        }, 2500);

        await loadInbox({ silent: true, mergeNewOnly: true });
    }, [loadInbox]);

    useEffect(() => {
        queueMicrotask(() => {
            void loadInbox();
        });
    }, [loadInbox]);

    // ── Realtime: auto-reload inbox on new scanner transactions ──
    const subscriptions = useMemo(
        () => [
            { table: "financial_scanner_transactions", event: "INSERT" as const },
        ],
        [],
    );

    const callbacks = useMemo(
        () => ({
            onInsert: () => {
                toast("Nueva transaccion escaneada por N8N", {
                    description: "Actualizando bandeja...",
                });
                void loadInbox({ silent: true, mergeNewOnly: true });
            },
        }),
        [loadInbox],
    );

    const { isPollingFallback } = useFinancialRealtime({
        channelName: "inbox-realtime",
        subscriptions,
        callbacks,
        onPollFallback: pollInboxInBackground,
    });




    const handleConfirm = async (tx: FinancialScannerTransaction) => {
        const editState = editStates[tx.id!];
        const type = (editState?.type as FinancialScannerTransaction["type"]) || DEFAULT_TRANSACTION_TYPE;
        // Persist the resolved institution just like the detail form: when the
        // merchant wasn't manually edited and confidently matches a stored
        // institution (score ≥ threshold), save that institution's name (e.g.
        // "PAYU*AR*UBER" → "Uber") so confirming from the card or the form agree.
        const editedMerchant = editState?.merchant;
        const rawMerchant = editedMerchant || tx.merchant;
        const merchant = (() => {
            if (editedMerchant) return editedMerchant;
            if (!institutionsLoaded || !rawMerchant) return rawMerchant;
            const info = getInstitutionMatchInfo(rawMerchant, institutionNames);
            return info.matchedName && info.score >= INSTITUTION_MATCH_THRESHOLD ? info.matchedName : rawMerchant;
        })();
        const amount = editState?.amount !== undefined ? editState.amount : tx.amount;

        if (!merchant || merchant.trim() === "") {
            toast.error("La institución es requerida para confirmar");
            return;
        }

        if (amount === null || amount === undefined || isNaN(amount)) {
            toast.error("El monto es requerido para confirmar");
            return;
        }

        if (!type) {
            toast.error("El tipo de transacción es requerido");
            return;
        }

        setProcessing({ id: tx.id!, action: "confirm" });
        try {
            const result = await mapInboxTransactionAction({
                scannerTransactionId: tx.id!,
                description: tx.description && tx.description.trim() !== "" ? tx.description.trim() : (merchant || "Transacción escaneada"),
                type: type,
                merchant: merchant,
                amount: amount,
                date: wallClockInputToISO(editState?.date),
                notes: editState?.summary || undefined,
            });

            if (result.success) {
                toast.success("Transacción confirmada y asignada");
                setTransactions((prev) => {
                    const nextTransactions = prev.filter((item) => item.id !== tx.id);
                    transactionsRef.current = nextTransactions;
                    return nextTransactions;
                });
            } else {
                toast.error(result.error || "No se pudo confirmar la transacción");
            }
        } catch {
            toast.error("Error al procesar la transacción");
        }
        setProcessing(null);
    };

    const handleDismiss = async (txId: string) => {
        setProcessing({ id: txId, action: "dismiss" });
        try {
            const result = await dismissInboxTransactionAction(txId);
            if (result.success) {
                toast.success("Transacción descartada");
                setTransactions((prev) => {
                    const nextTransactions = prev.filter((tx) => tx.id !== txId);
                    transactionsRef.current = nextTransactions;
                    return nextTransactions;
                });
            } else {
                toast.error(result.error || "No se pudo descartar la transacción");
            }
        } catch {
            toast.error("Error al descartar la transacción");
        }
        setProcessing(null);
    };

    const updateEditState = <K extends keyof EditState>(txId: string, field: K, value: EditState[K]) => {
        setEditStates(prev => ({
            ...prev,
            [txId]: {
                ...prev[txId],
                [field]: value
            }
        }));
    };

    const filteredTransactions = useMemo(() => {
        let filtered = transactions;
        if (typeFilter && typeFilter !== "ALL") {
            const activeTypes = typeFilter.split(',').filter(Boolean);
            filtered = transactions.filter(tx => {
                // Use the raw DB type for filtering to avoid defaulting null/unsupported
                // types to EXPENSE (which editStates does via normalizeTransactionType).
                // Only use the editState type if the user explicitly changed it (i.e. it
                // differs from what the raw DB type normalizes to, including null → null).
                const rawType = tx.type ? tx.type.toUpperCase() : null;
                const editedType = editStates[tx.id!]?.type;
                const normalizedRaw = rawType
                    ? (TYPE_OPTIONS.find(o => o.value === rawType)?.value ?? null)
                    : null;
                const isExplicitUserEdit = editedType !== undefined && editedType !== normalizedRaw;
                const currentType = isExplicitUserEdit ? editedType : rawType;
                if (!currentType) return false;
                return activeTypes.includes(currentType);
            });
        }

        return [...filtered].sort((a, b) => {
            const dateA = editStates[a.id!]?.date || a.date || a.createdAt;
            const dateB = editStates[b.id!]?.date || b.date || b.createdAt;

            const timeA = dateA ? new Date(dateA).getTime() : 0;
            const timeB = dateB ? new Date(dateB).getTime() : 0;

            if (timeA !== timeB) {
                return timeB - timeA;
            }

            const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

            return createdB - createdA;
        });
    }, [transactions, typeFilter, editStates]);

    if (loading) {
        return <InboxSkeleton />;
    }

    if (transactions.length === 0) {
        return (
            <Card className="overflow-hidden rounded-[2rem] border-border/60 bg-bg-secondary py-0 shadow-lg shadow-black/5">
                <CardContent className="flex flex-col items-center gap-4 px-8 py-16 text-center">
                    <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-3xl bg-accent-primary/10 text-accent-primary">
                        <InboxIcon className="h-9 w-9" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-semibold tracking-tight">Bandeja al día</h3>
                        <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
                            No hay escaneos pendientes por revisar. Cuando entren nuevos movimientos,
                            aparecerán aquí listos para confirmar y clasificar.
                        </p>
                    </div>

                    <div className="mt-4 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium" asChild>
                            <Link href="/financial/scanner" className="gap-2">
                                <Search className="w-4 h-4" />
                                Iniciar Nuevo Escaneo
                            </Link>
                        </Button>
                        <Button variant="outline" className="rounded-xl font-medium" asChild>
                            <Link href="/financial/transactions" className="gap-2">
                                <Receipt className="w-4 h-4" />
                                Ver transacciones
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (filteredTransactions.length === 0) {
        return (
            <Card className="overflow-hidden rounded-[2rem] border-border/60 bg-bg-secondary py-0 shadow-lg shadow-black/5">
                <CardContent className="flex flex-col items-center gap-4 px-8 py-16 text-center">
                    <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-3xl bg-accent-primary/10 text-accent-primary">
                        <InboxIcon className="h-9 w-9" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-semibold tracking-tight">Sin resultados</h3>
                        <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
                            No hay transacciones pendientes para la categoría seleccionada.
                        </p>
                    </div>
                    <Button variant="outline" className="mt-4 rounded-xl font-medium" asChild>
                        <Link href="/financial/transactions" className="gap-2">
                            <Receipt className="w-4 h-4" />
                            Ver transacciones
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const groupedTransactions = groupTransactionsByDate(filteredTransactions, editStates);

    return (
        <div className="space-y-5">
            <Card className="rounded-[1.75rem] border-border/60 bg-bg-secondary py-0 shadow-sm shadow-black/5">
                <CardContent className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-4 px-4 py-4 sm:px-5">
                    <div
                        className="flex items-center justify-between cursor-pointer sm:cursor-default w-full sm:w-auto flex-1"
                        onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
                    >
                        <div className="space-y-1 flex-1">
                            {isPollingFallback && showPollingNotice && (
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/5 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        ACTUALIZANDO
                                    </span>
                                </div>
                            )}
                            <h3 className="text-base font-semibold tracking-tight sm:text-lg">Escaneos por confirmar</h3>
                            <p className="max-w-md text-xs text-muted-foreground sm:text-sm">
                                Revisa y confirma o ejecuta un nuevo escaneo.
                            </p>
                        </div>
                        <div className="sm:hidden text-muted-foreground flex-shrink-0 ml-4">
                            {isHeaderExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                    </div>

                    <div className={cn("flex flex-col gap-3 w-full sm:w-auto mt-4 sm:mt-0", !isHeaderExpanded && "hidden sm:flex")}>
                        <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                            <div className="flex flex-col justify-between rounded-2xl border border-border/50 bg-bg-primary px-3 py-3 text-center sm:text-left">
                                <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground break-words leading-tight">Pendientes</div>
                                <div className="mt-1 text-lg sm:text-xl font-semibold tracking-tight">{filteredTransactions.length}</div>
                            </div>
                            <div className="flex flex-col justify-between rounded-2xl border border-border/50 bg-bg-primary px-3 py-3 text-center sm:text-left">
                                <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground break-words leading-tight">Con comercio</div>
                                <div className="mt-1 text-lg sm:text-xl font-semibold tracking-tight">{filteredTransactions.filter((tx) => tx.merchant).length}</div>
                            </div>
                            <div className="flex flex-col justify-between rounded-2xl border border-border/50 bg-bg-primary px-3 py-3 text-center sm:text-left">
                                <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground break-words leading-tight">Con monto</div>
                                <div className="mt-1 text-lg sm:text-xl font-semibold tracking-tight">{filteredTransactions.filter((tx) => tx.amount != null).length}</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 w-full sm:hidden mt-4">
                        <Link href="/financial/transactions" className="w-full">
                            <Button variant="outline" className="w-full rounded-xl gap-2 font-medium h-10">
                                <Receipt className="w-4 h-4" />
                                Transacciones
                            </Button>
                        </Link>
                        <Link href="/financial/scanner" className="w-full">
                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 font-medium shadow-sm transition-all h-10">
                                <Search className="w-4 h-4" />
                                Escanear
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            <section className="flex flex-col gap-6">
                {Object.entries(groupedTransactions).map(([dateLabel, items]) => (
                    <div key={dateLabel} className="flex flex-col gap-3">
                        <h3 className="text-sm font-medium text-muted-foreground tracking-tight sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10">
                            {dateLabel}
                        </h3>
                        <div className="grid gap-4 items-start grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {items.map((tx, index) => {
                                const isProcessing = processing?.id === tx.id;
                                const isConfirming = isProcessing && processing?.action === "confirm";
                                const isDismissing = isProcessing && processing?.action === "dismiss";
                                const editing = isEditing[tx.id!] || false;
                                const expanded = expandedStates[tx.id!] || false;

                                const txType = editStates[tx.id!]?.type || normalizeTransactionType(tx.type);
                                const isIncome = txType === "INCOME";
                                const isExpense = txType === "EXPENSE";
                                const isWithdrawal = txType === "WITHDRAWAL";
                                const typeLabel = TYPE_OPTIONS.find(o => o.value === txType)?.label || "Gasto";
                                const displaySummary = editStates[tx.id!]?.summary || "Sin resumen disponible para este escaneo.";

                                // Institution shown on the card. Mirror the detail form's server-side
                                // resolution: when the scanned merchant confidently matches a stored
                                // institution (score ≥ threshold), show that institution's name (e.g.
                                // "PAYU*AR*UBER" → "Uber") so the card and the form agree. Otherwise
                                // fall back to the raw merchant. The badge still reflects the match.
                                const rawMerchantValue = editStates[tx.id!]?.merchant || tx.merchant || "";
                                const institutionMatchInfo = institutionsLoaded
                                    ? getInstitutionMatchInfo(rawMerchantValue, institutionNames)
                                    : null;
                                const displayInstitution =
                                    institutionMatchInfo?.matchedName && institutionMatchInfo.score >= INSTITUTION_MATCH_THRESHOLD
                                        ? institutionMatchInfo.matchedName
                                        : rawMerchantValue;


                                return (
                                    <Card
                                        key={tx.id}
                                        className={cn(
                                            "group relative overflow-hidden rounded-[1.75rem] border-border/60 bg-bg-secondary py-0 shadow-sm shadow-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                                            "flex flex-col",
                                            isProcessing && "opacity-60 pointer-events-none"
                                        )}
                                    >
                                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent" aria-hidden="true" />

                                        <CardHeader
                                            className={cn(
                                                "flex flex-col !space-y-0 !px-4 !pt-4 !pb-2.5 sm:!px-5 select-none bg-bg-secondary/50 transition-colors",
                                                (expanded || editing) && "border-b border-border/50",
                                                !editing && "cursor-pointer hover:bg-bg-secondary"
                                            )}
                                            onClick={() => { if (!editing) toggleExpanded(tx.id!) }}
                                        >
                                            <div className="flex flex-col w-full gap-3">
                                                <div className="flex flex-col w-full gap-2">
                                                    {/* TOP ROW: Badge + Amount */}
                                                    <div className="flex w-full items-start justify-between gap-3 min-w-0">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span
                                                                className="inline-flex h-5 max-w-[180px] items-center gap-1 rounded-md border border-[#FFB020]/20 bg-[#FFB020]/10 px-2 text-[11px] font-medium leading-none tracking-wide text-[#FFB020]"
                                                                title={tx.category || "Sin categoría"}
                                                            >
                                                                <Tag className="h-3 w-3 shrink-0" />
                                                                <span className="truncate">{tx.category || "Sin categoría"}</span>
                                                            </span>
                                                            {tx.relatedTransactionHint && (
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[#FFB020]/20 bg-[#FFB020]/10 text-[#FFB020] transition-colors hover:bg-[#FFB020]/20 focus-visible:outline-none"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <CircleAlert className="h-3 w-3" />
                                                                        </button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent align="start" className="w-72 rounded-xl border border-border/50 bg-bg-secondary p-3 text-sm shadow-xl shadow-black/40">
                                                                        <div className="flex items-start gap-2">
                                                                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB020]" />
                                                                            <p className="text-muted-foreground">Posible relación: <span className="text-foreground font-medium">{tx.relatedTransactionHint}</span></p>
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-col items-end shrink-0">
                                                            {editing ? (
                                                                <div className="flex items-center justify-end gap-1 overflow-hidden max-w-[120px]">
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        value={editStates[tx.id!]?.amount ?? ""}
                                                                        onChange={(e) => updateEditState(tx.id!, "amount", e.target.value ? parseFloat(e.target.value) : null)}
                                                                        className="h-7 w-20 text-right font-medium text-xs border-border/40 bg-white/5 rounded-md px-2 focus-visible:ring-1 focus-visible:ring-white/20"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <span
                                                                    className={cn(
                                                                        "text-[15px] sm:text-[17px] font-semibold tracking-tight whitespace-nowrap",
                                                                        isIncome ? "text-[#2EE59D]" : isExpense ? "text-rose-400" : isWithdrawal ? "text-sky-400" : "text-[#FFB020]"
                                                                    )}
                                                                    title={formatAmount(editStates[tx.id!]?.amount, tx.currency || "USD")}
                                                                >
                                                                    {isIncome ? "+" : isExpense ? "-" : ""}
                                                                    {formatAmount(editStates[tx.id!]?.amount, tx.currency || "USD")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* TITLE & MERCHANT (Full Width) */}
                                                    <div className="flex flex-col w-full">
                                                        <CardTitle
                                                            className="text-sm sm:text-base tracking-tight font-semibold line-clamp-2 leading-tight w-full mb-0.5"
                                                            title={tx.description || "Transacción"}
                                                        >
                                                            {tx.description || "Transacción"}
                                                        </CardTitle>
                                                        <div className="flex items-center min-w-0 w-full text-xs text-zinc-400">
                                                            {editing ? (
                                                                <Input
                                                                    value={editStates[tx.id!]?.merchant || ""}
                                                                    onChange={(event) => updateEditState(tx.id!, "merchant", event.target.value)}
                                                                    placeholder="Institución"
                                                                    className="h-7 text-xs font-medium border-white/10 bg-white/5 rounded-md px-2 w-full focus-visible:ring-1 focus-visible:ring-white/20 mt-1"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            ) : (
                                                                <>
                                                                    <span className="truncate min-w-0" title={displayInstitution || "Institución por confirmar"}>
                                                                        {displayInstitution || "Institución por confirmar"}
                                                                    </span>
                                                                    {institutionMatchInfo && rawMerchantValue && (
                                                                        <InstitutionMatchBadge
                                                                            info={institutionMatchInfo}
                                                                            size={13}
                                                                            className="ml-1"
                                                                        />
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* BOTTOM SIDE (Time, Context & Actions) */}
                                                <div className="flex w-full items-center justify-between pt-3 mt-1 border-t border-border/40 gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span className="flex items-center justify-center gap-1.5 text-[11px] sm:text-xs shrink-0 bg-transparent text-zinc-400 hover:text-zinc-200 px-2 h-7 sm:h-8 rounded-sm border border-transparent font-medium transition-colors">
                                                            <Clock className="h-3.5 w-3.5 opacity-70" />
                                                            {editing ? (
                                                                <Input
                                                                    type="datetime-local"
                                                                    value={editStates[tx.id!]?.date || ""}
                                                                    onChange={(e) => updateEditState(tx.id!, "date", e.target.value)}
                                                                    className="h-6 text-[10px] py-0 px-2 border-white/10 bg-white/5 text-zinc-200 rounded-md w-32 focus-visible:ring-1 focus-visible:ring-white/20"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            ) : (
                                                                <span className="truncate">
                                                                    {editStates[tx.id!]?.date ? formatTime(editStates[tx.id!]!.date) : "--:--"}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        {!editing && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleExpanded(tx.id!)}
                                                                title={expanded ? "Ocultar detalles" : "Ver detalles"}
                                                                className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md transition-all shrink-0 active:scale-95 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 text-indigo-400 hover:from-indigo-500/20 hover:to-indigo-600/10 hover:text-indigo-300 border border-indigo-500/10 hover:border-indigo-500/20 shadow-sm"
                                                            >
                                                                {expanded ? (
                                                                    <ChevronUp className="h-4 w-4 shrink-0" />
                                                                ) : (
                                                                    <ChevronDown className="h-4 w-4 shrink-0" />
                                                                )}
                                                            </button>
                                                        )}

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-gradient-to-br from-zinc-500/10 to-zinc-600/5 text-zinc-400 border border-zinc-500/10 hover:from-zinc-500/20 hover:to-zinc-600/10 hover:text-zinc-300 hover:border-zinc-500/20 hover:shadow-sm shrink-0 transition-all"
                                                            disabled={isProcessing}
                                                            asChild
                                                        >
                                                            <Link href={`/financial/scans/${tx.id}`}>
                                                                <Eye className="h-4 w-4 opacity-70" />
                                                                <span className="sr-only">Detalles</span>
                                                            </Link>
                                                        </Button>

                                                        {editing ? (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 sm:h-8 px-3 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                                                                    onClick={() => cancelEdit(tx.id!, tx)}
                                                                    disabled={isProcessing}
                                                                >
                                                                    Cancelar
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    className="h-7 sm:h-8 px-3 rounded-md text-xs font-medium bg-zinc-100 text-zinc-900 hover:bg-white shadow-sm transition-colors"
                                                                    onClick={() => toggleEdit(tx.id!)}
                                                                    disabled={isProcessing}
                                                                >
                                                                    <Check className="h-3.5 w-3.5 mr-1" />
                                                                    Listo
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-gradient-to-br from-rose-500/10 to-rose-600/5 text-rose-400 border border-rose-500/10 hover:from-rose-500/20 hover:to-rose-600/10 hover:text-rose-300 hover:border-rose-500/20 hover:shadow-sm shrink-0 transition-all"
                                                                    onClick={() => handleDismiss(tx.id!)}
                                                                    disabled={isProcessing}
                                                                    title="Descartar"
                                                                >
                                                                    {isDismissing ? (
                                                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                                    ) : (
                                                                        <X className="h-4 w-4" />
                                                                    )}
                                                                </Button>
                                                                <Button
                                                                    size="icon"
                                                                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 text-emerald-400 border border-emerald-500/10 hover:from-emerald-500/20 hover:to-emerald-600/10 hover:text-emerald-300 hover:border-emerald-500/20 hover:shadow-sm shrink-0 transition-all"
                                                                    onClick={() => handleConfirm(tx)}
                                                                    disabled={isProcessing}
                                                                    title="Confirmar"
                                                                >
                                                                    {isConfirming ? (
                                                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                                    ) : (
                                                                        <Check className="h-4 w-4" />
                                                                    )}
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardHeader>

                                        {/* Expanded Area for Resumen */}
                                        {(expanded || editing) && (
                                            <CardContent className="space-y-4 px-4 pb-3 pt-2.5 sm:px-5 animate-in slide-in-from-top-2 duration-200">
                                                <div className="rounded-xl bg-white/[0.02] p-3.5 border border-white/5 flex flex-col gap-2">
                                                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Resumen</span>
                                                    {editing ? (
                                                        <textarea
                                                            value={editStates[tx.id!]?.summary || ""}
                                                            onChange={(e) => updateEditState(tx.id!, "summary", e.target.value)}
                                                            className="w-full min-h-[60px] rounded-lg border border-white/10 bg-white/5 p-2.5 text-xs sm:text-sm leading-relaxed text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/20 resize-y"
                                                            placeholder="No hay resumen disponible para este escaneo."
                                                        />
                                                    ) : (
                                                        <p className="text-xs sm:text-sm leading-relaxed text-zinc-400 whitespace-pre-wrap break-words [word-break:break-word]">
                                                            {displaySummary}
                                                        </p>
                                                    )}
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
}

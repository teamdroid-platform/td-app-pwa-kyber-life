"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
    Check,
    CircleAlert,
    Inbox as InboxIcon,
    RefreshCw,
    X,
    Search,
    Clock,
    Tag,
    Receipt,
    Loader2,
} from "lucide-react";
import {
    getUnprocessedInboxTransactionsAction,
    mapInboxTransactionAction,
    dismissInboxTransactionAction,
} from "@/app/actions/financial-inbox";
import { getInstitutionsAction } from "@/app/actions/financial-settings";
import { getInstitutionMatchInfo, INSTITUTION_MATCH_THRESHOLD } from "@/lib/institution-match";
import { InstitutionMatchBadge } from "./InstitutionMatchBadge";
import { FinancialScannerTransaction } from "@/domain/entities/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RobotLoader } from "@/components/ui/RobotLoader";
import { cn } from "@/lib/utils";
import { isoToWallClockInput } from "@/lib/date-range";
import { useFinancialRealtime } from "../hooks/useFinancialRealtime";

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

function groupTransactionsByDate(transactions: FinancialScannerTransaction[]) {
    const groups: Record<string, FinancialScannerTransaction[]> = {};

    transactions.forEach((t) => {
        const dateStr = isoToWallClockInput(t.date || t.createdAt);
        const dateKey = dateStr ? formatDateLabel(dateStr) : "Fecha no detectada";
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(t);
    });

    return groups;
}

export function FinancialInbox() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const typeFilter = searchParams.get("type");

    const [transactions, setTransactions] = useState<FinancialScannerTransaction[]>([]);
    const [institutionNames, setInstitutionNames] = useState<string[]>([]);
    const [institutionsLoaded, setInstitutionsLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [openingId, setOpeningId] = useState<string | null>(null);

    // Which row is busy *and* what it's doing, so the spinner lands on the
    // button that was actually pressed (confirm vs dismiss).
    const [processing, setProcessing] = useState<{ id: string; action: "confirm" | "dismiss" } | null>(null);
    const [showPollingNotice, setShowPollingNotice] = useState(false);
    const hasLoadedOnceRef = useRef(false);
    const transactionsRef = useRef<FinancialScannerTransaction[]>([]);
    const pollingNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

    const openDetail = (txId: string) => {
        if (openingId) return;
        setOpeningId(txId);
        router.push(`/financial/scans/${txId}`);
    };

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
        return () => {
            mounted = false;
        };
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
        } else {
            toast.error("No se pudo cargar la bandeja");
        }

        hasLoadedOnceRef.current = true;

        if (!silent) {
            setLoading(false);
        }
    }, []);

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
        () => [{ table: "financial_scanner_transactions", event: "INSERT" as const }],
        [],
    );

    const callbacks = useMemo(
        () => ({
            onInsert: () => {
                toast("Nueva transacción escaneada por N8N", {
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
        const type = normalizeTransactionType(tx.type);
        const rawMerchant = tx.merchant;
        const merchant = (() => {
            if (!institutionsLoaded || !rawMerchant) return rawMerchant;
            const info = getInstitutionMatchInfo(rawMerchant, institutionNames);
            return info.matchedName && info.score >= INSTITUTION_MATCH_THRESHOLD ? info.matchedName : rawMerchant;
        })();
        const amount = tx.amount;

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
                description:
                    tx.description && tx.description.trim() !== ""
                        ? tx.description.trim()
                        : merchant || "Transacción escaneada",
                type: type,
                merchant: merchant,
                amount: amount,
                date: tx.date || null,
                notes: extractSummary(tx) || undefined,
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

    const filteredTransactions = useMemo(() => {
        let filtered = transactions;
        if (typeFilter && typeFilter !== "ALL") {
            const activeTypes = typeFilter.split(",").filter(Boolean);
            filtered = transactions.filter((tx) => {
                const rawType = tx.type ? tx.type.toUpperCase() : null;
                const normalizedRaw = rawType
                    ? (TYPE_OPTIONS.find((o) => o.value === rawType)?.value ?? null)
                    : null;
                if (!normalizedRaw) return false;
                return activeTypes.includes(normalizedRaw);
            });
        }

        return [...filtered].sort((a, b) => {
            const dateA = a.date || a.createdAt;
            const dateB = b.date || b.createdAt;

            const timeA = dateA ? new Date(dateA).getTime() : 0;
            const timeB = dateB ? new Date(dateB).getTime() : 0;

            if (timeA !== timeB) {
                return timeB - timeA;
            }

            const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

            return createdB - createdA;
        });
    }, [transactions, typeFilter]);

    if (loading) {
        return (
            <div className="flex min-h-[45vh] w-full items-center justify-center py-12">
                <RobotLoader size={96} text="Cargando datos..." />
            </div>
        );
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
                                Escanear
                            </Link>
                        </Button>
                        <Button variant="outline" className="rounded-xl font-medium" asChild>
                            <Link href="/financial/transactions" className="gap-2">
                                <Receipt className="w-4 h-4" />
                                Transacciones
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

    const groupedTransactions = groupTransactionsByDate(filteredTransactions);

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
                            {items.map((tx) => {
                                const isProcessing = processing?.id === tx.id;
                                const isConfirming = isProcessing && processing?.action === "confirm";
                                const isDismissing = isProcessing && processing?.action === "dismiss";
                                const isOpening = openingId === tx.id;

                                const txType = normalizeTransactionType(tx.type);
                                const isIncome = txType === "INCOME";
                                const isExpense = txType === "EXPENSE";
                                const isWithdrawal = txType === "WITHDRAWAL";

                                // Institution shown on the card. Mirror the detail form's server-side
                                // resolution: when the scanned merchant confidently matches a stored
                                // institution (score ≥ threshold), show that institution's name (e.g.
                                // "PAYU*AR*UBER" → "Uber") so the card and the form agree.
                                const rawMerchantValue = tx.merchant || "";
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
                                            "flex flex-col cursor-pointer active:scale-[0.985]",
                                            isOpening && "scale-[0.985] border-accent-primary/50 ring-1 ring-accent-primary/30",
                                            isProcessing && "opacity-60 pointer-events-none"
                                        )}
                                        role="link"
                                        tabIndex={0}
                                        aria-busy={isOpening}
                                        onClick={() => openDetail(tx.id!)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                openDetail(tx.id!);
                                            }
                                        }}
                                    >
                                        <div
                                            className={cn(
                                                "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent",
                                                isOpening && "h-0.5 animate-pulse via-accent-primary"
                                            )}
                                            aria-hidden="true"
                                        />

                                        <CardHeader className="flex flex-col !space-y-0 !px-4 !pt-4 !pb-3 sm:!px-5 select-none bg-bg-secondary/50 transition-colors">
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
                                                                    <PopoverContent
                                                                        align="start"
                                                                        className="w-72 rounded-xl border border-border/50 bg-bg-secondary p-3 text-sm shadow-xl shadow-black/40"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <div className="flex items-start gap-2">
                                                                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB020]" />
                                                                            <p className="text-muted-foreground">
                                                                                Posible relación:{" "}
                                                                                <span className="text-foreground font-medium">
                                                                                    {tx.relatedTransactionHint}
                                                                                </span>
                                                                            </p>
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {isOpening && (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-primary" />
                                                            )}
                                                            <span
                                                                className={cn(
                                                                    "text-[15px] sm:text-[17px] font-semibold tracking-tight whitespace-nowrap",
                                                                    isIncome
                                                                        ? "text-[#2EE59D]"
                                                                        : isExpense
                                                                        ? "text-rose-400"
                                                                        : isWithdrawal
                                                                        ? "text-sky-400"
                                                                        : "text-[#FFB020]"
                                                                )}
                                                                title={formatAmount(tx.amount, tx.currency || "USD")}
                                                            >
                                                                {isIncome ? "+" : isExpense ? "-" : ""}
                                                                {formatAmount(tx.amount, tx.currency || "USD")}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* TITLE & MERCHANT (Full Width) */}
                                                    <div className="flex flex-col w-full">
                                                        <CardTitle
                                                            className="text-sm sm:text-base tracking-tight font-semibold line-clamp-2 leading-tight w-full mb-0.5 group-hover:text-accent-primary transition-colors"
                                                            title={tx.description || "Transacción"}
                                                        >
                                                            {tx.description || "Transacción"}
                                                        </CardTitle>
                                                        <div className="flex items-center min-w-0 w-full text-xs text-zinc-400">
                                                            <span
                                                                className="truncate min-w-0"
                                                                title={displayInstitution || "Institución por confirmar"}
                                                            >
                                                                {displayInstitution || "Institución por confirmar"}
                                                            </span>
                                                            {institutionMatchInfo && rawMerchantValue && (
                                                                <InstitutionMatchBadge
                                                                    info={institutionMatchInfo}
                                                                    size={13}
                                                                    className="ml-1"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* BOTTOM SIDE (Time & Actions) */}
                                                <div className="flex w-full items-center justify-between pt-3 mt-1 border-t border-border/40 gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span className="flex items-center justify-center gap-1.5 text-[11px] sm:text-xs shrink-0 bg-transparent text-zinc-400 px-2 h-7 sm:h-8 rounded-sm font-medium">
                                                            <Clock className="h-3.5 w-3.5 opacity-70" />
                                                            <span className="truncate">
                                                                {tx.date
                                                                    ? formatTime(tx.date)
                                                                    : tx.createdAt
                                                                    ? formatTime(tx.createdAt)
                                                                    : "--:--"}
                                                            </span>
                                                        </span>
                                                    </div>

                                                    {/* Actions: Discard & Confirm */}
                                                    <div
                                                        className="flex items-center gap-2 shrink-0"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
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
                                                    </div>
                                                </div>
                                            </div>
                                        </CardHeader>
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

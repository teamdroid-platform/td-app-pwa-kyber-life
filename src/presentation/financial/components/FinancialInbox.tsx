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
    Receipt,
    Loader2,
    CreditCard,
    Calendar,
} from "lucide-react";
import {
    getUnprocessedInboxTransactionsAction,
    mapInboxTransactionAction,
    dismissInboxTransactionAction,
} from "@/app/actions/financial-inbox";
import { getInstitutionsAction } from "@/app/actions/financial-settings";
import { getInstitutionMatchInfo, INSTITUTION_MATCH_THRESHOLD } from "@/lib/institution-match";
import { isTransactionPaidWithCredit } from "@/lib/financial-utils";
import { InstitutionMatchBadge } from "./InstitutionMatchBadge";
import { FinancialScannerTransaction } from "@/domain/entities/financial";
import { formatAmount, getCategoryVisualConfig, extractSummary, formatTime } from "../lib/scan-display";
import { ScanAccountBadges } from "./ScanAccountBadges";
import { ScanTable } from "./ScanTable";
import { ScanKpiCards } from "./ScanKpiCards";
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

function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Fecha no detectada";

    return date.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
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
        <div className="@container/scanlist space-y-5">
            {/* Las cuatro cifras del monton pendiente. El aviso de
                actualizacion vive aqui arriba porque es de la bandeja entera,
                no de ninguna de las cifras. */}
            {isPollingFallback && showPollingNotice && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/5 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    ACTUALIZANDO
                </span>
            )}

            <ScanKpiCards scans={filteredTransactions} />

            {/* Los dos accesos, solo en movil: en escritorio ya estan arriba,
                junto al titulo de la pantalla. */}
            <div className="grid grid-cols-2 gap-2 @3xl/scanlist:hidden">
                <Link href="/financial/transactions" className="w-full">
                    <Button variant="outline" className="h-8 w-full gap-2 rounded-xl text-xs font-medium">
                        <Receipt className="h-3.5 w-3.5" />
                        Transacciones
                    </Button>
                </Link>
                <Link href="/financial/scanner" className="w-full">
                    <Button className="h-8 w-full gap-2 rounded-xl bg-emerald-600 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-700">
                        <Search className="h-3.5 w-3.5" />
                        Escanear
                    </Button>
                </Link>
            </div>

            {/* Escritorio: tabla ordenable y paginada. Móvil: las tarjetas
                agrupadas por día de siempre — seis columnas en 360px no son una
                tabla. El corte mira el ancho del contenedor y no el de la
                ventana, porque la barra lateral se lleva 256px y se pliega en
                caliente. */}
            <div>
                {/* Las dos vistas viven en el DOM y es el CSS quien elige; el
                    `data-testid` deja que un test diga cual de las dos prueba, que
                    en jsdom no hay CSS y ambas se montan. */}
                <div data-testid="inbox-table" className="hidden @3xl/scanlist:block">
                    <ScanTable
                        scans={filteredTransactions}
                        processing={processing}
                        onApprove={handleConfirm}
                        onReject={handleDismiss}
                    />
                </div>

            <section data-testid="inbox-cards" className="flex flex-col gap-5 @3xl/scanlist:hidden">
                {Object.entries(groupedTransactions).map(([dateLabel, items]) => (
                    <div key={dateLabel} className="flex flex-col gap-2.5">
                        {/* Date Header with Purple Calendar Icon */}
                        <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-text-primary dark:text-slate-200 py-0.5">
                            <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                            <span className="capitalize">{dateLabel}</span>
                        </div>

                        {/* Card List - Compact Vertical Spacing */}
                        <div className="flex flex-col gap-2.5 sm:gap-3">
                            {items.map((tx) => {
                                const isProcessing = processing?.id === tx.id;
                                const isConfirming = isProcessing && processing?.action === "confirm";
                                const isDismissing = isProcessing && processing?.action === "dismiss";
                                const isOpening = openingId === tx.id;

                                const txType = normalizeTransactionType(tx.type);
                                const isIncome = txType === "INCOME";
                                const isExpense = txType === "EXPENSE";
                                const isWithdrawal = txType === "WITHDRAWAL";

                                const categoryVisual = getCategoryVisualConfig(tx.category, tx.type);
                                const CategoryIcon = categoryVisual.icon;
                                const isPaidWithCredit = isTransactionPaidWithCredit(tx);

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
                                            "group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/50 backdrop-blur-sm py-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-300 dark:border-indigo-500/20 dark:bg-slate-900/60 dark:shadow-md dark:shadow-black/20 dark:hover:shadow-lg dark:hover:border-indigo-500/40",
                                            "flex flex-col cursor-pointer active:scale-[0.99]",
                                            isOpening && "scale-[0.99] border-indigo-400/60 ring-1 ring-indigo-400/40",
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
                                        {/* Top Accent Gradient Line */}
                                        <div
                                            className={cn(
                                                "absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/20 dark:via-indigo-500/40 to-transparent",
                                                isOpening && "h-0.5 animate-pulse via-indigo-400"
                                            )}
                                            aria-hidden="true"
                                        />

                                        <CardHeader className="flex flex-col !space-y-0 !p-3 sm:!p-3.5 select-none bg-slate-50/40 dark:bg-slate-900/40 transition-colors">
                                            {/* TOP SECTION: Left Column (Avatar + Time) + Content Block */}
                                            <div className="flex items-start gap-3 w-full">
                                                {/* Left Column: Circular Glowing Avatar + Time placed directly below (without clock icon) */}
                                                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                                                    <div className="relative">
                                                        <div
                                                            className={cn(
                                                                "flex items-center justify-center rounded-full w-11 h-11 border transition-transform duration-200 group-hover:scale-105",
                                                                categoryVisual.containerClass
                                                            )}
                                                        >
                                                            <CategoryIcon className="w-5 h-5" strokeWidth={2.2} />
                                                        </div>
                                                        {/* Top badge on avatar (TC if credit) */}
                                                        {isPaidWithCredit && (
                                                            <span
                                                                className="absolute -top-1 -right-1 z-10 flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[8px] font-extrabold uppercase leading-none text-slate-950 shadow-sm"
                                                                title="Pagado con tarjeta de crédito"
                                                            >
                                                                <CreditCard className="h-2 w-2" /> TC
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Time placed right under category icon without clock icon */}
                                                    <span className="text-[11px] text-text-tertiary font-medium tracking-tight">
                                                        {tx.date
                                                            ? formatTime(tx.date)
                                                            : tx.createdAt
                                                            ? formatTime(tx.createdAt)
                                                            : "--:--"}
                                                    </span>
                                                </div>

                                                {/* Right: Category, Amount, Title, Institution, Accounts */}
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    {/* Top Row: Category pill badge (no tag icon) + Amount */}
                                                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span
                                                                className="inline-flex h-5 max-w-[150px] sm:max-w-[190px] items-center rounded-md border border-amber-500/20 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold leading-none tracking-wide text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
                                                                title={tx.category || "Sin categoría"}
                                                            >
                                                                <span className="truncate">{tx.category || "Sin categoría"}</span>
                                                            </span>
                                                            {tx.relatedTransactionHint ? (
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            className="inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border border-amber-500/20 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20 focus-visible:outline-none"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <CircleAlert className="h-3 w-3" />
                                                                        </button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent
                                                                        align="start"
                                                                        className="w-72 rounded-xl border border-border/50 bg-bg-secondary p-3 text-sm shadow-xl"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <div className="flex items-start gap-2">
                                                                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                                                            <p className="text-muted-foreground">
                                                                                Posible relación:{" "}
                                                                                <span className="text-foreground font-medium">
                                                                                    {tx.relatedTransactionHint}
                                                                                </span>
                                                                            </p>
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            ) : (
                                                                <span className="text-slate-400 dark:text-slate-500 text-xs select-none" title="Información">
                                                                    ⓘ
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Amount */}
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {isOpening && (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                                                            )}
                                                            <span
                                                                className={cn(
                                                                    "text-[15px] sm:text-base font-bold tracking-tight whitespace-nowrap",
                                                                    isIncome
                                                                        ? "text-emerald-600 dark:text-emerald-400"
                                                                        : isExpense
                                                                        ? "text-rose-600 dark:text-[#FF4D6D]"
                                                                        : isWithdrawal
                                                                        ? "text-sky-600 dark:text-sky-400"
                                                                        : "text-amber-600 dark:text-amber-400"
                                                                )}
                                                                title={formatAmount(tx.amount, tx.currency || "USD")}
                                                            >
                                                                {isIncome ? "+" : isExpense ? "-" : ""}
                                                                {formatAmount(tx.amount, tx.currency || "USD")}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Title */}
                                                    <CardTitle
                                                        className="text-sm sm:text-[15px] tracking-tight font-bold line-clamp-2 leading-snug w-full mt-1 group-hover:text-accent-primary transition-colors text-text-primary"
                                                        title={tx.description || "Transacción"}
                                                    >
                                                        {tx.description || "Transacción"}
                                                    </CardTitle>

                                                    {/* Institution / Merchant with Verification Badge */}
                                                    <div className="flex items-center min-w-0 w-full text-xs text-text-tertiary mt-0.5 font-medium">
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
                                                                className="ml-1 shrink-0"
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Origen y destino, compartido con la tabla de escritorio. */}
                                                    <ScanAccountBadges scan={tx} className="mt-2" />
                                                </div>
                                            </div>

                                            {/* BOTTOM BAR: Action Buttons */}
                                            <div
                                                className="grid grid-cols-2 gap-2.5 w-full pt-2.5 mt-2.5 border-t border-slate-100 dark:border-slate-800/80"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {/* Reject Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismiss(tx.id!)}
                                                    disabled={isProcessing}
                                                    title="Rechazar"
                                                    className="flex items-center justify-center gap-1.5 h-8.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 hover:border-rose-300 text-xs font-semibold active:scale-[0.98] transition-all shadow-sm dark:bg-rose-950/20 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-900/40 dark:hover:text-rose-300 dark:hover:border-rose-500/35"
                                                >
                                                    {isDismissing ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500 dark:text-rose-400" />
                                                    ) : (
                                                        <X className="h-3.5 w-3.5 stroke-[2.5]" />
                                                    )}
                                                    <span>Rechazar</span>
                                                </button>

                                                {/* Approve Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleConfirm(tx)}
                                                    disabled={isProcessing}
                                                    title="Aprobar"
                                                    className="flex items-center justify-center gap-1.5 h-8.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-300 text-xs font-semibold active:scale-[0.98] transition-all shadow-sm dark:bg-emerald-950/20 dark:border-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300 dark:hover:border-emerald-500/35"
                                                >
                                                    {isConfirming ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500 dark:text-emerald-400" />
                                                    ) : (
                                                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                                    )}
                                                    <span>Aprobar</span>
                                                </button>
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
        </div>
    );
}

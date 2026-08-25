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
    Utensils,
    Car,
    HeartPulse,
    Lightbulb,
    Ticket,
    ShoppingCart,
    GraduationCap,
    Home,
    Dog,
    TrendingUp,
    ArrowRightLeft,
    Wallet,
    CreditCard,
    ArrowUpRight,
    ArrowDownLeft,
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

interface CategoryVisualConfig {
    icon: React.ElementType;
    containerClass: string;
}

function getCategoryVisualConfig(category?: string | null, txType?: string | null): CategoryVisualConfig {
    const cat = (category || "").toLowerCase().trim();
    const type = (txType || "").toUpperCase();

    if (
        cat.includes("aliment") ||
        cat.includes("comida") ||
        cat.includes("restauran") ||
        cat.includes("food") ||
        cat.includes("supermerc") ||
        cat.includes("cafeter")
    ) {
        return {
            icon: Utensils,
            containerClass: "border-[#FFB020]/40 bg-[#FFB020]/10 text-[#FFB020] shadow-[0_0_14px_rgba(255,176,32,0.25)]",
        };
    }
    if (
        cat.includes("transpor") ||
        cat.includes("viaje") ||
        cat.includes("taxi") ||
        cat.includes("uber") ||
        cat.includes("cabify") ||
        cat.includes("gasolin") ||
        cat.includes("combust") ||
        cat.includes("peaje")
    ) {
        return {
            icon: Car,
            containerClass: "border-[#00B4D8]/40 bg-[#00B4D8]/10 text-[#00B4D8] shadow-[0_0_14px_rgba(0,180,216,0.25)]",
        };
    }
    if (
        cat.includes("salud") ||
        cat.includes("farmac") ||
        cat.includes("medic") ||
        cat.includes("hospital") ||
        cat.includes("dentist")
    ) {
        return {
            icon: HeartPulse,
            containerClass: "border-rose-500/40 bg-rose-500/10 text-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.22)]",
        };
    }
    if (
        cat.includes("servici") ||
        cat.includes("luz") ||
        cat.includes("agua") ||
        cat.includes("telef") ||
        cat.includes("internet") ||
        cat.includes("electric")
    ) {
        return {
            icon: Lightbulb,
            containerClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 shadow-[0_0_14px_rgba(234,179,8,0.22)]",
        };
    }
    if (
        cat.includes("entreten") ||
        cat.includes("cine") ||
        cat.includes("streaming") ||
        cat.includes("netflix") ||
        cat.includes("spotify") ||
        cat.includes("juego") ||
        cat.includes("ocio")
    ) {
        return {
            icon: Ticket,
            containerClass: "border-purple-500/40 bg-purple-500/10 text-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.22)]",
        };
    }
    if (
        cat.includes("compra") ||
        cat.includes("shop") ||
        cat.includes("ropa") ||
        cat.includes("tienda") ||
        cat.includes("mall") ||
        cat.includes("amazon")
    ) {
        return {
            icon: ShoppingCart,
            containerClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.22)]",
        };
    }
    if (
        cat.includes("educa") ||
        cat.includes("curso") ||
        cat.includes("universid") ||
        cat.includes("colegio") ||
        cat.includes("libro")
    ) {
        return {
            icon: GraduationCap,
            containerClass: "border-blue-500/40 bg-blue-500/10 text-blue-400 shadow-[0_0_14px_rgba(59,130,246,0.22)]",
        };
    }
    if (
        cat.includes("hogar") ||
        cat.includes("casa") ||
        cat.includes("arriendo") ||
        cat.includes("alquiler") ||
        cat.includes("mueble")
    ) {
        return {
            icon: Home,
            containerClass: "border-teal-500/40 bg-teal-500/10 text-teal-400 shadow-[0_0_14px_rgba(20,184,166,0.22)]",
        };
    }
    if (
        cat.includes("mascot") ||
        cat.includes("veterin") ||
        cat.includes("perro") ||
        cat.includes("gato")
    ) {
        return {
            icon: Dog,
            containerClass: "border-orange-500/40 bg-orange-500/10 text-orange-400 shadow-[0_0_14px_rgba(249,115,22,0.22)]",
        };
    }

    if (type === "INCOME") {
        return {
            icon: TrendingUp,
            containerClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.25)]",
        };
    }
    if (type === "TRANSFER") {
        return {
            icon: ArrowRightLeft,
            containerClass: "border-indigo-500/40 bg-indigo-500/10 text-indigo-400 shadow-[0_0_14px_rgba(99,102,241,0.22)]",
        };
    }
    if (type === "WITHDRAWAL") {
        return {
            icon: Wallet,
            containerClass: "border-sky-500/40 bg-sky-500/10 text-sky-400 shadow-[0_0_14px_rgba(14,165,233,0.22)]",
        };
    }

    return {
        icon: Receipt,
        containerClass: "border-[#FFB020]/30 bg-[#FFB020]/10 text-[#FFB020] shadow-[0_0_12px_rgba(255,176,32,0.18)]",
    };
}

interface ScannedAccountDetails {
    source?: string | null;
    destination?: string | null;
}

/**
 * Extracts origin and destination account numbers from a scanner transaction.
 */
function extractScannedAccounts(tx: FinancialScannerTransaction): ScannedAccountDetails {
    let source: string | null = null;
    let destination: string | null = null;

    // 1. Direct accounts array
    if (Array.isArray(tx.accounts) && tx.accounts.length > 0) {
        for (const entry of tx.accounts) {
            if (!entry || !entry.account) continue;
            const t = (entry.type || "").toLowerCase().trim();
            if (t.startsWith("orig") || t.startsWith("sourc") || t.includes("salid") || t.includes("desde")) {
                if (!source) source = entry.account;
            } else if (t.startsWith("dest") || t.startsWith("targ") || t.includes("entrad") || t.includes("hacia") || t.includes("para")) {
                if (!destination) destination = entry.account;
            } else {
                if (!source) source = entry.account;
                else if (!destination) destination = entry.account;
            }
        }
    }

    // 2. Fallback to originStats if missing
    if (!source || !destination) {
        const stats = tx.originStats as Record<string, unknown> | null | undefined;
        if (stats) {
            if (!source) {
                const s = stats.sourceAccount || stats.accountSource || stats.originAccount || stats.cuentaOrigen || stats.cuenta_origen;
                if (typeof s === "string" && s.trim() !== "") source = s.trim();
            }
            if (!destination) {
                const d = stats.destinationAccount || stats.accountDestination || stats.targetAccount || stats.cuentaDestino || stats.cuenta_destino;
                if (typeof d === "string" && d.trim() !== "") destination = d.trim();
            }
            if ((!source || !destination) && Array.isArray(stats.accounts)) {
                for (const entry of stats.accounts) {
                    if (!entry || typeof entry !== "object") continue;
                    const acc = (entry as { account?: string; type?: string }).account;
                    const typeStr = ((entry as { account?: string; type?: string }).type || "").toLowerCase();
                    if (!acc) continue;
                    if (typeStr.startsWith("orig") || typeStr.startsWith("sourc")) {
                        if (!source) source = acc;
                    } else if (typeStr.startsWith("dest") || typeStr.startsWith("targ")) {
                        if (!destination) destination = acc;
                    }
                }
            }
        }
    }

    return { source, destination };
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

                                const categoryVisual = getCategoryVisualConfig(tx.category, tx.type);
                                const CategoryIcon = categoryVisual.icon;
                                const isPaidWithCredit = isTransactionPaidWithCredit(tx);
                                const accounts = extractScannedAccounts(tx);

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
                                            "group relative overflow-hidden rounded-[1.5rem] border-border/60 bg-bg-secondary/90 py-0 shadow-sm shadow-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
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

                                        <CardHeader className="flex flex-col !space-y-0 !p-4 sm:!p-5 select-none bg-bg-secondary/50 transition-colors">
                                            {/* TOP SECTION: Avatar Icon + Content Block */}
                                            <div className="flex items-start gap-3.5 w-full">
                                                {/* Left: Circular Glowing Avatar */}
                                                <div className="relative shrink-0 mt-0.5">
                                                    <div
                                                        className={cn(
                                                            "flex items-center justify-center rounded-full w-12 h-12 sm:w-13 sm:h-13 border transition-transform duration-200 group-hover:scale-105",
                                                            categoryVisual.containerClass
                                                        )}
                                                    >
                                                        <CategoryIcon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.2} />
                                                    </div>
                                                    {isPaidWithCredit && (
                                                        <span
                                                            className="absolute -top-1 -right-1 z-10 flex items-center gap-0.5 rounded-full border border-bg-secondary bg-amber-500 px-1 py-0.5 text-[8px] font-bold leading-none text-white shadow-sm shadow-black/20"
                                                            title="Pagado con tarjeta de crédito"
                                                        >
                                                            <CreditCard className="h-2 w-2" /> TC
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Right: Category, Amount, Title, Institution, Accounts */}
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    {/* Top Row: Category pill badge + Amount */}
                                                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span
                                                                className="inline-flex h-5 max-w-[150px] sm:max-w-[180px] items-center gap-1.5 rounded-md border border-[#FFB020]/25 bg-[#FFB020]/10 px-2 text-[11px] font-medium leading-none tracking-wide text-[#FFB020]"
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

                                                        {/* Amount */}
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {isOpening && (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-primary" />
                                                            )}
                                                            <span
                                                                className={cn(
                                                                    "text-[15px] sm:text-base font-semibold tracking-tight whitespace-nowrap",
                                                                    isIncome
                                                                        ? "text-[#2EE59D]"
                                                                        : isExpense
                                                                        ? "text-[#FF5252]"
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

                                                    {/* Title */}
                                                    <CardTitle
                                                        className="text-sm sm:text-[15px] tracking-tight font-semibold line-clamp-2 leading-tight w-full mt-1.5 group-hover:text-accent-primary transition-colors text-foreground"
                                                        title={tx.description || "Transacción"}
                                                    >
                                                        {tx.description || "Transacción"}
                                                    </CardTitle>

                                                    {/* Institution / Merchant */}
                                                    <div className="flex items-center min-w-0 w-full text-xs text-zinc-400 mt-0.5">
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

                                                    {/* Origin and Destination Accounts (Omitted if none) */}
                                                    {(accounts.source || accounts.destination) && (
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                            {accounts.source && (
                                                                <div
                                                                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/5 px-1.5 py-0.5 text-[10.5px] text-zinc-300"
                                                                    title={`Cuenta origen: ${accounts.source}`}
                                                                >
                                                                    <ArrowUpRight className="h-3 w-3 text-rose-400 shrink-0" />
                                                                    <span className="text-[9.5px] uppercase font-semibold text-rose-400/80">Origen:</span>
                                                                    <span className="font-mono text-zinc-200 font-medium truncate max-w-[120px] sm:max-w-[160px]">
                                                                        {accounts.source}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {accounts.destination && (
                                                                <div
                                                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[10.5px] text-zinc-300"
                                                                    title={`Cuenta destino: ${accounts.destination}`}
                                                                >
                                                                    <ArrowDownLeft className="h-3 w-3 text-emerald-400 shrink-0" />
                                                                    <span className="text-[9.5px] uppercase font-semibold text-emerald-400/80">Destino:</span>
                                                                    <span className="font-mono text-zinc-200 font-medium truncate max-w-[120px] sm:max-w-[160px]">
                                                                        {accounts.destination}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* BOTTOM BAR: Time & Quick Actions (Discard & Confirm) */}
                                            <div className="flex w-full items-center justify-between pt-3 mt-3 border-t border-border/40 gap-3">
                                                {/* Time */}
                                                <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
                                                    <Clock className="h-3.5 w-3.5 opacity-70" />
                                                    <span>
                                                        {tx.date
                                                            ? formatTime(tx.date)
                                                            : tx.createdAt
                                                            ? formatTime(tx.createdAt)
                                                            : "--:--"}
                                                    </span>
                                                </div>

                                                {/* Actions */}
                                                <div
                                                    className="flex items-center gap-2 shrink-0"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {/* Discard Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDismiss(tx.id!)}
                                                        disabled={isProcessing}
                                                        title="Descartar"
                                                        className="flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-[#2D161C] border border-rose-500/20 text-rose-400 hover:bg-rose-950/80 hover:text-rose-300 hover:border-rose-500/40 active:scale-95 transition-all shadow-sm"
                                                    >
                                                        {isDismissing ? (
                                                            <Loader2 className="h-4 w-4 animate-spin text-rose-400" />
                                                        ) : (
                                                            <X className="h-4 w-4 stroke-[2.5]" />
                                                        )}
                                                    </button>

                                                    {/* Confirm Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleConfirm(tx)}
                                                        disabled={isProcessing}
                                                        title="Confirmar"
                                                        className="flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-[#112922] border border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/80 hover:text-emerald-300 hover:border-emerald-500/40 active:scale-95 transition-all shadow-sm"
                                                    >
                                                        {isConfirming ? (
                                                            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                                                        ) : (
                                                            <Check className="h-4 w-4 stroke-[2.5]" />
                                                        )}
                                                    </button>
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

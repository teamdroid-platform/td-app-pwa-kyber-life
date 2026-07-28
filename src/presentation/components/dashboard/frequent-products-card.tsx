"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useChartTooltipDismiss } from "@/hooks/use-chart-tooltip-dismiss";
import { Package, ChevronDown, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RobotLoader } from "@/components/ui/RobotLoader";
import { getAllProductsPriceHistories } from "@/app/dashboard/actions";
import type { MarketProduct } from "./hooks/useHomeDashboard";

interface FrequentProductsCardProps {
    products: MarketProduct[];
    /** Optional header control (e.g. a Top 5/10 select). */
    headerAction?: React.ReactNode;
    className?: string;
}

type PricePoint = { date: string; price: number };
type Histories = Record<string, { date: string; price: number; supermarketId: string | null }[]>;

const currency = (n: number) =>
    `$${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
}

function ProductRow({
    product,
    history,
    loading,
    expanded,
    onToggle,
}: {
    product: MarketProduct;
    history: PricePoint[];
    loading: boolean;
    expanded: boolean;
    onToggle: () => void;
}) {
    // On touch there is no "mouse leave" to close the tooltip, so make it dismissable.
    const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss();

    const avgPrice = history.length > 0
        ? history.reduce((sum, p) => sum + p.price, 0) / history.length
        : null;

    // Most recent purchases first for the "Últimas compras" list.
    const recent = useMemo(() => [...history].reverse().slice(0, 4), [history]);

    // Price trend vs previous observation.
    const delta = useMemo(() => {
        if (history.length < 2) return null;
        const last = history[history.length - 1].price;
        const prev = history[history.length - 2].price;
        if (prev === 0) return null;
        return ((last - prev) / prev) * 100;
    }, [history]);

    return (
        <div ref={containerRef} onPointerDown={handlePointerDown} className="overflow-hidden border-b border-border-base last:border-b-0">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors sm:px-4",
                    expanded ? "bg-bg-secondary/60" : "hover:bg-bg-secondary/40",
                )}
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-violet/10 text-accent-violet">
                    <Package className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{product.name}</p>
                    <p className="text-xs text-text-tertiary">
                        {avgPrice !== null ? `Prom. ${currency(avgPrice)}` : "Sin histórico de precio"}
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-text-primary">{currency(product.value)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Gasto total</p>
                </div>
                <ChevronDown
                    className={cn(
                        "h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-300",
                        expanded && "rotate-180",
                    )}
                />
            </button>

            {expanded && (
                <div className="grid grid-cols-1 gap-4 border-t border-border-base bg-bg-secondary/30 px-3 py-4 sm:grid-cols-2 sm:px-4">
                    {/* Últimas compras */}
                    <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                            Últimas compras
                        </p>
                        {loading ? (
                            <div className="flex items-center gap-2 text-xs text-text-tertiary">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
                            </div>
                        ) : recent.length === 0 ? (
                            <p className="text-xs text-text-tertiary">Sin registros de compra.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {recent.map((p, i) => (
                                    <li key={`${p.date}-${i}`} className="flex items-center justify-between gap-3 text-xs">
                                        <span className="text-text-secondary">{formatDate(p.date)}</span>
                                        <span className="font-semibold tabular-nums text-text-primary">{currency(p.price)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Tendencia de precio */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                                Tendencia de precio
                            </p>
                            {delta !== null && (
                                <span className={cn(
                                    "flex items-center gap-0.5 text-[11px] font-bold",
                                    delta > 0 ? "text-accent-danger" : "text-accent-success",
                                )}>
                                    {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                                </span>
                            )}
                        </div>
                        {loading ? (
                            <div className="flex h-[70px] items-center gap-2 text-xs text-text-tertiary">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
                            </div>
                        ) : history.length < 2 ? (
                            <p className="flex h-[70px] items-center text-xs text-text-tertiary">Datos insuficientes.</p>
                        ) : (
                            <div className="h-[70px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={history} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                                        <YAxis hide domain={["dataMin", "dataMax"]} />
                                        <Tooltip
                                            active={tooltipActive}
                                            contentStyle={{
                                                backgroundColor: "var(--bg-secondary)",
                                                borderRadius: "10px",
                                                border: "1px solid var(--border-base)",
                                                fontSize: "12px",
                                                padding: "4px 8px",
                                            }}
                                            labelFormatter={(l) => formatDate(String(l))}
                                            formatter={(v: number | undefined) => [currency(Number(v ?? 0)), "Precio"]}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="price"
                                            stroke="#8b5cf6"
                                            strokeWidth={2}
                                            dot={{ r: 2, fill: "#8b5cf6" }}
                                            activeDot={{ r: 4 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function FrequentProductsCard({ products, headerAction, className }: FrequentProductsCardProps) {
    const [histories, setHistories] = useState<Histories>({});
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        getAllProductsPriceHistories()
            .then((res) => {
                if (active) setHistories(res as Histories);
            })
            .catch((err) => console.error("[FrequentProductsCard]", err))
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    return (
        <Card className={cn("flex flex-col h-full min-h-[320px] sm:min-h-[280px] bg-bg-primary border-border/40 shadow-sm overflow-hidden", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-tertiary/60">
                            <Package className="h-4 w-4 text-accent-violet" />
                        </span>
                        <div>
                            <CardTitle className="text-lg">Productos frecuentes</CardTitle>
                        </div>
                    </div>
                    {headerAction && <div className="shrink-0">{headerAction}</div>}
                </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col h-0">
                {products.length === 0 ? (
                    <div className="flex-1 min-h-[300px] flex items-center justify-center px-4 text-center text-sm text-text-tertiary">
                        <RobotLoader text="Sin datos" showDots={false} size={64} />
                    </div>
                ) : (
                    <div className="h-full overflow-y-auto divide-y divide-border-base [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border/50 [&::-webkit-scrollbar-thumb]:rounded-full">
                        {products.map((product) => {
                            const history = (histories[product.id] ?? [])
                                .map((h) => ({ date: h.date, price: h.price }))
                                .filter((h) => h.price > 0)
                                .sort((a, b) => a.date.localeCompare(b.date));
                            return (
                                <ProductRow
                                    key={product.id}
                                    product={product}
                                    history={history}
                                    loading={loading}
                                    expanded={expandedId === product.id}
                                    onToggle={() =>
                                        setExpandedId((cur) => (cur === product.id ? null : product.id))
                                    }
                                />
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

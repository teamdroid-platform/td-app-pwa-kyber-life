"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPriceAnalyticsAction, getGenericPriceAnalyticsAction } from "@/app/actions/analytics";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartTooltipDismiss } from "@/hooks/use-chart-tooltip-dismiss";
import { Search, Tag, Package, Loader2, ChevronDown, X, TrendingUp, Store } from "lucide-react";
import { BrandProduct, GenericItem } from "@/domain/entities";
import { cn } from "@/lib/utils";

interface PriceAnalyticsProps {
    searchableProducts: BrandProduct[];
    searchableGenericItems: GenericItem[];
}

type SearchMode = "generic" | "specific";

interface AnalyticsData {
    history: Array<{ date: string; price: number }>;
    latest: Array<{ supermarketId: string; price: number; date: string }>;
}

export function PriceAnalytics({ searchableProducts, searchableGenericItems }: PriceAnalyticsProps) {
    // On touch there is no "mouse leave" to close the tooltip, so make it dismissable.
    const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss();

    const [mode, setMode] = useState<SearchMode>("generic");
    const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; subtitle?: string } | null>(null);
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [initialLoaded, setInitialLoaded] = useState(false);

    // Search dropdown state
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const sortedGenericItems = useMemo(
        () => [...searchableGenericItems].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)),
        [searchableGenericItems]
    );

    const sortedBrandProducts = useMemo(
        () => [...searchableProducts].sort((a, b) => a.brand.localeCompare(b.brand)),
        [searchableProducts]
    );

    const fetchAnalytics = useCallback(async (itemId: string, itemMode: SearchMode) => {
        setLoading(true);
        setAnalyticsData(null);

        const res = itemMode === "specific"
            ? await getPriceAnalyticsAction(itemId)
            : await getGenericPriceAnalyticsAction(itemId);

        if (res.success && res.data) {
            setAnalyticsData(res.data as AnalyticsData);
        }
        setLoading(false);
    }, []);

    // Auto-load first generic item on mount
    useEffect(() => {
        if (initialLoaded || sortedGenericItems.length === 0) return;
        setInitialLoaded(true);

        const first = sortedGenericItems[0];
        const item = { id: first.id, name: first.canonicalName, subtitle: "Genérico" };
        setSelectedItem(item);
        fetchAnalytics(first.id, "generic");
    }, [sortedGenericItems, initialLoaded, fetchAnalytics]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setSearchOpen(false);
                setSearchTerm("");
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = useCallback(async (item: { id: string; name: string; subtitle?: string }) => {
        setSelectedItem(item);
        setSearchOpen(false);
        setSearchTerm("");
        await fetchAnalytics(item.id, mode);
    }, [mode, fetchAnalytics]);

    const handleModeChange = useCallback((newMode: SearchMode) => {
        setMode(newMode);
        setSelectedItem(null);
        setAnalyticsData(null);
        setSearchTerm("");
    }, []);

    // Build the filtered items list based on search term
    const searchItems = useMemo(() => {
        if (mode === "generic") {
            return sortedGenericItems.map(i => ({
                id: i.id,
                name: i.canonicalName,
                subtitle: "Genérico",
            }));
        }
        return sortedBrandProducts.map(p => ({
            id: p.id,
            name: p.brand,
            subtitle: p.presentation ?? undefined,
        }));
    }, [mode, sortedGenericItems, sortedBrandProducts]);

    const filteredItems = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        if (!term) return searchItems;
        return searchItems.filter(item =>
            item.name.toLowerCase().includes(term) ||
            (item.subtitle && item.subtitle.toLowerCase().includes(term))
        );
    }, [searchItems, searchTerm]);

    const selectedLabel = selectedItem?.name ?? (mode === "generic" ? "Selecciona un genérico..." : "Selecciona una marca...");

    // Compute stats from analytics data
    const priceStats = useMemo(() => {
        if (!analyticsData) return null;
        const { history, latest } = analyticsData;
        if (history.length === 0 && latest.length === 0) return null;

        const avg = history.length > 0
            ? (history.reduce((sum, h) => sum + h.price, 0) / history.length)
            : 0;

        const allPrices = history.length > 0
            ? history.map(h => h.price)
            : latest.map(l => l.price);

        const min = allPrices.length > 0 ? Math.min(...allPrices) : 0;
        const max = allPrices.length > 0 ? Math.max(...allPrices) : 0;

        return { avg, min, max, observations: history.length };
    }, [analyticsData]);

    return (
        <Card ref={containerRef} onPointerDown={handlePointerDown} className="bg-bg-primary rounded-3xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-border-base h-full flex flex-col">
            <CardContent className="pt-6 space-y-3 flex-1 flex flex-col">
                <div>
                    <CardTitle className="text-lg font-bold text-text-primary">Análisis de Precios</CardTitle>
                    <CardDescription className="text-sm text-text-tertiary">
                        Busca un producto y compara precios entre supermercados
                    </CardDescription>
                </div>

                {/* Mode tabs */}
                <div className="flex gap-1 p-1 bg-bg-secondary/50 rounded-lg w-full">
                    <button
                        type="button"
                        onClick={() => handleModeChange("generic")}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all font-medium",
                            mode === "generic"
                                ? "bg-bg-primary text-text-primary shadow-sm"
                                : "text-text-tertiary hover:text-text-secondary"
                        )}
                    >
                        <Tag className="w-3.5 h-3.5" /> Genéricos
                    </button>
                    <button
                        type="button"
                        onClick={() => handleModeChange("specific")}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all font-medium",
                            mode === "specific"
                                ? "bg-bg-primary text-text-primary shadow-sm"
                                : "text-text-tertiary hover:text-text-secondary"
                        )}
                    >
                        <Package className="w-3.5 h-3.5" /> Marcas
                    </button>
                </div>
                {/* Searchable dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => {
                            setSearchOpen(prev => !prev);
                            if (!searchOpen) {
                                setTimeout(() => inputRef.current?.focus(), 50);
                            } else {
                                setSearchTerm("");
                            }
                        }}
                        className="w-full flex items-center justify-between text-sm h-10 px-3 rounded-xl border border-border-base bg-bg-secondary/50 hover:bg-bg-secondary/80 text-text-primary transition-colors"
                    >
                        <div className="flex items-center gap-2 truncate">
                            <Search className="h-4 w-4 text-text-tertiary shrink-0" />
                            <span className={cn("truncate", !selectedItem && "text-text-tertiary")}>
                                {selectedLabel}
                            </span>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", searchOpen && "rotate-180")} />
                    </button>

                    {searchOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-border-base bg-bg-secondary shadow-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-base">
                                <Search className="h-4 w-4 text-text-tertiary shrink-0" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder={mode === "generic" ? "Buscar genérico (ej. Arroz)..." : "Buscar marca (ej. San Fernando)..."}
                                    className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
                                />
                                {searchTerm && (
                                    <button type="button" onClick={() => setSearchTerm("")} className="text-text-tertiary hover:text-text-primary">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                            <ul className="max-h-[240px] overflow-y-auto py-1">
                                {filteredItems.length === 0 ? (
                                    <li className="text-sm text-text-tertiary text-center py-4">
                                        No se encontraron resultados.
                                    </li>
                                ) : (
                                    filteredItems.map(item => (
                                        <li key={item.id}>
                                            <button
                                                type="button"
                                                onClick={() => handleSelect(item)}
                                                className={cn(
                                                    "w-full text-left text-sm px-3 py-2.5 hover:bg-bg-primary transition-colors cursor-pointer flex items-center justify-between",
                                                    selectedItem?.id === item.id && "text-brand-primary font-semibold"
                                                )}
                                            >
                                                <span className="truncate">{item.name}</span>
                                                {item.subtitle && item.subtitle !== "Genérico" && (
                                                    <span className="text-xs text-text-tertiary ml-2 shrink-0">{item.subtitle}</span>
                                                )}
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Loading state */}
                {loading && (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <div className="flex items-center gap-2 text-text-tertiary">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Cargando datos...</span>
                        </div>
                    </div>
                )}

                {/* Results */}
                {!loading && analyticsData && selectedItem && (
                    <div className="space-y-4 flex-1 flex flex-col animate-in fade-in duration-300">

                        {/* Quick stats bar */}
                        {priceStats && (
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-bg-secondary/50 rounded-xl p-3 text-center border border-border-base">
                                    <p className="text-xs text-text-tertiary mb-0.5">Promedio</p>
                                    <p className="text-base font-bold text-text-primary">${priceStats.avg.toFixed(2)}</p>
                                </div>
                                <div className="bg-bg-secondary/50 rounded-xl p-3 text-center border border-border-base">
                                    <p className="text-xs text-text-tertiary mb-0.5">Más bajo</p>
                                    <p className="text-base font-bold text-emerald-400">${priceStats.min.toFixed(2)}</p>
                                </div>
                                <div className="bg-bg-secondary/50 rounded-xl p-3 text-center border border-border-base">
                                    <p className="text-xs text-text-tertiary mb-0.5">Más alto</p>
                                    <p className="text-base font-bold text-rose-400">${priceStats.max.toFixed(2)}</p>
                                </div>
                            </div>
                        )}

                        {/* Latest prices by supermarket */}
                        {analyticsData.latest.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-text-tertiary mb-2 uppercase tracking-wider flex items-center gap-1.5">
                                    <Store className="w-3.5 h-3.5" />
                                    {mode === "generic" ? "Mejor precio por supermercado" : "Último precio por supermercado"}
                                </h4>
                                <div className="space-y-1.5">
                                    {analyticsData.latest.map((item, idx) => (
                                        <div
                                            key={`${item.supermarketId}-${idx}`}
                                            className="flex justify-between items-center p-2.5 bg-bg-secondary/30 rounded-lg border border-border-base"
                                        >
                                            <span className="text-sm text-text-secondary truncate">{item.supermarketId}</span>
                                            <div className="text-right shrink-0 ml-2">
                                                <span className="text-sm font-bold text-accent-primary">${item.price.toFixed(2)}</span>
                                                <span className="text-[10px] text-text-tertiary ml-1.5">
                                                    {new Date(item.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* History chart */}
                        {analyticsData.history.length > 0 && (
                            <div className="flex-1 min-h-0">
                                <h4 className="text-xs font-semibold text-text-tertiary mb-2 uppercase tracking-wider flex items-center gap-1.5">
                                    <TrendingUp className="w-3.5 h-3.5" />
                                    Evolución de precio
                                </h4>
                                <div className="h-[250px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={analyticsData.history} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-base)" opacity={0.5} />
                                            <XAxis
                                                dataKey="date"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                                                dy={10}
                                                tickFormatter={(val) => {
                                                    const d = new Date(val);
                                                    return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
                                                }}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                                                tickFormatter={(val) => `$${val}`}
                                                domain={[0, 'auto']}
                                            />
                                            <Tooltip
                                                active={tooltipActive}
                                                contentStyle={{
                                                    backgroundColor: 'var(--bg-secondary)',
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                                }}
                                                labelFormatter={(val) => new Date(val).toLocaleDateString('es-ES')}
                                                formatter={(value: any) => [`$${Number(value || 0).toFixed(2)}`, "Precio"]}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="price"
                                                stroke="#8b5cf6"
                                                strokeWidth={2.5}
                                                dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                                                activeDot={{ r: 5, fill: '#8b5cf6' }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {analyticsData.history.length === 0 && analyticsData.latest.length === 0 && (
                            <div className="flex-1 flex items-center justify-center py-8">
                                <p className="text-sm text-text-tertiary">Sin datos de precios para este producto.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Empty state – only if nothing is selected and not loading */}
                {!loading && !selectedItem && (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <div className="text-center space-y-2">
                            <Search className="h-8 w-8 text-text-tertiary/30 mx-auto" />
                            <p className="text-sm text-text-tertiary">
                                Busca un {mode === "generic" ? "producto genérico" : "producto de marca"} para ver su análisis de precios.
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

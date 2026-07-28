"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useChartTooltipDismiss } from "@/hooks/use-chart-tooltip-dismiss";
import { Loader2, Search, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllProductsPriceHistories } from "@/app/dashboard/actions";

interface PriceHistoryCardProps {
    initialProducts: { id: string; name: string }[];
}

export function PriceHistoryCard({ initialProducts }: PriceHistoryCardProps) {
    // On touch there is no "mouse leave" to close the tooltip, so make it dismissable.
    const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss();

    const [selectedProduct, setSelectedProduct] = useState<string>("all");
    const [allData, setAllData] = useState<Record<string, { date: string, price: number }[]>>({});
    const [loading, setLoading] = useState(false);

    const [searchOpen, setSearchOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setLoading(true);
        getAllProductsPriceHistories()
            .then(res => setAllData(res))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

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

    const handleSelect = useCallback((productId: string) => {
        setSelectedProduct(productId);
        setSearchOpen(false);
        setSearchTerm("");
    }, []);

    const chartData = useMemo(() => {
        const dateSet = new Set<string>();
        Object.values(allData).forEach(history => {
            history.forEach(point => dateSet.add(point.date.slice(0, 10)));
        });
        const sortedDates = Array.from(dateSet).sort();

        return sortedDates.map(date => {
            const entry: Record<string, string | number> = { date };
            Object.entries(allData).forEach(([productId, history]) => {
                const point = history.find(p => p.date.startsWith(date));
                if (point) {
                    entry[productId] = point.price;
                }
            });
            return entry;
        });
    }, [allData]);

    const stats = useMemo(() => {
        if (selectedProduct === "all") {
            let totalSum = 0;
            let totalCount = 0;
            let latestSum = 0;
            let latestCount = 0;

            Object.values(allData).forEach(history => {
                if (history.length > 0) {
                    const sum = history.reduce((a, b) => a + b.price, 0);
                    totalSum += sum;
                    totalCount += history.length;
                    latestSum += history[history.length - 1].price;
                    latestCount++;
                }
            });

            return {
                promedio: totalCount > 0 ? (totalSum / totalCount).toFixed(2) : "0.00",
                actual: latestCount > 0 ? (latestSum / latestCount).toFixed(2) : "0.00",
                observations: totalCount
            };
        } else {
            const history = allData[selectedProduct] || [];
            return {
                promedio: history.length > 0 ? (history.reduce((a, b) => a + b.price, 0) / history.length).toFixed(2) : "0.00",
                actual: history.length > 0 ? history[history.length - 1].price.toFixed(2) : "0.00",
                observations: history.length
            };
        }
    }, [allData, selectedProduct]);

    const sortedProducts = useMemo(
        () => [...initialProducts].sort((a, b) => a.name.localeCompare(b.name)),
        [initialProducts]
    );

    const filteredProducts = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        if (!term) return sortedProducts;
        return sortedProducts.filter(p => p.name.toLowerCase().includes(term));
    }, [sortedProducts, searchTerm]);

    const selectedLabel = selectedProduct === "all"
        ? "Todos los productos"
        : sortedProducts.find(p => p.id === selectedProduct)?.name ?? "Todos los productos";

    return (
        <div ref={containerRef} onPointerDown={handlePointerDown} className="bg-bg-primary rounded-3xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-border-base h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="mb-3">
                <h3 className="text-lg font-bold text-text-primary">Histórico Precios</h3>
                <p className="text-xs text-text-tertiary flex items-center gap-2 mt-1">
                    {loading && <Loader2 size={12} className="animate-spin" />}
                    {stats.observations} Observaciones
                </p>
            </div>

            {/* Searchable product selector */}
            <div className="relative mb-4" ref={dropdownRef}>
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
                    className="w-full flex items-center justify-between text-xs h-9 px-3 rounded-lg border border-border-base bg-bg-secondary/50 hover:bg-bg-secondary/80 text-text-primary transition-colors"
                >
                    <span className="truncate">{selectedLabel}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-50 transition-transform", searchOpen && "rotate-180")} />
                </button>

                {searchOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-border-base bg-bg-secondary shadow-lg overflow-hidden">
                        {/* Search input */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-base">
                            <Search className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Buscar producto..."
                                className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm("")}
                                    className="text-text-tertiary hover:text-text-primary"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        {/* Options list */}
                        <ul className="max-h-[200px] overflow-y-auto py-1">
                            {/* "Todos" option – only visible when not filtering */}
                            {!searchTerm.trim() && (
                                <li>
                                    <button
                                        type="button"
                                        onClick={() => handleSelect("all")}
                                        className={cn(
                                            "w-full text-left text-xs px-3 py-2 hover:bg-bg-primary transition-colors cursor-pointer",
                                            selectedProduct === "all" && "text-brand-primary font-semibold"
                                        )}
                                    >
                                        Todos los productos
                                    </button>
                                </li>
                            )}

                            {filteredProducts.length === 0 ? (
                                <li className="text-xs text-text-tertiary text-center py-4">
                                    No se encontraron productos.
                                </li>
                            ) : (
                                filteredProducts.map(product => (
                                    <li key={product.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(product.id)}
                                            className={cn(
                                                "w-full text-left text-xs px-3 py-2 hover:bg-bg-primary transition-colors cursor-pointer",
                                                selectedProduct === product.id && "text-brand-primary font-semibold"
                                            )}
                                        >
                                            {product.name}
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}
            </div>

            {/* Chart */}
            <div className="flex-1 w-full min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-base)" opacity={0.5} />
                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                            dy={10}
                            tickFormatter={(val) => {
                                const d = new Date(val);
                                return d.toLocaleDateString('es-ES', { month: '2-digit', day: '2-digit' });
                            }}
                        />
                        <YAxis
                            domain={[0, 'auto']}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                            tickFormatter={(val) => `$${val}`}
                        />
                        <Tooltip
                            active={tooltipActive}
                            contentStyle={{
                                backgroundColor: 'var(--bg-secondary)',
                                borderRadius: '12px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }}
                            itemStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
                            formatter={(value: any, name: any) => {
                                const product = initialProducts.find(p => p.id === name);
                                return [`$${Number(value || 0).toFixed(2)}`, product ? product.name : name];
                            }}
                            labelFormatter={(label) => new Date(label).toLocaleDateString('es-ES')}
                        />
                        {initialProducts.map(product => {
                            const isSelected = selectedProduct === product.id;
                            const isAll = selectedProduct === "all";
                            const strokeColor = isSelected ? "#8b5cf6" : "var(--text-tertiary)";
                            const opacity = isSelected ? 1 : (isAll ? 0.3 : 0.05);
                            return (
                                <Line
                                    key={product.id}
                                    type="monotone"
                                    dataKey={product.id}
                                    stroke={strokeColor}
                                    strokeWidth={isSelected ? 3 : 1}
                                    dot={isSelected ? { r: 4, fill: "#8b5cf6", strokeWidth: 0 } : false}
                                    activeDot={{ r: 4 }}
                                    connectNulls={true}
                                    strokeOpacity={opacity}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Footer stats – only when a specific product is selected */}
            {selectedProduct !== "all" && (
                <div className="pt-4 mt-2 border-t border-border-base grid grid-cols-2 gap-4 min-w-0">
                    <div className="text-center min-w-0">
                        <p className="text-xs text-text-tertiary -mb-1">Promedio</p>
                        <p className="text-base font-bold text-text-primary truncate">
                            ${stats.promedio}
                        </p>
                    </div>
                    <div className="text-center border-l border-border-base min-w-0">
                        <p className="text-xs text-text-tertiary -mb-1">Actual</p>
                        <p className="text-base font-bold text-accent-primary truncate">
                            ${stats.actual}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

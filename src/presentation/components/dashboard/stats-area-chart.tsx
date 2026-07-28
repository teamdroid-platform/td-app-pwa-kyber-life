"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartTooltipDismiss } from "@/hooks/use-chart-tooltip-dismiss";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

interface StatsAreaChartProps {
    data: { month: string; total: number }[];
}

export function StatsAreaChart({ data }: StatsAreaChartProps) {
    // On touch there is no "mouse leave" to close the tooltip, so make it dismissable.
    const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss();

    return (
        <div ref={containerRef} onPointerDown={handlePointerDown} className="bg-bg-primary rounded-3xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-border-base h-full flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h3 className="text-lg font-bold text-text-primary">Estadísticas</h3>
                    <p className="text-xs text-text-tertiary">Resumen de actividad mensual</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="bg-bg-secondary rounded-lg p-1 flex items-center">
                        <Button variant="ghost" size="sm" className="h-7 text-xs font-semibold bg-bg-primary shadow-sm text-text-primary rounded-md">
                            Resumen
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs font-medium text-text-tertiary hover:text-text-primary">
                            Ventas
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs font-medium text-text-tertiary hover:text-text-primary">
                            Ingresos
                        </Button>
                    </div>

                    <Button variant="outline" size="sm" className="h-8 text-xs gap-2 rounded-lg border-border-base text-text-secondary">
                        <Calendar size={14} />
                        Este Año
                    </Button>
                </div>
            </div>

            <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorTotalArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#5b4dff" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#5b4dff" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-base)" opacity={0.5} />
                        <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                            dy={10}
                            tickFormatter={(val) => {
                                const [y, m] = val.split('-');
                                const date = new Date(parseInt(y), parseInt(m) - 1, 1);
                                const month = date.toLocaleDateString('es-ES', { month: 'long' });
                                return month.charAt(0).toUpperCase() + month.slice(1);
                            }}
                        />
                        <YAxis
                            domain={[0, 'auto']}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
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
                            formatter={(value: any) => [`$${value.toFixed(2)}`, 'Gasto']}
                        />
                        <Area
                            type="monotone"
                            dataKey="total"
                            stroke="#5b4dff"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorTotalArea)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

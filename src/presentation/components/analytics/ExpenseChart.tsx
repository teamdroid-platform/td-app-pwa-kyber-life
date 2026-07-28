"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartTooltipDismiss } from "@/hooks/use-chart-tooltip-dismiss";

interface ExpenseChartProps {
    data: { month: string; total: number }[];
}

export function ExpenseChart({ data }: ExpenseChartProps) {
    // On touch there is no "mouse leave" to close the tooltip, so make it dismissable.
    const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss();

    return (
        <div ref={containerRef} onPointerDown={handlePointerDown} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                    <XAxis
                        dataKey="month"
                        stroke="var(--text-secondary)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        domain={[0, 'auto']}
                        stroke="var(--text-secondary)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                        active={tooltipActive}
                        contentStyle={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-base)',
                            color: 'var(--text-primary)'
                        }}
                        itemStyle={{ color: 'var(--accent-primary)' }}
                        formatter={(value: number | string | undefined) => [`$${Number(value ?? 0).toFixed(2)}`, "Total"]}
                    />
                    <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#D4AF37"
                        fillOpacity={1}
                        fill="url(#colorTotal)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

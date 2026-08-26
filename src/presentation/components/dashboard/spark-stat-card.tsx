import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact inline SVG sparkline. Renders a smoothed area under a stroked line. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
    const width = 120;
    const height = 26;
    const id = `spark-${color.replace("#", "")}`;

    if (points.length === 0) {
        return <div className="h-6 w-full sm:h-10" aria-hidden="true" />;
    }

    const max = Math.max(...points, 0);
    const min = Math.min(...points, 0);
    const span = max - min || 1;
    const step = points.length > 1 ? width / (points.length - 1) : width;

    const coords = points.map((p, i) => {
        const x = points.length > 1 ? i * step : width / 2;
        const y = height - 2 - ((p - min) / span) * (height - 4);
        return [x, y] as const;
    });

    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-6 w-full sm:h-10"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export interface SparkStatCardProps {
    label: string;
    value: string;
    icon: LucideIcon;
    /** Sparkline stroke color (hex). */
    color: string;
    /** Per-type top tint that fades into the dark card base. */
    tintClassName: string;
    /** Per-type icon badge (solid tinted square). */
    badgeClassName: string;
    points: number[];
    /** When set, the card is tappable — shows a chevron affordance and opens on click. */
    onClick?: () => void;
}

/**
 * Tinted KPI card with a sparkline, shared by the financial "Resumen rápido" and
 * the main dashboard's "Resumen financiero". A per-type color tint fades into the
 * dark card base; when `onClick` is provided a chevron affordance marks it tappable.
 * Scales its type/spacing up on larger screens.
 */
export function SparkStatCard({ label, value, icon: Icon, color, tintClassName, badgeClassName, points, onClick }: SparkStatCardProps) {
    return (
        <div
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
            className={cn(
                "flex min-w-0 flex-col gap-2 rounded-xl border border-border-base p-2 shadow-sm sm:gap-2.5 sm:rounded-2xl sm:p-4 bg-white/90 dark:border-white/10 dark:bg-[#0b0e17]",
                "bg-gradient-to-b via-30% to-transparent to-70%",
                tintClassName,
                onClick && "cursor-pointer transition-transform hover:border-accent-primary/30 active:scale-[0.97]",
            )}
        >
            <div className="flex items-center justify-between gap-1">
                <p className="truncate text-[10px] font-semibold text-text-primary sm:text-sm">{label}</p>
                <div className="flex items-center gap-1">
                    {onClick && <ChevronRight aria-hidden="true" className="hidden sm:block h-3 w-3 shrink-0 text-text-tertiary/70 sm:h-3.5 sm:w-3.5" />}
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 sm:rounded-lg", badgeClassName)}>
                        <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </span>
                </div>
            </div>
            <h3 className="truncate text-sm font-bold leading-tight tracking-tight tabular-nums text-text-primary sm:text-2xl">{value}</h3>
            <div className="mt-auto">
                <Sparkline points={points} color={color} />
            </div>
        </div>
    );
}

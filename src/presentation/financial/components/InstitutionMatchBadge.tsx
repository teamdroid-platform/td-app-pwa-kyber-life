"use client";

import { BadgeCheck, BadgeAlert, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { InstitutionMatchInfo } from "@/lib/institution-match";

const LEVEL_CONFIG = {
    verified: {
        Icon: BadgeCheck,
        iconClass: "text-sky-400",
        title: "Institución identificada",
        titleClass: "text-sky-400",
    },
    warning: {
        Icon: BadgeCheck,
        iconClass: "text-[#FFB020]",
        title: "Coincidencia parcial",
        titleClass: "text-[#FFB020]",
    },
    none: {
        Icon: BadgeAlert,
        iconClass: "text-zinc-500",
        title: "Sin coincidencia",
        titleClass: "text-zinc-400",
    },
} as const;

/** Surface per level, for the expanded hint. */
const LEVEL_SURFACE = {
    verified: "border-sky-500/35 bg-sky-500/[0.07]",
    warning: "border-[#FFB020]/40 bg-[#FFB020]/[0.07]",
    none: "border-border/40 bg-bg-secondary/40",
} as const;

interface MatchDetailProps {
    info: InstitutionMatchInfo;
    /** The raw merchant the scan extracted, named when available. */
    merchant?: string | null;
}

/** The full explanation, shared by the badge's popover and the compact hint's. */
function MatchDetail({ info, merchant }: MatchDetailProps) {
    const cfg = LEVEL_CONFIG[info.level];
    const Icon = cfg.Icon;
    const pct = Math.round(info.score * 100);
    const read = merchant?.trim();

    return (
        <div className="flex items-start gap-2">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cfg.iconClass)} />
            <div className="space-y-1">
                <p className={cn("font-semibold leading-tight", cfg.titleClass)}>{cfg.title}</p>
                {info.level === "none" ? (
                    <p className="leading-snug text-muted-foreground">
                        {read
                            ? <>El escaneo leyó «{read}» y no se parece a ninguna institución guardada. Elige la correcta o crea una nueva.</>
                            : <>No se identificó coincidencia con instituciones existentes.</>}
                    </p>
                ) : (
                    <p className="leading-snug text-muted-foreground">
                        {read && <>El escaneo leyó <span className="font-medium text-foreground">«{read}»</span>. </>}
                        Coincidencia del <span className="font-medium text-foreground">{pct}%</span> con{" "}
                        <span className="font-medium text-foreground">«{info.matchedName}»</span>.
                        {info.level === "warning" && " Confirma que sea la correcta."}
                    </p>
                )}
            </div>
        </div>
    );
}

interface InstitutionMatchBadgeProps {
    info: InstitutionMatchInfo;
    /** Icon size in px. */
    size?: number;
    className?: string;
}

/**
 * A "verified"-style badge next to an institution name. Tap to reveal the match
 * confidence (percentage) and the institution it was compared against. The color
 * encodes the confidence level: verified (high), warning (partial), none.
 */
export function InstitutionMatchBadge({ info, size = 14, className }: InstitutionMatchBadgeProps) {
    const cfg = LEVEL_CONFIG[info.level];
    const Icon = cfg.Icon;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    // Don't let the tap bubble to the card (which toggles expand).
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        "inline-flex shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none",
                        cfg.iconClass,
                        className,
                    )}
                    aria-label={cfg.title}
                    title={cfg.title}
                >
                    <Icon style={{ width: size, height: size }} />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                onClick={(e) => e.stopPropagation()}
                className="w-64 rounded-xl border border-border/50 bg-bg-secondary p-3 text-sm shadow-xl shadow-black/40"
            >
                <MatchDetail info={info} />
            </PopoverContent>
        </Popover>
    );
}

interface InstitutionMatchHintProps {
    info: InstitutionMatchInfo;
    /** The raw merchant the scan extracted, so the message names what it read. */
    merchant?: string | null;
    className?: string;
}

/**
 * The match information spelled out, for a step that has room for words —
 * a lone icon there tells the user nothing.
 *
 * How much room it takes depends on what it's asking for. A high-confidence
 * match asks nothing, so it states itself in one line and keeps the detail a
 * tap away, leaving the screen to the institution grid. A partial or absent
 * match is exactly when the user should stop and look, so those keep the full
 * block with their colour and their instruction.
 */
export function InstitutionMatchHint({ info, merchant, className }: InstitutionMatchHintProps) {
    const cfg = LEVEL_CONFIG[info.level];
    const Icon = cfg.Icon;
    const pct = Math.round(info.score * 100);
    const read = merchant?.trim();

    if (info.level === "verified") {
        return (
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${cfg.title}: ${pct}%${read ? ` desde ${read}` : ""}`}
                        className={cn("flex w-full items-center gap-1.5 text-left text-xs", className)}
                    >
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", cfg.iconClass)} />
                        <span className={cn("shrink-0 font-medium", cfg.titleClass)}>Identificada</span>
                        <span className="truncate text-text-tertiary">
                            · {pct}%{read ? ` desde «${read}»` : ""}
                        </span>
                        <Info className="ml-auto h-3 w-3 shrink-0 text-text-tertiary" />
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    className="w-64 rounded-xl border border-border/50 bg-bg-secondary p-3 text-sm shadow-xl shadow-black/40"
                >
                    <MatchDetail info={info} merchant={merchant} />
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <div className={cn("flex items-start gap-2.5 rounded-xl border p-3", LEVEL_SURFACE[info.level], className)}>
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cfg.iconClass)} />
            <div className="min-w-0 space-y-0.5">
                <p className={cn("text-xs font-medium leading-tight", cfg.titleClass)}>{cfg.title}</p>
                {info.level === "none" ? (
                    <p className="text-xs leading-snug text-text-tertiary">
                        {read
                            ? <>El escaneo leyó «{read}» y no se parece a ninguna institución guardada. Elige la correcta o crea una nueva.</>
                            : <>No se identificó ninguna institución. Elige la correcta o crea una nueva.</>}
                    </p>
                ) : (
                    <p className="text-xs leading-snug text-text-tertiary">
                        {read && <>El escaneo leyó «{read}». </>}
                        Coincide un {pct}% con «{info.matchedName}».
                        {" Confirma que sea la correcta."}
                    </p>
                )}
            </div>
        </div>
    );
}

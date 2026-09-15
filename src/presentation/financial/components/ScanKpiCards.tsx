"use client";

import { useMemo } from "react";
import { Clock, Store, DollarSign, Landmark, type LucideIcon } from "lucide-react";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";
import { extractScannedAccounts } from "../lib/scan-accounts";
import { cn } from "@/lib/utils";

interface ScanKpiCardsProps {
    scans: FinancialScannerTransaction[];
}

interface Kpi {
    key: string;
    label: string;
    value: number;
    hint: string;
    icon: LucideIcon;
    iconClass: string;
}

/**
 * Las cuatro cifras de la bandeja.
 *
 * No son cuatro filtros ni cuatro estados: son cuatro lecturas del mismo
 * montón, y cada una dice qué tanto trabajo dejó hecho el escáner. "Con
 * cuentas" es la que más pesa al aprobar — un escaneo sin cuenta identificada
 * queda a medias por mucho que traiga comercio e importe.
 */
export function ScanKpiCards({ scans }: ScanKpiCardsProps) {
    const kpis: Kpi[] = useMemo(() => {
        const withAccounts = scans.filter((scan) => {
            const { source, destination } = extractScannedAccounts(scan);
            return Boolean(source || destination);
        }).length;

        return [
            {
                key: "pending",
                label: "Pendientes",
                value: scans.length,
                hint: "Por revisar y asignar",
                icon: Clock,
                iconClass: "border-amber-500/25 bg-amber-500/10 text-amber-500",
            },
            {
                key: "merchant",
                label: "Con comercio",
                value: scans.filter((s) => s.merchant).length,
                hint: "Con comercio identificado",
                icon: Store,
                iconClass: "border-sky-500/25 bg-sky-500/10 text-sky-500",
            },
            {
                key: "amount",
                label: "Con monto",
                value: scans.filter((s) => s.amount != null).length,
                hint: "Con monto extraído",
                icon: DollarSign,
                iconClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-500",
            },
            {
                key: "accounts",
                label: "Con cuentas",
                value: withAccounts,
                hint: "Con origen o destino",
                icon: Landmark,
                iconClass: "border-indigo-500/25 bg-indigo-500/10 text-indigo-500",
            },
        ];
    }, [scans]);

    return (
        // Cuatro columnas fijas: la bandeja solo monta esto en escritorio.
        <div className="grid grid-cols-4 gap-3">
            {kpis.map((kpi) => (
                <div
                    key={kpi.key}
                    className="flex items-center gap-3 rounded-2xl border border-border/50 bg-bg-secondary/80 px-4 py-3"
                >
                    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", kpi.iconClass)}>
                        <kpi.icon className="h-5 w-5" />
                    </span>
                    {/* Etiqueta y pie envuelven en vez de cortarse: a 390px cada
                        tarjeta deja unos 81px de texto, y "Con comercio" cortado
                        a "Con come…" no dice nada. Cuantas columnas quepan
                        depende del contenedor, asi que ningun ancho fijo puede
                        garantizar que entren en una linea. */}
                    <span className="flex min-w-0 flex-col leading-tight">
                        <span className="text-[12px] leading-snug text-muted-foreground">{kpi.label}</span>
                        <span className="mt-0.5 text-[22px] font-bold leading-none tabular-nums">{kpi.value}</span>
                        <span className="mt-1 text-[11px] leading-snug text-muted-foreground">{kpi.hint}</span>
                    </span>
                </div>
            ))}
        </div>
    );
}

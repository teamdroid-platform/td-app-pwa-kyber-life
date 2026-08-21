import Link from "next/link";
import { CheckCircle2, Inbox, ListChecks, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertItem, AlertKind } from "@/lib/home-overview";
import { CARD, IconTile, SectionLabel, type Tint } from "./ui";

const KIND: Record<AlertKind, { icon: typeof Inbox; tint: Tint }> = {
    scans: { icon: Inbox, tint: "sky" },
    balances: { icon: Scale, tint: "amber" },
    pending: { icon: ListChecks, tint: "violet" },
};

/**
 * Lo que requiere una decisión del usuario, con el botón que la resuelve.
 *
 * Solo entran señales que salen de datos reales —escaneos sin revisar, cuentas
 * sin corte reciente, movimientos sin confirmar—. Una ficha que avisa de algo
 * que la app no mide enseña a ignorar la tarjeta entera.
 */
export function AlertsCard({ alerts }: { alerts: readonly AlertItem[] }) {
    return (
        <section className="flex flex-col">
            <SectionLabel>Alertas y recordatorios</SectionLabel>

            <div className={cn(CARD, "flex-1 divide-y divide-border-base overflow-hidden")}>
                {alerts.length === 0 ? (
                    <p className="flex h-full items-center justify-center gap-2 px-4 py-8 text-center text-[12px] text-text-tertiary">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        Nada pendiente: todo está al día.
                    </p>
                ) : alerts.map(alert => {
                    const { icon: Icon, tint } = KIND[alert.kind];

                    return (
                        <div key={alert.kind} className="flex items-center gap-3 px-3.5 py-3">
                            <IconTile tint={tint} size="sm"><Icon className="h-4 w-4" /></IconTile>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-text-primary">{alert.title}</span>
                                <span className="block truncate text-[11px] text-text-tertiary">{alert.description}</span>
                            </span>
                            <Link
                                href={alert.href}
                                className="shrink-0 rounded-lg border border-border-base bg-bg-tertiary/60 px-3 py-1.5 text-[12px] font-medium text-text-primary transition-colors hover:border-border-strong"
                            >
                                {alert.actionLabel}
                            </Link>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

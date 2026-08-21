import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/home-overview";
import { CARD, IconTile, SectionLabel, type Tint } from "./ui";

export type ActivityKind = "income" | "expense" | "other";

export interface ActivityItem {
    id: string;
    /** Comercio o descripción: lo que el usuario reconoce de un vistazo. */
    title: string;
    /** «Hoy, 10:45» — cuándo pasó. */
    when: string;
    amount: number;
    currency: string;
    kind: ActivityKind;
}

const KIND: Record<ActivityKind, { label: string; tint: Tint; sign: string; amountClass: string }> = {
    income: { label: "Ingreso", tint: "emerald", sign: "+", amountClass: "text-emerald-400" },
    expense: { label: "Gasto", tint: "rose", sign: "−", amountClass: "text-text-primary" },
    other: { label: "Otro", tint: "slate", sign: "", amountClass: "text-text-primary" },
};

/**
 * Los últimos movimientos, sin filtros ni totales.
 *
 * Es una ventana al historial, no un resumen: lo que responde es «¿entró ya lo
 * que estaba esperando?», y para cualquier otra pregunta está la lista
 * completa, a la que lleva el enlace de la cabecera.
 */
export function RecentActivityCard({ items }: { items: readonly ActivityItem[] }) {
    return (
        <section className="flex flex-col">
            <SectionLabel
                action={
                    <Link href="/financial/transactions" className="text-[12px] font-medium text-accent-primary hover:underline">
                        Ver todas
                    </Link>
                }
            >
                Actividad reciente
            </SectionLabel>

            <div className={cn(CARD, "flex-1 divide-y divide-border-base overflow-hidden")}>
                {items.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[12px] text-text-tertiary">
                        Todavía no hay movimientos registrados.
                    </p>
                ) : items.map(item => {
                    const kind = KIND[item.kind];
                    const Icon = item.kind === "income" ? ArrowDownLeft : item.kind === "expense" ? ArrowUpRight : Receipt;

                    return (
                        <Link
                            key={item.id}
                            href={`/financial/transactions/${item.id}`}
                            className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-bg-tertiary/40"
                        >
                            <IconTile tint={kind.tint} size="sm"><Icon className="h-4 w-4" /></IconTile>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-text-primary">{item.title}</span>
                                <span className="block truncate text-[11px] text-text-tertiary">{item.when}</span>
                            </span>
                            <span className="hidden shrink-0 rounded-full border border-border-base bg-bg-tertiary/50 px-2.5 py-0.5 text-[11px] font-medium text-text-secondary sm:inline">
                                {kind.label}
                            </span>
                            <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", kind.amountClass)}>
                                {`${kind.sign}${formatMoney(item.amount, item.currency)}`}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}

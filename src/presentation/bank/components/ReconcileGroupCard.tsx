"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { assignGroupAction, markGroupExternalAction } from "@/app/actions/bank-reconcile";
import type { ReconcileGroup, ReconcileIdentity } from "@/app/actions/bank-reconcile";

const TYPE_LABEL: Record<string, string> = {
    SAVINGS: "Ahorros", CHECKING: "Corriente", INVESTMENT: "Inversión",
};

interface ReconcileGroupCardProps {
    group: ReconcileGroup;
    identities: ReconcileIdentity[];
    /** Cambia qué acciones se ofrecen. */
    section: "exact" | "inferred" | "pending";
}

/**
 * Un grupo candidato. Muestra las cadenas crudas como evidencia —es la única
 * pantalla donde salen a la superficie— y ofrece las acciones que su sección
 * admite.
 */
export function ReconcileGroupCard({ group, identities, section }: ReconcileGroupCardProps) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const candidates = identities.filter(i => group.candidateIds.includes(i.id));
    const ligada = identities.find(i => i.id === (group.accountId ?? group.cardId));

    const numero = group.prefixDigits
        ? `${group.prefixDigits}••••${group.suffixDigits}`
        : `••••${group.suffixDigits}`;

    async function asignar(identity: ReconcileIdentity) {
        setBusy(true);
        const result = await assignGroupAction({
            observationIds: group.observationIds,
            kind: identity.kind,
            targetId: identity.id,
        });
        setBusy(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success(`Ligado a ${identity.label}`);
        router.refresh();
    }

    async function marcarAjena() {
        setBusy(true);
        const result = await markGroupExternalAction({ observationIds: group.observationIds });
        setBusy(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success("Marcada como ajena");
        router.refresh();
    }

    return (
        <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
            <header className="flex items-baseline justify-between gap-2">
                <h3 className="min-w-0 truncate text-sm font-semibold tabular-nums">{numero}</h3>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {group.occurrences} tx
                </span>
            </header>

            {/* La evidencia: lo que el banco escribió, tal cual. */}
            <div className="flex flex-wrap gap-1.5">
                {group.samples.map(sample => (
                    <span
                        key={sample}
                        className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                        {sample}
                    </span>
                ))}
            </div>

            {(group.institutionHint || group.brand || group.accountTypeHint) && (
                <div className="flex flex-col gap-1 text-xs">
                    {group.institutionHint && (
                        <Hint label="Institución en la cadena" value={group.institutionHint} />
                    )}
                    {group.brand && <Hint label="Marca" value={group.brand} />}
                    {group.accountTypeHint && (
                        <Hint label="Tipo sugerido" value={TYPE_LABEL[group.accountTypeHint] ?? group.accountTypeHint} />
                    )}
                </div>
            )}

            {section === "inferred" && group.evidence && (
                <p className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{group.evidence}</span>
                </p>
            )}

            {section === "pending" && candidates.length > 1 && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        {candidates.length} identidades compatibles. Elige una o déjala fuera —
                        los últimos dígitos no bastan para decidir.
                    </span>
                </p>
            )}

            {ligada && section !== "pending" && (
                <p className="text-xs text-muted-foreground">
                    Ligada a <b className="text-foreground">{ligada.label}</b>
                </p>
            )}

            {candidates.length > 0 && section === "pending" && (
                <div className="flex flex-col gap-1.5">
                    {candidates.map(identity => (
                        <button
                            key={identity.id}
                            type="button"
                            aria-pressed={false}
                            disabled={busy}
                            onClick={() => asignar(identity)}
                            className={cn(
                                "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                                "hover:border-primary/50 disabled:opacity-50",
                            )}
                        >
                            {identity.label}
                        </button>
                    ))}
                </div>
            )}

            {section === "pending" && (
                <Button
                    variant="outline" size="sm" disabled={busy}
                    onClick={marcarAjena}
                    className="w-full"
                >
                    No es mía
                </Button>
            )}
        </section>
    );
}

function Hint({ label, value }: { label: string; value: string }) {
    return (
        <span className="flex justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="shrink-0 font-medium">{value}</span>
        </span>
    );
}

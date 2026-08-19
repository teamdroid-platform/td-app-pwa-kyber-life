"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, AlertTriangle } from "lucide-react";
import { formatIdentityNumber, isRedundantSample } from "@/lib/format-bank-number";
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
    /** Abre el alta con este grupo, para las que el usuario reconoce como suyas. */
    onClaim?: (group: ReconcileGroup) => void;
}

/**
 * Un grupo candidato, en una fila.
 *
 * Antes era una tarjeta con el número arriba, la cadena cruda debajo y un botón
 * a lo ancho: cuatro pendientes llenaban la pantalla para cuatro decisiones de
 * un toque. Y el número salía dos veces —`XXXX7903` y `XXXXXXXX7903` son el
 * mismo, solo cambia el largo de la máscara—, así que la evidencia solo se
 * muestra cuando aporta dígitos que el número no tiene.
 */
export function ReconcileGroupCard({ group, identities, section, onClaim }: ReconcileGroupCardProps) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const candidates = identities.filter(i => group.candidateIds.includes(i.id));
    const ligada = identities.find(i => i.id === (group.accountId ?? group.cardId));

    const numero = formatIdentityNumber({
        prefixDigits: group.prefixDigits,
        lastFour: group.suffixDigits,
    }) || group.samples[0] || "sin número";

    const evidencia = group.samples.filter(sample => !isRedundantSample(sample, numero));

    const contexto = [
        group.occurrences === 1 ? "1 mov." : `${group.occurrences} mov.`,
        group.brand,
        group.institutionHint,
        group.accountTypeHint ? TYPE_LABEL[group.accountTypeHint] ?? group.accountTypeHint : null,
    ].filter(Boolean).join(" · ");

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
        <div className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-semibold tabular-nums">{numero}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">
                        {contexto}
                        {/* Lo que el banco escribió, solo si dice algo más. */}
                        {evidencia.map(sample => (
                            <span key={sample} className="ml-1.5 font-mono text-muted-foreground/70">
                                {sample}
                            </span>
                        ))}
                    </span>
                </span>

                {section === "pending" && (
                    <span className="flex shrink-0 items-center gap-1.5">
                        {/* «Es mía» no existía: sin candidatos la única salida era
                            descartarla, aunque fuera una cuenta del usuario. */}
                        {candidates.length === 0 && onClaim && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onClaim(group)}
                                className="rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                            >
                                Es mía
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={busy}
                            onClick={marcarAjena}
                            className="rounded-lg border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                            No
                        </button>
                    </span>
                )}
            </div>

            {section === "inferred" && group.evidence && (
                <p className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span>{group.evidence}</span>
                </p>
            )}

            {ligada && section !== "pending" && (
                <p className="text-[10.5px] text-muted-foreground">
                    Ligada a <b className="text-foreground">{ligada.label}</b>
                </p>
            )}

            {section === "pending" && candidates.length > 0 && (
                <>
                    <p className="flex items-start gap-2 text-[10.5px] leading-relaxed text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                            {candidates.length === 1
                                ? "Una identidad compatible. Confírmala o déjala fuera."
                                : `${candidates.length} identidades compatibles: los últimos dígitos no bastan.`}
                        </span>
                    </p>
                    <div className="flex flex-col gap-1">
                        {candidates.map(identity => (
                            <button
                                key={identity.id}
                                type="button"
                                disabled={busy}
                                onClick={() => asignar(identity)}
                                className={cn(
                                    "rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition-colors",
                                    "hover:border-primary/50 disabled:opacity-50",
                                )}
                            >
                                {identity.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

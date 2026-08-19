"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormSheet } from "@/components/ui/form-sheet";
import { Button } from "@/components/ui/button";
import { mergeBankInstitutionsAction } from "@/app/actions/bank";
import { money } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankInstitution } from "@/domain/entities/bank";

export interface MergeCandidate {
    institution: BankInstitution;
    accounts: number;
    cards: number;
    total: number;
}

interface MergeInstitutionsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Cómo llamar al grupo, p. ej. «Jardín Azuayo». */
    label: string;
    candidates: MergeCandidate[];
}

/** Lo que hay dentro de una institución, dicho en palabras. */
function contents({ accounts, cards }: { accounts: number; cards: number }): string {
    if (accounts === 0 && cards === 0) return "Sin cuentas ni tarjetas";
    const parts: string[] = [];
    if (accounts > 0) parts.push(accounts === 1 ? "1 cuenta" : `${accounts} cuentas`);
    if (cards > 0) parts.push(cards === 1 ? "1 tarjeta" : `${cards} tarjetas`);
    return parts.join(" · ");
}

/**
 * Elegir cuál de los emisores repetidos se queda.
 *
 * Se decide sobre todo el grupo de una vez: con tres cooperativas iguales,
 * unificarlas de dos en dos obliga a repetir la misma decisión y a acertar el
 * orden. Aquí se marca la que sobrevive y las demás se vacían en ella.
 */
export function MergeInstitutionsSheet({
    open, onOpenChange, label, candidates,
}: MergeInstitutionsSheetProps) {
    const router = useRouter();
    const [merging, setMerging] = useState(false);

    // La que más tiene registrado es la que menos cuesta conservar; si todas
    // están vacías, la primera sirve igual.
    const suggested = [...candidates]
        .sort((a, b) => (b.accounts + b.cards) - (a.accounts + a.cards))[0]?.institution.id ?? "";
    // Sin efecto de reinicio: quien la abre la monta con `key` por grupo, así
    // que cada grupo estrena su propio estado y el sugerido siempre es el suyo.
    const [targetId, setTargetId] = useState(suggested);

    const target = candidates.find(c => c.institution.id === targetId);
    const sources = candidates.filter(c => c.institution.id !== targetId);
    const movingAccounts = sources.reduce((sum, c) => sum + c.accounts, 0);
    const movingCards = sources.reduce((sum, c) => sum + c.cards, 0);

    async function handleMerge() {
        if (!target) return;

        setMerging(true);
        const result = await mergeBankInstitutionsAction({
            sourceIds: sources.map(c => c.institution.id),
            targetId,
        });
        setMerging(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        const moved = result.data.movedAccounts + result.data.movedCards;
        toast.success(
            moved > 0
                ? `Unificado en «${target.institution.name}». ${moved} ${moved === 1 ? "registro movido" : "registros movidos"}.`
                : `Unificado en «${target.institution.name}».`,
        );
        onOpenChange(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={onOpenChange}
            title={`Unificar «${label}»`}
            description="Elige cuál se queda. Las cuentas y tarjetas de las demás se moverán a ella y los duplicados se archivan."
            bodyClassName="space-y-2 py-3"
            footer={
                <Button className="w-full" onClick={handleMerge} disabled={merging || !target || sources.length === 0}>
                    {merging
                        ? "Unificando…"
                        : target
                            ? `Unificar en «${target.institution.name}»`
                            : "Elige cuál se queda"}
                </Button>
            }
        >
            {candidates.map(candidate => {
                const selected = candidate.institution.id === targetId;
                return (
                    <button
                        key={candidate.institution.id}
                        type="button"
                        onClick={() => setTargetId(candidate.institution.id)}
                        aria-pressed={selected}
                        className={cn(
                            "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                            selected ? "border-primary bg-primary/5" : "hover:border-primary/40",
                        )}
                    >
                        <span className={cn(
                            "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                            selected ? "border-primary" : "border-muted-foreground/40",
                        )}>
                            {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{candidate.institution.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                                {contents(candidate)}
                                {candidate.total !== 0 && ` · ${money(candidate.total)}`}
                            </span>
                        </span>
                    </button>
                );
            })}

            {/* Decir qué va a pasar antes de que pase: archivar es reversible en
                la base, pero el usuario no lo sabe mirando el botón. */}
            <p className="px-1 pt-1 text-[11px] leading-relaxed text-muted-foreground">
                {movingAccounts + movingCards > 0
                    ? `Se moverán ${contents({ accounts: movingAccounts, cards: movingCards }).toLowerCase()} y se archivarán ${sources.length === 1 ? "1 institución" : `${sources.length} instituciones`}.`
                    : `No hay nada que mover: se archivarán ${sources.length === 1 ? "1 institución vacía" : `${sources.length} instituciones vacías`}.`}
            </p>
        </FormSheet>
    );
}

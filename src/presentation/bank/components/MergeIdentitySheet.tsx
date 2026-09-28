"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormSheet } from "@/components/ui/form-sheet";
import { Button } from "@/components/ui/button";
import { mergeBankAccountsAction, mergeBankCardsAction } from "@/app/actions/bank";
import { IdentityBadge } from "./IdentityBadge";
import { cn } from "@/lib/utils";

/** Una tarjeta o cuenta tal como se enseña en la lista: acrónimo, número, emisor. */
export interface MergeIdentityOption {
    id: string;
    acronym: string;
    typeLabel: string;
    number: string;
    institutionName: string;
    /** Saldo o deuda ya escritos, para distinguir dos que se llaman igual. */
    amountLabel?: string;
}

interface MergeIdentitySheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    kind: "CARD" | "ACCOUNT";
    /** La que se va a vaciar y archivar. */
    source: MergeIdentityOption;
    /** Las demás del mismo tipo que puede recibirla. */
    options: MergeIdentityOption[];
}

/** Los últimos dígitos, para reconocer un duplicado sin comparar la máscara entera. */
function lastDigits(number: string): string {
    return number.replace(/\D/g, "").slice(-4);
}

/**
 * Unificar una tarjeta o una cuenta con otra.
 *
 * El caso: la misma Mastercard registrada dos veces, una a mano y otra desde
 * un escaneo. Cada una se lleva parte de los consumos, y ninguna de las dos
 * dice la deuda real.
 *
 * La dirección va fijada, igual que al unificar instituciones: se elige a
 * dónde pasa todo lo de esta, no cuál sobrevive. Empezando desde una fila,
 * «elige cuál se queda» invita a leerlo al revés y archivar la que se quería
 * conservar.
 *
 * Las que comparten los últimos dígitos van primero y marcadas: son casi
 * siempre el duplicado que se viene a arreglar, y encontrarlo entre diez es
 * la parte cara.
 */
export function MergeIdentitySheet({ open, onOpenChange, kind, source, options }: MergeIdentitySheetProps) {
    const router = useRouter();
    const [targetId, setTargetId] = useState("");
    const [merging, setMerging] = useState(false);

    const noun = kind === "CARD" ? "tarjeta" : "cuenta";
    const sourceDigits = lastDigits(source.number);

    const sorted = useMemo(() => {
        const same = (o: MergeIdentityOption) => !!sourceDigits && lastDigits(o.number) === sourceDigits;
        return [...options].sort((a, b) => Number(same(b)) - Number(same(a)));
    }, [options, sourceDigits]);

    const target = options.find(o => o.id === targetId);

    async function handleMerge() {
        if (!target) return;

        setMerging(true);
        const input = { sourceIds: [source.id], targetId: target.id };
        const result = kind === "CARD"
            ? await mergeBankCardsAction(input)
            : await mergeBankAccountsAction(input);
        setMerging(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        const moved = result.data.movedTransactions;
        toast.success(
            moved > 0
                ? `Unificada. ${moved} ${moved === 1 ? "transacción pasó" : "transacciones pasaron"} a ${target.number}.`
                : `Unificada en ${target.number}.`,
        );
        onOpenChange(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={onOpenChange}
            title={`Unificar ${source.number}`}
            description={`Elige a qué ${noun} pasa todo lo de esta. Al terminar, esta se archiva.`}
            bodyClassName="space-y-2 py-3"
            footer={
                <Button className="w-full" onClick={handleMerge} disabled={merging || !target}>
                    {merging
                        ? "Unificando…"
                        : target
                            ? `Pasar todo a ${target.number}`
                            : `Elige la ${noun} que se queda`}
                </Button>
            }
        >
            {sorted.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                    {kind === "CARD"
                        ? "No tienes otra tarjeta del mismo tipo con la que unificarla."
                        : "No tienes otra cuenta con la que unificarla."}
                </p>
            ) : sorted.map(option => {
                const selected = option.id === targetId;
                const likely = !!sourceDigits && lastDigits(option.number) === sourceDigits;
                return (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => setTargetId(option.id)}
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
                            <span className="flex items-center gap-1.5">
                                <IdentityBadge acronym={option.acronym} title={option.typeLabel} />
                                <span className="font-mono text-sm font-semibold">{option.number}</span>
                                {likely && (
                                    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                        mismo número
                                    </span>
                                )}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                                {option.institutionName}
                                {option.amountLabel && ` · ${option.amountLabel}`}
                            </span>
                        </span>
                    </button>
                );
            })}
        </FormSheet>
    );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { FormSheet } from "@/components/ui/form-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mergeBankInstitutionsAction } from "@/app/actions/bank";
import { money } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankInstitution } from "@/domain/entities/bank";
import type { MergeCandidate } from "./MergeInstitutionsSheet";

interface MergeIntoSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** La que se va a vaciar y archivar. */
    source: BankInstitution;
    /** Lo que tiene la de origen, para decir qué se va a mover. */
    sourceCounts: { accounts: number; cards: number };
    /** Las demás del usuario, con lo que tiene cada una. */
    options: MergeCandidate[];
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
 * Unificar a mano, desde una institución concreta.
 *
 * El aviso automático solo aparece cuando dos nombres comparten huella, y eso
 * deja fuera pares que el usuario sí reconoce como el mismo banco —«Coop Jardín
 * Azuayo» y «Coop. Jardín Azuayo CJA» se distinguen por un sufijo que no es
 * forma jurídica—. Aquí la decisión es suya y no depende de que la app la
 * adivine.
 *
 * La dirección va fijada: se elige a dónde va lo de esta, no cuál sobrevive.
 * Empezando desde una institución, «elige cuál se queda» invita a leer al revés
 * y archivar la que se quería conservar.
 */
export function MergeIntoSheet({ open, onOpenChange, source, sourceCounts, options }: MergeIntoSheetProps) {
    const router = useRouter();
    const [merging, setMerging] = useState(false);
    const [targetId, setTargetId] = useState("");
    const [query, setQuery] = useState("");

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return options;
        return options.filter(o => o.institution.name.toLowerCase().includes(needle));
    }, [options, query]);

    const target = options.find(o => o.institution.id === targetId);

    async function handleMerge() {
        if (!target) return;

        setMerging(true);
        const result = await mergeBankInstitutionsAction({
            sourceIds: [source.id],
            targetId: target.institution.id,
        });
        setMerging(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        const moved = result.data.movedAccounts + result.data.movedCards;
        toast.success(
            moved > 0
                ? `«${source.name}» se unificó en «${target.institution.name}». ${moved} ${moved === 1 ? "registro movido" : "registros movidos"}.`
                : `«${source.name}» se unificó en «${target.institution.name}».`,
        );
        onOpenChange(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={onOpenChange}
            title={`Unificar «${source.name}»`}
            description="Elige a dónde pasan sus cuentas y tarjetas. Al terminar, esta institución se archiva."
            bodyClassName="space-y-2 py-3"
            footer={
                <Button className="w-full" onClick={handleMerge} disabled={merging || !target}>
                    {merging
                        ? "Unificando…"
                        : target
                            ? `Pasar todo a «${target.institution.name}»`
                            : "Elige la institución destino"}
                </Button>
            }
        >
            {options.length > 5 && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar institución"
                        className="pl-9"
                        aria-label="Buscar institución"
                        autoComplete="off"
                    />
                </div>
            )}

            {matches.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                    {options.length === 0
                        ? "No tienes otra institución con la que unificarla."
                        : `Ninguna coincide con «${query}».`}
                </p>
            ) : matches.map(option => {
                const selected = option.institution.id === targetId;
                return (
                    <button
                        key={option.institution.id}
                        type="button"
                        onClick={() => setTargetId(option.institution.id)}
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
                            <span className="block truncate text-sm font-medium">{option.institution.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                                {contents(option)}
                                {option.total !== 0 && ` · ${money(option.total)}`}
                            </span>
                        </span>
                    </button>
                );
            })}

            {/* Decir qué se va a mover antes de moverlo: archivar es
                reversible en la base, pero el usuario no lo sabe. */}
            <p className="px-1 pt-1 text-[11px] leading-relaxed text-muted-foreground">
                {sourceCounts.accounts + sourceCounts.cards > 0
                    ? `Se moverá ${contents(sourceCounts).toLowerCase()} de «${source.name}».`
                    : `«${source.name}» no tiene nada que mover: solo se archiva.`}
            </p>
        </FormSheet>
    );
}

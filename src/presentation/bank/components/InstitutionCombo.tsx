"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeForMatch } from "@/lib/institution-match";
import { INSTITUTION_KINDS, inferInstitutionKind } from "@/lib/bank-institution-kind";
import { createBankInstitutionAction } from "@/app/actions/bank";
import type { BankInstitution, BankInstitutionKind } from "@/domain/entities/bank";

/** El emisor elegido: uno que ya existe, o uno que nacerá al guardar. */
export interface InstitutionChoice {
    /** Id del emisor existente. `null` mientras se escribe uno nuevo. */
    id: string | null;
    /** Lo que el usuario escribió. Es el nombre con el que se crearía. */
    name: string;
    /** Tipo con el que nacería. Se ignora si se eligió uno existente. */
    kind: BankInstitutionKind;
}

export const EMPTY_INSTITUTION_CHOICE: InstitutionChoice = {
    id: null, name: "", kind: "OTHER",
};

/**
 * El emisor que ya tienes con ese nombre, comparando como lo compara el resto
 * de la app: sin mayúsculas ni acentos. Es lo que evita que «BANCO AUSTRO»
 * nazca como un segundo emisor al lado de «Banco del Austro».
 */
export function matchInstitution(
    institutions: BankInstitution[], name: string,
): BankInstitution | undefined {
    const target = normalizeForMatch(name);
    if (!target) return undefined;
    return institutions.find(i => normalizeForMatch(i.name) === target);
}

export type EnsuredInstitution =
    | { ok: true; id: string; created: BankInstitution | null }
    | { ok: false; error: string };

/**
 * El id del emisor que el formulario debe usar, creándolo si hace falta.
 *
 * Lo llaman los formularios de cuenta y tarjeta justo antes de guardar. Crear
 * el emisor aquí y no en el servidor mantiene la creación explícita: si falla,
 * el formulario lo dice y no se guarda nada a medias.
 */
export async function ensureInstitution(
    choice: InstitutionChoice, institutions: BankInstitution[],
): Promise<EnsuredInstitution> {
    if (choice.id) return { ok: true, id: choice.id, created: null };

    const name = choice.name.trim();
    if (!name) return { ok: false, error: "Elige o escribe la institución que la emite" };

    const existing = matchInstitution(institutions, name);
    if (existing) return { ok: true, id: existing.id, created: null };

    const result = await createBankInstitutionAction({ name, kind: choice.kind });
    if (!result.success) return { ok: false, error: result.error };

    return { ok: true, id: result.data.id, created: result.data };
}

interface InstitutionComboProps {
    institutions: BankInstitution[];
    value: InstitutionChoice;
    onChange: (value: InstitutionChoice) => void;
    /** Id del input, para que la etiqueta del campo apunte a él. */
    id?: string;
}

/**
 * Campo de emisor que además lo crea.
 *
 * Escribir filtra los que ya tienes; tocar uno lo elige. Si el nombre escrito
 * no es ninguno de ellos, el campo pasa a modo alta y pide el tipo — así una
 * cuenta se puede registrar de una sola vez, sin salir a Bancos primero, que
 * era el punto muerto de este formulario cuando aún no tenías ningún emisor.
 *
 * El tipo arranca en lo que el nombre sugiere y el usuario lo puede corregir:
 * la app no clasifica emisores por su cuenta.
 */
export function InstitutionCombo({
    institutions, value, onChange, id = "institution-combo",
}: InstitutionComboProps) {
    const [touched, setTouched] = useState(false);

    const matches = useMemo(() => {
        const query = normalizeForMatch(value.name);
        if (!query) return institutions;

        // Con una elegida, su nombre completo llena el campo y filtrar por él
        // dejaría solo a ella misma — justo cuando se abre la lista para
        // cambiarla. Se ofrecen todas hasta que se escriba algo distinto.
        if (value.id && normalizeForMatch(matchInstitution(institutions, value.name)?.name) === query) {
            return institutions;
        }

        return institutions.filter(i => normalizeForMatch(i.name).includes(query));
    }, [institutions, value.name, value.id]);

    const exact = matchInstitution(institutions, value.name);
    const willCreate = !value.id && !exact && value.name.trim().length > 0;

    // La lista se abre al tocar el campo, incluso con un emisor ya elegido:
    // corregirlo es justo lo que se viene a hacer al editar una cuenta, y
    // ocultarla dejaba el campo con pinta de no admitir cambios.
    const showList = touched && matches.length > 0;

    function write(name: string) {
        setTouched(true);
        // Escribir invalida la elección anterior, pero si lo escrito coincide
        // exacto con un emisor existente, se reusa en vez de duplicarlo.
        const hit = matchInstitution(institutions, name);
        onChange({
            id: hit?.id ?? null,
            name,
            kind: hit?.kind ?? inferInstitutionKind(name),
        });
    }

    function pick(institution: BankInstitution) {
        setTouched(false);
        onChange({ id: institution.id, name: institution.name, kind: institution.kind });
    }

    return (
        <div className="space-y-3">
            <Field label="Institución" htmlFor={id}>
                <Input
                    id={id}
                    value={value.name}
                    onChange={e => write(e.target.value)}
                    onFocus={() => setTouched(true)}
                    placeholder="Busca o escribe una institución"
                    autoComplete="off"
                />
            </Field>

            {showList && (
                <ul className="max-h-40 space-y-1 overflow-y-auto" role="listbox" aria-label="Instituciones">
                    {matches.map(institution => (
                        <li key={institution.id}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={false}
                                onClick={() => pick(institution)}
                                className="flex w-full items-center gap-2 rounded-xl border border-border/40 p-2.5 text-left text-sm text-text-primary transition-colors hover:border-border"
                            >
                                <span className="min-w-0 flex-1 truncate">{institution.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {value.id && (
                <p className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    Usarás la institución que ya tienes.
                </p>
            )}

            {willCreate && (
                <div className={cn(
                    "space-y-3 rounded-xl border border-border/40 bg-bg-secondary/40 p-3",
                )}>
                    <p className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                        <Plus className="h-3.5 w-3.5" />
                        Se creará <b className="text-text-primary">{value.name.trim()}</b> al guardar.
                    </p>

                    <Field label="Tipo de institución">
                        <Select
                            value={value.kind}
                            onValueChange={kind => onChange({ ...value, kind: kind as BankInstitutionKind })}
                        >
                            <SelectTrigger aria-label="Tipo de institución"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {INSTITUTION_KINDS.map(k => (
                                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
            )}
        </div>
    );
}

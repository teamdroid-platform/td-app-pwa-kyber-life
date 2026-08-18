"use client";

import { ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type {
    AccountOwnership, ScannedAccountDecision, ScannedAccountView,
} from "@/application/services/bank-service";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InstitutionCombo, EMPTY_INSTITUTION_CHOICE, type InstitutionChoice } from "./InstitutionCombo";
import { IdentityBadge } from "./IdentityBadge";
import { THIRD_PARTY_ACRONYM, UNKNOWN_TYPE_ACRONYM } from "@/lib/bank-identity-label";
import { lastFourOfDisplay } from "@/lib/format-bank-number";
import type { BankInstitution } from "@/domain/entities/bank";


interface ScannedAccountsPanelProps {
    accounts: ScannedAccountView[];
    /**
     * Encabezado del bloque. El escaneo y la transacción confirmada muestran lo
     * mismo con distinto título.
     */
    title?: string;
    className?: string;
    /**
     * Deja declarar de quién es cada cuenta. Sin esto el panel es de solo
     * lectura, que es como se muestra en el resumen y en el detalle.
     */
    onOwnershipChange?: (raw: string, decision: ScannedAccountDecision) => void;
    /** Emisores del usuario, para poder asignar uno desde aquí. */
    institutions?: BankInstitution[];
    /**
     * Sin caja propia, para integrarse en una lista mayor. En el paso de pago
     * las cuentas del movimiento y las del usuario son la misma pregunta, y dos
     * marcos anidados las hacían parecer dos.
     */
    flat?: boolean;
}

/**
 * Las cuentas del movimiento, de solo lectura y en una línea por lado.
 *
 * Responde a «qué dijo el banco», no a «con qué pagué» — eso se elige en el
 * paso de pago, que gana sobre cualquier lectura automática. Por eso no hay
 * ningún control aquí.
 *
 * Es deliberadamente compacto: vive pegado a la fila de forma de pago, donde
 * compite por espacio con el resto del resumen. La cadena original del banco y
 * el nivel de la coincidencia viajan en el `title` en vez de ocupar línea
 * propia; la pantalla de conciliación es donde esa evidencia se examina.
 */
export function ScannedAccountsPanel({
    accounts, title = "Cuentas del escaneo", className, onOwnershipChange,
    institutions = [], flat = false,
}: ScannedAccountsPanelProps) {
    if (accounts.length === 0) return null;

    return (
        <div
            className={cn(
                flat
                    ? "flex flex-col gap-1.5"
                    : "rounded-2xl border border-border/40 bg-bg-secondary/30 px-3 py-2.5",
                className,
            )}
        >
            <p className={cn(
                "flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary",
                !flat && "mb-1.5",
            )}>
                {!flat && <Landmark className="h-3 w-3" />} {title}
            </p>

            <ul className={cn("flex flex-col", flat ? "gap-1.5" : "gap-1")}>
                {accounts.map((account, index) => (
                    <ScannedAccountRow
                        key={`${account.role}-${account.raw}-${index}`}
                        account={account}
                        onOwnershipChange={onOwnershipChange}
                        institutions={institutions}
                    />
                ))}
            </ul>
        </div>
    );
}

function ScannedAccountRow({
    account, onOwnershipChange, institutions = [],
}: {
    account: ScannedAccountView;
    onOwnershipChange?: (raw: string, decision: ScannedAccountDecision) => void;
    institutions?: BankInstitution[];
}) {
    const isSource = account.role === "SOURCE";
    const RoleIcon = isSource ? ArrowUpRight : ArrowDownLeft;

    // Una cuenta ya identificada como tuya no admite discusión: el número
    // corresponde a un registro que existe. Se pregunta por lo que no lo está.
    const askable = !!onOwnershipChange && !account.match;

    return (
        <li className={cn("text-xs", askable && "flex flex-col gap-1 py-0.5")}>
            <span className="flex items-center gap-1.5" title={evidence(account)}>
                <RoleIcon
                    className={cn("h-3.5 w-3.5 shrink-0", isSource ? "text-rose-500" : "text-emerald-500")}
                    aria-label={isSource ? "Origen" : "Destino"}
                />
                {/* El mismo vocabulario que el resumen y el selector: tres
                    letras delante, cuatro dígitos, y de quién es al lado. */}
                <IdentityBadge {...trailAcronymProps(account)} />
                <span className="shrink-0 font-mono text-text-primary">{lastFourOfDisplay(account.display)}</span>
                <span className="truncate text-text-tertiary">{attribution(account)}</span>
            </span>

            {askable && (
                <AccountDecisionForm
                    account={account}
                    institutions={institutions}
                    defaultOwnership={isSource ? "MINE" : "EXTERNAL"}
                    onChange={decision => onOwnershipChange!(account.raw, decision)}
                />
            )}
        </li>
    );
}

/**
 * Todo lo que el usuario puede corregir de una cuenta antes de confirmar.
 *
 * Empieza cerrado en la pregunta que siempre aplica —de quién es— y solo
 * despliega el resto cuando la respuesta es «mía», porque solo entonces va a
 * nacer algo en Bancos. Lo que se corrija aquí viaja con la transacción y se
 * aplica al guardarla: el escáner solo vio una cadena enmascarada, el usuario
 * sabe de qué banco es, si es cuenta o tarjeta, y hasta si los dígitos vinieron
 * mal.
 */
function AccountDecisionForm({
    account, institutions, defaultOwnership, onChange,
}: {
    account: ScannedAccountView;
    institutions: BankInstitution[];
    defaultOwnership: AccountOwnership;
    onChange: (decision: ScannedAccountDecision) => void;
}) {
    const current = account.decision;
    const ownership = current?.ownership ?? defaultOwnership;

    const [open, setOpen] = useState(false);
    const [institution, setInstitution] = useState<InstitutionChoice>(() => {
        const chosen = institutions.find(i => i.id === current?.institutionId);
        if (chosen) return { id: chosen.id, name: chosen.name, kind: chosen.kind };
        if (current?.institutionName) {
            return { id: null, name: current.institutionName, kind: current.institutionKind ?? "OTHER" };
        }
        return EMPTY_INSTITUTION_CHOICE;
    });

    /** Cada cambio emite la decisión entera: el servidor recibe una foto, no un parche. */
    const emit = (patch: Partial<ScannedAccountDecision>) => {
        onChange({
            ownership,
            kind: account.kind,
            accountType: current?.accountType ?? null,
            cardType: current?.cardType ?? null,
            institutionId: institution.id,
            institutionName: institution.id ? null : institution.name || null,
            institutionKind: institution.kind,
            number: current?.number ?? null,
            ...patch,
        });
    };

    const kind = current?.kind ?? account.kind;

    return (
        <span className="flex flex-col gap-1.5 pl-5">
            <OwnershipChoice
                value={ownership}
                onChange={next => {
                    emit({ ownership: next });
                    if (next === "EXTERNAL") setOpen(false);
                }}
            />

            {ownership === "MINE" && (
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="self-start text-[11px] text-accent-primary underline-offset-2 hover:underline"
                >
                    {open ? "Listo" : "Ajustar sus datos"}
                </button>
            )}

            {ownership === "MINE" && open && (
                <div className="flex flex-col gap-2.5 rounded-xl border border-border/40 bg-bg-primary/40 p-2.5">
                    <InstitutionCombo
                        id={`decision-institution-${account.raw}`}
                        institutions={institutions}
                        value={institution}
                        onChange={next => {
                            setInstitution(next);
                            emit({
                                institutionId: next.id,
                                institutionName: next.id ? null : next.name || null,
                                institutionKind: next.kind,
                            });
                        }}
                    />

                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Qué es">
                            <Select
                                value={kind}
                                onValueChange={v => emit({ kind: v as "ACCOUNT" | "CARD" })}
                            >
                                <SelectTrigger aria-label="Qué es"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ACCOUNT">Cuenta</SelectItem>
                                    <SelectItem value="CARD">Tarjeta</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label="Tipo">
                            {kind === "CARD" ? (
                                <Select
                                    value={current?.cardType ?? "DEBIT"}
                                    onValueChange={v => emit({ cardType: v as "DEBIT" | "CREDIT" })}
                                >
                                    <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DEBIT">Débito</SelectItem>
                                        <SelectItem value="CREDIT">Crédito</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Select
                                    value={current?.accountType ?? "SAVINGS"}
                                    onValueChange={v => emit({ accountType: v as "SAVINGS" | "CHECKING" | "INVESTMENT" })}
                                >
                                    <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="SAVINGS">Ahorros</SelectItem>
                                        <SelectItem value="CHECKING">Corriente</SelectItem>
                                        <SelectItem value="INVESTMENT">Inversión</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </Field>
                    </div>

                    <Field label="Número" htmlFor={`decision-number-${account.raw}`} optional>
                        <Input
                            id={`decision-number-${account.raw}`}
                            value={current?.number ?? account.display}
                            onChange={e => emit({ number: e.target.value })}
                            autoComplete="off"
                        />
                    </Field>

                    <p className="text-[11px] leading-relaxed text-text-tertiary">
                        Se guardará al confirmar, junto con la transacción.
                    </p>
                </div>
            )}
        </span>
    );
}

/**
 * De quién es la cuenta, en dos botones.
 *
 * Arranca en lo que el sistema supone por el lado: transferir entre cuentas
 * propias es normal, y dar el destino por ajeno sin avisar es lo que hacía
 * desaparecer una cuenta suya.
 */
function OwnershipChoice({
    value, onChange,
}: {
    value: AccountOwnership;
    onChange: (next: AccountOwnership) => void;
}) {
    const options: { value: AccountOwnership; label: string }[] = [
        { value: "MINE", label: "Es mía" },
        { value: "EXTERNAL", label: "De un tercero" },
    ];

    return (
        <span className="flex items-center gap-1 pl-5">
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    aria-pressed={value === option.value}
                    className={cn(
                        "rounded-lg border px-2 py-0.5 text-[11px] transition-colors",
                        value === option.value
                            ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                            : "border-border/40 text-text-tertiary hover:border-border",
                    )}
                >
                    {option.label}
                </button>
            ))}
        </span>
    );
}

/**
 * El recorrido del dinero en una línea, para ir dentro de otra fila.
 *
 * Es la misma información del panel comprimida al máximo: sirve como valor de
 * la fila «Cuenta», donde compite con el resto del resumen y no puede permitirse
 * un bloque propio.
 */
/**
 * Por dónde pasó el dinero, en el valor de una fila.
 *
 * Dos líneas por lado: qué y cuál arriba —acrónimo y los cuatro últimos
 * dígitos—, de quién es debajo. El tipo iba antes sin aparecer por ninguna
 * parte, así que «••••0814» no decía si era una cuenta de ahorros o una
 * tarjeta; y el número largo empujaba al banco fuera de la fila hasta cortarlo.
 */
export function AccountsTrail({ accounts }: { accounts: ScannedAccountView[] }) {
    if (accounts.length === 0) return null;

    return (
        <span className="flex flex-col gap-1.5">
            {accounts.map((account, index) => {
                const isSource = account.role === "SOURCE";
                const Icon = isSource ? ArrowUpRight : ArrowDownLeft;
                const { acronym, meaning } = trailAcronym(account);

                return (
                    <span
                        key={`${account.role}-${account.raw}-${index}`}
                        className="flex min-w-0 flex-col"
                        title={[account.raw, attribution(account)].filter(Boolean).join(" · ")}
                    >
                        <span className="flex items-center gap-1.5">
                            <Icon
                                className={cn("h-3.5 w-3.5 shrink-0", isSource ? "text-rose-500" : "text-emerald-500")}
                                aria-label={isSource ? "Origen" : "Destino"}
                            />
                            <IdentityBadge acronym={acronym} title={meaning} />
                            <span className="font-mono text-sm">{lastFourOfDisplay(account.display)}</span>
                        </span>
                        {/* El banco cabe entero aquí: en la línea de arriba
                            competía con el número y acababa cortado. */}
                        <span className="ml-[22px] truncate text-[11px] text-text-tertiary">
                            {attribution(account)}
                        </span>
                    </span>
                );
            })}
        </span>
    );
}

/**
 * Las tres letras de un número del escaneo.
 *
 * Si corresponde a una cuenta o tarjeta registrada, las suyas. Si no, «TER»
 * cuando se sabe que es de otra persona —eso no es un dato que falte, es una
 * clasificación— y «DES» cuando sencillamente no se conoce el tipo todavía.
 */
function trailAcronymProps(account: ScannedAccountView): { acronym: string; title: string } {
    const { acronym, meaning } = trailAcronym(account);
    return { acronym, title: meaning };
}

function trailAcronym(account: ScannedAccountView): { acronym: string; meaning: string } {
    if (account.match) {
        return { acronym: account.match.typeAcronym, meaning: account.match.typeLabel };
    }

    const isThirdParty = account.ownership
        ? account.ownership === "EXTERNAL"
        : account.role === "DESTINATION";

    return isThirdParty
        ? { acronym: THIRD_PARTY_ACRONYM, meaning: "De un tercero" }
        : { acronym: UNKNOWN_TYPE_ACRONYM, meaning: "Tipo desconocido: aún sin registrar" };
}


/** A quién pertenece el número, en las palabras que el sistema puede sostener. */
function attribution(account: ScannedAccountView): string {
    // El tipo ya lo dice el acrónimo de al lado; repetirlo sería decir dos
    // veces lo mismo en la misma fila.
    if (account.match) {
        return account.match.institutionName || account.match.typeLabel;
    }

    // Lo que el usuario declaró manda sobre cualquier suposición: decir «de un
    // tercero» de una cuenta que acaba de marcar como suya le contradice a la
    // cara. Sin declarar, se supone por el lado — el origen suele ser suyo y
    // solo falta registrarlo; el destino, en cambio, es de otro.
    const fallback = account.ownership
        ? (account.ownership === "MINE" ? "Tuya, sin registrar aún" : "De un tercero")
        : (account.role === "SOURCE" ? "Sin registrar" : "De un tercero");

    return account.institutionHint ? `${fallback} · ${account.institutionHint}` : fallback;
}

/** Lo que sostiene la lectura, para quien quiera comprobarla. */
function evidence(account: ScannedAccountView): string | undefined {
    const parts = [
        account.raw,
        account.resolution === "INFERRED" ? "Coincide por los últimos dígitos" : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(" · ") : undefined;
}

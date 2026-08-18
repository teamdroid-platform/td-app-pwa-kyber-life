"use client";

import { useMemo, useState } from "react";
import { CreditCard, Landmark, PiggyBank, Plus, Search, TrendingUp, UserX, Wallet, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import {
    ACCOUNT_TYPE_ACRONYM, ACCOUNT_TYPE_LABEL, CARD_TYPE_ACRONYM, CARD_TYPE_LABEL,
    accountLabel, cardLabel,
} from "@/lib/bank-identity-label";
import { formatLastFour, lastFourOfDisplay } from "@/lib/format-bank-number";
import { IdentityBadge } from "./IdentityBadge";
import { normalizeForMatch } from "@/lib/institution-match";
import { AccountFormSheet } from "./AccountFormSheet";
import { CardFormSheet } from "./CardFormSheet";
import type { BankAccount, BankAccountType, BankCard, BankInstitution } from "@/domain/entities/bank";

const ACCOUNT_ICON: Record<BankAccountType, typeof Landmark> = {
    CHECKING: Landmark,
    SAVINGS: PiggyBank,
    CASH: Wallet,
    INVESTMENT: TrendingUp,
};

/** Lo que el usuario elige para un lado del movimiento. */
export type PaymentPick =
    | { kind: "ACCOUNT"; accountId: string }
    | { kind: "CARD"; cardId: string }
    | { kind: "EXTERNAL" }
    | { kind: "NONE" };

interface PaymentSourceSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Encabezado: de qué lado del movimiento se está hablando. */
    title: string;
    accounts: BankAccount[];
    cards: BankCard[];
    institutions: BankInstitution[];
    /** Lo elegido ahora, para marcarlo en la lista. */
    value: PaymentPick;
    onPick: (pick: PaymentPick) => void;
    onAccountCreated?: (created: { account: BankAccount; institution: BankInstitution | null }) => void;
    onCardCreated?: (created: { card: BankCard; institution: BankInstitution | null }) => void;
    /** «No es mía» solo tiene sentido en un lado que puede ser de otro. */
    allowExternal?: boolean;
    /**
     * El número que leyó el escaneo para este lado. Abre el alta con él ya
     * puesto: registrar lo que el movimiento trae es el caso más frecuente.
     */
    scannedNumber?: string;
    /**
     * Qué leyó el escaneo que era ese número. El propio escaneo lo distingue
     * —enmascara las tarjetas con equis y las cuentas con puntos—, así que
     * sirve para preseleccionar el tipo en vez de suponerlo.
     */
    scannedKind?: "ACCOUNT" | "CARD";
}

/**
 * Elegir la cuenta de un lado del movimiento, fuera de la pantalla del paso.
 *
 * El paso solo enseña qué hay en cada lado; todo lo demás —buscar entre las
 * tuyas, decir que es de un tercero, registrar una nueva— vive aquí. Tenerlo
 * todo a la vez convertía una pregunta simple en un formulario de veinte líneas.
 */
export function PaymentSourceSheet({
    open, onOpenChange, title, accounts, cards, institutions,
    value, onPick, onAccountCreated, onCardCreated, allowExternal = true,
    scannedNumber, scannedKind,
}: PaymentSourceSheetProps) {
    const [query, setQuery] = useState("");
    /**
     * Registrar el número leído es el caso frecuente, pero no el único: desde
     * aquí también se puede dar de alta algo que no tiene nada que ver con el
     * movimiento. Sin número leído solo existe ese segundo caso.
     */
    const [creatingOther, setCreatingOther] = useState(false);
    const registersScanned = !!scannedNumber && !creatingOther;
    const prefill = registersScanned ? scannedNumber : undefined;

    const matches = useMemo(() => {
        const q = normalizeForMatch(query);
        // El emisor se busca igual que el número: es lo primero que el usuario
        // recuerda de una cuenta, y ya se muestra en la fila.
        const keep = (...parts: (string | null | undefined)[]) =>
            !q || parts.some(p => p && normalizeForMatch(p).includes(q));
        return {
            accounts: accounts.filter(a => keep(accountLabel(a), a.institutionName)),
            cards: cards.filter(c => keep(cardLabel(c), c.institutionName)),
        };
    }, [accounts, cards, query]);

    const choose = (pick: PaymentPick) => {
        onPick(pick);
        onOpenChange(false);
    };

    const isEmpty = accounts.length === 0 && cards.length === 0;

    const accountTrigger = (
        <AccountFormSheet
            institutions={institutions}
            defaultNumber={prefill}
            onCreated={created => {
                onAccountCreated?.(created);
                choose({ kind: "ACCOUNT", accountId: created.account.id });
            }}
            trigger={(
                <CreateButton
                    label="Cuenta"
                    hint="Ahorros, corriente…"
                    icon={<Landmark className="h-4 w-4" />}
                    iconClass="bg-emerald-500/15 text-emerald-500"
                />
            )}
        />
    );

    const cardTrigger = (
        <CardFormSheet
            institutions={institutions}
            accounts={accounts}
            defaultNumber={prefill}
            onCreated={created => {
                onCardCreated?.(created);
                choose({ kind: "CARD", cardId: created.card.id });
            }}
            trigger={(
                <CreateButton
                    label="Tarjeta"
                    hint="Crédito o débito"
                    icon={<CreditCard className="h-4 w-4" />}
                    iconClass="bg-amber-500/15 text-amber-500"
                />
            )}
        />
    );

    return (
        <FormSheet open={open} onOpenChange={onOpenChange} title={title} bodyClassName="space-y-3 py-3">
            {!isEmpty && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar entre tus cuentas y tarjetas"
                        className="pl-9"
                        aria-label="Buscar"
                        autoComplete="off"
                    />
                </div>
            )}

            <ul className="flex flex-col gap-1.5">
                {matches.accounts.map(account => {
                    const Icon = ACCOUNT_ICON[account.accountType];
                    return (
                        <li key={account.id}>
                            <Option
                                selected={value.kind === "ACCOUNT" && value.accountId === account.id}
                                onClick={() => choose({ kind: "ACCOUNT", accountId: account.id })}
                                icon={<Icon className="h-4 w-4" />}
                                iconClass="bg-emerald-500/15 text-emerald-500"
                                // El tipo delante y solo los cuatro últimos: un
                                // «Ahorros 493176••••2780» parecía una tarjeta.
                                title={(
                                    <>
                                        <IdentityBadge
                                            acronym={ACCOUNT_TYPE_ACRONYM[account.accountType]}
                                            title={ACCOUNT_TYPE_LABEL[account.accountType]}
                                        />
                                        <span className="font-mono">{formatLastFour(account)}</span>
                                    </>
                                )}
                                subtitle={[
                                    issuerOf(account),
                                    account.isUnconfirmed ? "sin revisar" : null,
                                ].filter(Boolean).join(" · ")}
                            />
                        </li>
                    );
                })}

                {matches.cards.map(card => (
                    <li key={card.id}>
                        <Option
                            selected={value.kind === "CARD" && value.cardId === card.id}
                            onClick={() => choose({ kind: "CARD", cardId: card.id })}
                            icon={<CreditCard className="h-4 w-4" />}
                            iconClass={card.cardType === "CREDIT"
                                ? "bg-rose-500/15 text-rose-500"
                                : "bg-slate-500/15 text-slate-500"}
                            title={(
                                <>
                                    <IdentityBadge
                                        acronym={CARD_TYPE_ACRONYM[card.cardType]}
                                        title={`Tarjeta de ${CARD_TYPE_LABEL[card.cardType].toLowerCase()}`}
                                    />
                                    <span className="font-mono">{formatLastFour(card)}</span>
                                    {card.brand?.trim() && (
                                        <span className="truncate text-xs font-normal text-text-tertiary">
                                            {card.brand.trim()}
                                        </span>
                                    )}
                                </>
                            )}
                            subtitle={[
                                issuerOf(card),
                                card.isUnconfirmed ? "sin revisar" : null,
                            ].filter(Boolean).join(" · ")}
                        />
                    </li>
                ))}

                {!isEmpty && matches.accounts.length === 0 && matches.cards.length === 0 && (
                    <li className="px-1 py-2 text-xs text-text-tertiary">
                        Ninguna coincide con «{query}».
                    </li>
                )}
            </ul>

            {allowExternal && (
                <Option
                    selected={value.kind === "EXTERNAL"}
                    onClick={() => choose({ kind: "EXTERNAL" })}
                    icon={<UserX className="h-4 w-4" />}
                    iconClass="bg-slate-500/15 text-slate-400"
                    title="No es una cuenta mía"
                    subtitle="De otra persona o de un comercio"
                />
            )}

            {/* Registrar lo que falta: una sola acción, y el tipo después.
                Antes eran dos botones sueltos donde solo el de cuenta ofrecía
                registrar el número leído — aunque el escaneo hubiera leído una
                tarjeta, que es lo que pasa la mitad de las veces. */}
            <div className="mt-1 border-t border-border/40 pt-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                    ¿No está en la lista?
                </p>

                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-accent-primary/45 bg-accent-primary/10 p-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-primary/20 text-accent-primary">
                        <Plus className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-text-primary">
                            {registersScanned
                                ? <>Registrar <span className="font-mono">{lastFourOfDisplay(scannedNumber!)}</span></>
                                : "Nueva cuenta o tarjeta"}
                        </span>
                        <span className="block text-[11px] text-text-tertiary">
                            Elige qué es y lo damos de alta
                        </span>
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {/* La detectada va primera: es la respuesta más probable,
                        pero la otra queda a un toque porque se equivoca. */}
                    {scannedKind === "CARD" ? (
                        <>
                            {cardTrigger}
                            {accountTrigger}
                        </>
                    ) : (
                        <>
                            {accountTrigger}
                            {cardTrigger}
                        </>
                    )}
                </div>

                {registersScanned && (
                    <button
                        type="button"
                        onClick={() => setCreatingOther(true)}
                        className="mt-2 w-full text-center text-[11px] text-text-tertiary underline underline-offset-2 hover:text-text-secondary"
                    >
                        Crear otra cuenta o tarjeta
                    </button>
                )}
            </div>

        </FormSheet>
    );
}

/**
 * De qué banco es. Cuando no cuelga de ninguno lo dice en vez de callarlo:
 * una cuenta huérfana —las que nacen de un escaneo que no dedujo el emisor—
 * se vería igual que una bien atada, y el usuario nunca sabría cuál le falta
 * mantenimiento en Bancos.
 */
function issuerOf(entity: { institutionName?: string }): string {
    return entity.institutionName ?? "Sin institución";
}

interface OptionProps {
    selected: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    iconClass: string;
    /** Texto, o el acrónimo y el número compuestos como nodo. */
    title: React.ReactNode;
    subtitle?: string;
}

function Option({ selected, onClick, icon, iconClass, title, subtitle }: OptionProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                selected
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border/40 hover:border-border",
            )}
        >
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconClass)}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 truncate text-sm font-medium text-text-primary">{title}</span>
                {subtitle && (
                    <span className="block truncate text-[11px] text-text-tertiary">{subtitle}</span>
                )}
            </span>
            {selected && <Check className="h-4 w-4 shrink-0 text-accent-primary" />}
        </button>
    );
}

/**
 * Disparador de los formularios de alta. Reenvía sus props: `FormSheet` monta
 * el trigger con `asChild`, así que el `onClick` que abre la hoja llega aquí
 * como prop y un componente que la descarte se pinta pero no abre nada.
 */
function CreateButton({
    label, hint, icon, iconClass, className, ...props
}: {
    label: string;
    /** Qué cabe dentro, para no tener que abrir el formulario y averiguarlo. */
    hint: string;
    icon: React.ReactNode;
    iconClass: string;
} & React.ComponentProps<"button">) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                // La misma forma que las opciones de arriba —icono, título,
                // subtítulo— para que se lean como algo elegible. Antes eran
                // cajas punteadas con texto atenuado del tamaño de un pie de
                // página, y parecían desactivadas.
                "flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border/60 p-2.5 text-left transition-colors hover:border-accent-primary hover:bg-accent-primary/5",
                className,
            )}
        >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", iconClass)}>
                {icon}
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-text-primary">{label}</span>
                <span className="block truncate text-[10px] text-text-tertiary">{hint}</span>
            </span>
        </button>
    );
}

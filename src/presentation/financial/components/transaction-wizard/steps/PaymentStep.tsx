"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, CreditCard } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { StepHeading } from "../WizardShell";
import { PaymentSourceSheet, type PaymentPick } from "@/presentation/bank/components/PaymentSourceSheet";
import { type PaymentSource } from "@/presentation/bank/components/PaymentSourcePicker";
import {
    ACCOUNT_TYPE_ACRONYM, ACCOUNT_TYPE_LABEL, CARD_TYPE_ACRONYM, CARD_TYPE_LABEL,
    UNKNOWN_TYPE_ACRONYM, cardLabel,
} from "@/lib/bank-identity-label";
import { formatIdentityNumber, identityNumberFromDisplay } from "@/lib/format-bank-number";
import { IdentityBadge } from "@/presentation/bank/components/IdentityBadge";
import type { BankAccount, BankCard, BankInstitution } from "@/domain/entities/bank";
import type { ScannedAccountDecision, ScannedAccountView } from "@/application/services/bank-service";

interface PaymentStepProps {
    accounts: BankAccount[];
    cards: BankCard[];
    value: Partial<PaymentSource>;
    onChange: (value: PaymentSource) => void;
    /** El crédito solo aplica a tipos de gasto; con otros se ocultan las tarjetas. */
    creditEligible: boolean;
    /** El tipo mete dinero en una cuenta propia (ingreso, transferencia, retiro). */
    destinationEligible?: boolean;
    /** En un ingreso lo que importa es dónde entró: esa fila va arriba. */
    destinationFirst?: boolean;
    /** Cuenta a la que entró el dinero, cuando el movimiento tiene dos lados. */
    destinationAccountId?: string | null;
    onDestinationChange?: (accountId: string | null) => void;
    /** Lo que el escaneo leyó en cada lado, para enseñarlo mientras no se elija. */
    scannedAccounts?: ScannedAccountView[];
    /**
     * Lo que el usuario decide sobre un número del escaneo. Elegir una cuenta
     * propia lo declara suyo; «no es mía», ajeno. Se guarda con la transacción.
     */
    onScannedDecision?: (raw: string, decision: ScannedAccountDecision) => void;
    institutions?: BankInstitution[];
    onAccountCreated?: (created: { account: BankAccount; institution: BankInstitution | null }) => void;
    onCardCreated?: (created: { card: BankCard; institution: BankInstitution | null }) => void;
}

/**
 * Paso 4 — por dónde pasó el dinero.
 *
 * Una fila por lado y nada más: qué hay ahí ahora, y un toque para cambiarlo.
 * Buscar entre las cuentas propias, decir que es de un tercero o registrar una
 * nueva vive en la hoja que se abre, no aquí — tenerlo todo a la vez convertía
 * una pregunta simple en un formulario largo.
 *
 * `paidWithCredit` no es una pregunta suelta: se deriva de lo que se elige.
 */
export function PaymentStep({
    accounts, cards, value, onChange, creditEligible,
    destinationEligible = false, destinationFirst = false,
    destinationAccountId, onDestinationChange, scannedAccounts = [],
    onScannedDecision, institutions = [], onAccountCreated, onCardCreated,
}: PaymentStepProps) {
    // Un ingreso o una transferencia no se pagan con crédito, así que esas
    // tarjetas no deben ni aparecer como opción.
    const selectableCards = creditEligible ? cards : cards.filter(c => c.cardType === "DEBIT");

    const [editing, setEditing] = useState<"SOURCE" | "DESTINATION" | null>(null);

    // La tarjeta de crédito elegida como origen, si la hay: es lo que decide si
    // el crédito se deriva o lo declara el usuario.
    const creditCard = value.cardId
        ? cards.find(c => c.id === value.cardId && c.cardType === "CREDIT") ?? null
        : null;

    const scanned = (role: "SOURCE" | "DESTINATION") =>
        scannedAccounts.find(a => a.role === role);

    const sourcePick: PaymentPick = value.cardId
        ? { kind: "CARD", cardId: value.cardId }
        : value.accountId
            ? { kind: "ACCOUNT", accountId: value.accountId }
            : { kind: "NONE" };

    const destinationPick: PaymentPick = destinationAccountId
        ? { kind: "ACCOUNT", accountId: destinationAccountId }
        : { kind: "NONE" };

    /**
     * Elegir en un lado también responde de quién es ese número: una cuenta
     * propia lo declara suyo, «no es mía» lo deja fuera de Bancos. Sin esto,
     * confirmar volvería a suponerlo por el lado.
     */
    const declare = (role: "SOURCE" | "DESTINATION", pick: PaymentPick) => {
        const view = scanned(role);
        if (!view || !onScannedDecision || pick.kind === "NONE") return;

        onScannedDecision(view.raw, {
            ownership: pick.kind === "EXTERNAL" ? "EXTERNAL" : "MINE",
        });
    };

    const applySource = (pick: PaymentPick) => {
        declare("SOURCE", pick);

        if (pick.kind === "CARD") {
            const card = cards.find(c => c.id === pick.cardId);
            onChange({
                cardId: pick.cardId,
                accountId: card?.cardType === "DEBIT" ? card.accountId ?? undefined : undefined,
                paidWithCredit: card?.cardType === "CREDIT",
            });
            return;
        }
        onChange({
            accountId: pick.kind === "ACCOUNT" ? pick.accountId : undefined,
            paidWithCredit: false,
        });
    };

    /**
     * El destino solo se ofrece cuando el movimiento tiene dos lados: en una
     * compra el otro lado es el comercio, y no hay nada que elegir.
     *
     * Lo decide el tipo, no el escaneo. Atado a que el escáner hubiera leído un
     * número de destino, un ingreso escrito a mano no ofrecía dónde se acreditó
     * —justo el único dato de cuenta que un ingreso tiene—, y quedaba la fila
     * de origen, que ahí es la del pagador y no es del usuario.
     */
    const hasDestination = !!onDestinationChange
        && (destinationEligible || !!scanned("DESTINATION") || !!destinationAccountId);

    return (
        <>
            <StepHeading
                question={destinationFirst ? "¿Dónde se acreditó?" : "¿Con qué lo pagaste?"}
                hint="Puedes omitirlo si no quieres asociar una cuenta."
            />

            {/* En un ingreso el orden se invierte: primero la cuenta a la que
                entró —la única que el usuario conoce— y después el origen, que
                ahí es el pagador. */}
            <div className={cn("flex flex-col gap-1.5", destinationFirst && "flex-col-reverse")}>
                <SideRow
                    role="SOURCE"
                    label="Origen"
                    text={describe(sourcePick, accounts, cards, scanned("SOURCE"))}
                    onEdit={() => setEditing("SOURCE")}
                />

                {hasDestination && (
                    <SideRow
                        role="DESTINATION"
                        label="Destino"
                        text={describe(destinationPick, accounts, cards, scanned("DESTINATION"))}
                        onEdit={() => setEditing("DESTINATION")}
                    />
                )}
            </div>

            {creditEligible && (
                <CreditRow
                    checked={!!value.paidWithCredit}
                    lockedByCard={creditCard ? cardLabel(creditCard) : null}
                    onChange={(paidWithCredit) => onChange({ ...value, paidWithCredit })}
                />
            )}

            <PaymentSourceSheet
                open={editing === "SOURCE"}
                onOpenChange={open => setEditing(open ? "SOURCE" : null)}
                title="¿De dónde salió?"
                accounts={accounts}
                cards={selectableCards}
                institutions={institutions}
                value={sourcePick}
                onPick={applySource}
                scannedNumber={scanned("SOURCE")?.display}
                scannedKind={scanned("SOURCE")?.kind}
                onAccountCreated={onAccountCreated}
                onCardCreated={onCardCreated}
            />

            <PaymentSourceSheet
                open={editing === "DESTINATION"}
                onOpenChange={open => setEditing(open ? "DESTINATION" : null)}
                title="¿A dónde entró?"
                accounts={accounts}
                // El dinero entra a una cuenta, no a una tarjeta.
                cards={[]}
                institutions={institutions}
                value={destinationPick}
                scannedNumber={scanned("DESTINATION")?.display}
                scannedKind={scanned("DESTINATION")?.kind}
                onPick={pick => {
                    declare("DESTINATION", pick);
                    onDestinationChange?.(pick.kind === "ACCOUNT" ? pick.accountId : null);
                }}
                onAccountCreated={onAccountCreated}
            />
        </>
    );
}

/**
 * «Pagado con tarjeta de crédito», de las dos maneras en que puede saberse.
 *
 * Si el origen ya es una tarjeta de crédito registrada en Bancos, la respuesta
 * está dada: se muestra marcada y sin editar, porque cambiarla contradiría la
 * tarjeta elegida. Si no hay tarjeta —el caso de quien no lleva sus cuentas en
 * Bancos— la pregunta vuelve a ser suya, que es como funcionaba antes.
 *
 * Importa acertar: un gasto a crédito no baja el saldo hoy, lo hace cuando se
 * paga la tarjeta.
 */
function CreditRow({
    checked, lockedByCard, onChange,
}: {
    checked: boolean;
    /** Nombre de la tarjeta que ya lo decide, o null si lo decide el usuario. */
    lockedByCard: string | null;
    onChange: (checked: boolean) => void;
}) {
    const isOn = lockedByCard ? true : checked;

    return (
        <div className={cn(
            "mt-1 flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
            isOn ? "border-accent-primary/50 bg-accent-primary/5" : "border-border/40 bg-bg-secondary/40",
        )}>
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-primary/15 text-accent-primary">
                    <CreditCard className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                    <span className="block text-sm leading-tight text-text-primary">
                        Pagado con tarjeta de crédito
                    </span>
                    <span className="block truncate text-[11px] text-text-tertiary">
                        {lockedByCard
                            ? `Lo define ${lockedByCard}`
                            : isOn
                                ? "No baja el saldo hasta pagar la tarjeta"
                                : "Actívalo si no registras la tarjeta en Bancos"}
                    </span>
                </span>
            </div>

            {lockedByCard ? (
                <span className="shrink-0 rounded-full border border-accent-primary/40 bg-accent-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-primary">
                    Sí
                </span>
            ) : (
                <Switch
                    checked={checked}
                    onChange={onChange}
                    label="Pagado con tarjeta de crédito"
                />
            )}
        </div>
    );
}

function SideRow({
    role, label, text, onEdit,
}: {
    role: "SOURCE" | "DESTINATION";
    label: string;
    /** El acrónimo, el número y el emisor ya compuestos. */
    text: React.ReactNode;
    onEdit: () => void;
}) {
    const isSource = role === "SOURCE";
    const Icon = isSource ? ArrowUpRight : ArrowDownLeft;

    return (
        <button
            type="button"
            onClick={onEdit}
            className="flex w-full items-center gap-2.5 rounded-xl border border-border/40 bg-bg-secondary/50 p-2.5 text-left transition-colors hover:border-border"
        >
            <span className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                isSource ? "bg-rose-500/15 text-rose-500" : "bg-emerald-500/15 text-emerald-500",
            )}>
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-[0.1em] text-text-tertiary">{label}</span>
                <span className="block text-sm text-text-primary">{text}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
        </button>
    );
}

/**
 * Qué poner en la fila: lo elegido, y si no hay nada elegido, lo que el escaneo
 * leyó — que es información aunque no sea una cuenta registrada.
 *
 * Se compone con las mismas piezas que el selector y que el resumen: acrónimo
 * de tres letras, los cuatro últimos dígitos y el emisor debajo. La misma
 * pregunta contestada de tres maneras distintas era lo que hacía difícil
 * reconocer de un vistazo con qué se pagó.
 */
function describe(
    pick: PaymentPick,
    accounts: BankAccount[],
    cards: BankCard[],
    scanned?: ScannedAccountView,
): React.ReactNode {
    const nothing = <span className="text-text-tertiary">Sin elegir</span>;

    if (pick.kind === "CARD") {
        const card = cards.find(c => c.id === pick.cardId);
        if (!card) return nothing;
        return (
            <IdentityLine
                acronym={CARD_TYPE_ACRONYM[card.cardType]}
                meaning={`Tarjeta de ${CARD_TYPE_LABEL[card.cardType].toLowerCase()}`}
                number={formatIdentityNumber(card)}
                sub={[card.brand?.trim(), card.institutionName?.trim()].filter(Boolean).join(" · ")}
            />
        );
    }

    if (pick.kind === "ACCOUNT") {
        const account = accounts.find(a => a.id === pick.accountId);
        if (!account) return nothing;
        return (
            <IdentityLine
                acronym={ACCOUNT_TYPE_ACRONYM[account.accountType]}
                meaning={ACCOUNT_TYPE_LABEL[account.accountType]}
                number={formatIdentityNumber(account)}
                sub={account.institutionName?.trim() ?? ""}
            />
        );
    }

    if (scanned) {
        const matched = scanned.match;
        return (
            <IdentityLine
                acronym={matched ? matched.typeAcronym : UNKNOWN_TYPE_ACRONYM}
                meaning={matched ? matched.typeLabel : "Tipo desconocido: aún sin registrar"}
                number={identityNumberFromDisplay(scanned.display)}
                sub={matched ? (matched.institutionName ?? matched.typeLabel) : "sin registrar"}
                title={scanned.raw}
            />
        );
    }

    return nothing;
}

/** El acrónimo y el número arriba, el emisor debajo. */
function IdentityLine({
    acronym, meaning, number, sub, title,
}: {
    acronym: string;
    meaning: string;
    number: string;
    sub: string;
    title?: string;
}) {
    return (
        <span className="flex min-w-0 flex-col" title={title}>
            <span className="flex items-center gap-1.5">
                <IdentityBadge acronym={acronym} title={meaning} />
                <span className="font-mono">{number}</span>
            </span>
            {sub && <span className="truncate text-[11px] text-text-tertiary">{sub}</span>}
        </span>
    );
}

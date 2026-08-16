"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StepHeading } from "../WizardShell";
import { PaymentSourceSheet, type PaymentPick } from "@/presentation/bank/components/PaymentSourceSheet";
import { type PaymentSource } from "@/presentation/bank/components/PaymentSourcePicker";
import { accountLabel, cardLabel } from "@/lib/bank-identity-label";
import type { BankAccount, BankCard, BankInstitution } from "@/domain/entities/bank";
import type { ScannedAccountDecision, ScannedAccountView } from "@/application/services/bank-service";

interface PaymentStepProps {
    accounts: BankAccount[];
    cards: BankCard[];
    value: Partial<PaymentSource>;
    onChange: (value: PaymentSource) => void;
    /** El crédito solo aplica a tipos de gasto; con otros se ocultan las tarjetas. */
    creditEligible: boolean;
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
    destinationAccountId, onDestinationChange, scannedAccounts = [],
    onScannedDecision, institutions = [], onAccountCreated, onCardCreated,
}: PaymentStepProps) {
    // Un ingreso o una transferencia no se pagan con crédito, así que esas
    // tarjetas no deben ni aparecer como opción.
    const selectableCards = creditEligible ? cards : cards.filter(c => c.cardType === "DEBIT");

    const [editing, setEditing] = useState<"SOURCE" | "DESTINATION" | null>(null);

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

    // El destino solo se ofrece cuando el movimiento tiene dos lados: en una
    // compra el otro lado es el comercio, y no hay nada que elegir.
    const hasDestination = !!onDestinationChange
        && (!!scanned("DESTINATION") || !!destinationAccountId);

    return (
        <>
            <StepHeading
                question="¿Con qué lo pagaste?"
                hint="Puedes omitirlo si no quieres asociar una cuenta."
            />

            <div className="flex flex-col gap-1.5">
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
                onPick={pick => {
                    declare("DESTINATION", pick);
                    onDestinationChange?.(pick.kind === "ACCOUNT" ? pick.accountId : null);
                }}
                onAccountCreated={onAccountCreated}
            />
        </>
    );
}

function SideRow({
    role, label, text, onEdit,
}: {
    role: "SOURCE" | "DESTINATION";
    label: string;
    text: string;
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
                <span className="block truncate text-sm text-text-primary">{text}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
        </button>
    );
}

/**
 * Qué poner en la fila: lo elegido, y si no hay nada elegido, lo que el escaneo
 * leyó — que es información aunque no sea una cuenta registrada.
 */
function describe(
    pick: PaymentPick,
    accounts: BankAccount[],
    cards: BankCard[],
    scanned?: ScannedAccountView,
): string {
    if (pick.kind === "CARD") {
        const card = cards.find(c => c.id === pick.cardId);
        return card ? cardLabel(card) : "Sin elegir";
    }
    if (pick.kind === "ACCOUNT") {
        const account = accounts.find(a => a.id === pick.accountId);
        return account ? accountLabel(account) : "Sin elegir";
    }
    if (scanned) {
        return scanned.match
            ? `${scanned.display} · ${scanned.match.typeLabel}`
            : `${scanned.display} · sin registrar`;
    }
    return "Sin elegir";
}

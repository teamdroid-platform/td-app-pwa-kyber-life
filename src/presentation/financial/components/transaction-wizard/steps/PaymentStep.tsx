"use client";

import { StepHeading } from "../WizardShell";
import { PaymentSourcePicker, type PaymentSource } from "@/presentation/bank/components/PaymentSourcePicker";
import type { BankAccount, BankCard, BankInstitution } from "@/domain/entities/bank";

interface PaymentStepProps {
    accounts: BankAccount[];
    cards: BankCard[];
    value: Partial<PaymentSource>;
    onChange: (value: PaymentSource) => void;
    /** El crédito solo aplica a tipos de gasto; con otros se ocultan las tarjetas. */
    creditEligible: boolean;
    /** Contexto sobre el pago que no es la elección, p. ej. lo que trajo un escaneo. */
    hint?: React.ReactNode;
    /** Emisores para dar de alta una cuenta o tarjeta sin salir del paso. */
    institutions?: BankInstitution[];
    onAccountCreated?: (created: { account: BankAccount; institution: BankInstitution | null }) => void;
    onCardCreated?: (created: { card: BankCard; institution: BankInstitution | null }) => void;
}

/**
 * Paso 4 — de dónde salió el dinero.
 *
 * `paidWithCredit` ya no es una pregunta suelta: se deriva de lo que se elige.
 * Elegir una tarjeta de crédito difiere el gasto; cualquier otra cosa no.
 */
export function PaymentStep({
    accounts, cards, value, onChange, creditEligible, hint,
    institutions, onAccountCreated, onCardCreated,
}: PaymentStepProps) {
    // Un ingreso o una transferencia no se pagan con crédito, así que esas
    // tarjetas no deben ni aparecer como opción.
    const selectableCards = creditEligible ? cards : cards.filter(c => c.cardType === "DEBIT");

    return (
        <>
            <StepHeading
                question="¿Con qué lo pagaste?"
                hint="Puedes omitirlo si no quieres asociar una cuenta."
            />
            {hint}
            <PaymentSourcePicker
                accounts={accounts}
                cards={selectableCards}
                value={value}
                onChange={onChange}
                institutions={institutions}
                onAccountCreated={onAccountCreated}
                onCardCreated={onCardCreated}
            />
        </>
    );
}

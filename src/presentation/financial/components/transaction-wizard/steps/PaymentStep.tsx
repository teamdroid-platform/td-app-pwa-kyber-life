"use client";

import { StepHeading } from "../WizardShell";
import { PaymentSourcePicker, type PaymentSource } from "@/presentation/bank/components/PaymentSourcePicker";
import type { BankAccount, BankCard } from "@/domain/entities/bank";

interface PaymentStepProps {
    accounts: BankAccount[];
    cards: BankCard[];
    value: Partial<PaymentSource>;
    onChange: (value: PaymentSource) => void;
    /** El crédito solo aplica a tipos de gasto; con otros se ocultan las tarjetas. */
    creditEligible: boolean;
}

/**
 * Paso 4 — de dónde salió el dinero.
 *
 * `paidWithCredit` ya no es una pregunta suelta: se deriva de lo que se elige.
 * Elegir una tarjeta de crédito difiere el gasto; cualquier otra cosa no.
 */
export function PaymentStep({ accounts, cards, value, onChange, creditEligible }: PaymentStepProps) {
    // Un ingreso o una transferencia no se pagan con crédito, así que esas
    // tarjetas no deben ni aparecer como opción.
    const selectableCards = creditEligible ? cards : cards.filter(c => c.cardType === "DEBIT");

    return (
        <>
            <StepHeading
                question="¿Con qué lo pagaste?"
                hint="Puedes omitirlo si no quieres asociar una cuenta."
            />
            <PaymentSourcePicker
                accounts={accounts}
                cards={selectableCards}
                value={value}
                onChange={onChange}
            />
        </>
    );
}

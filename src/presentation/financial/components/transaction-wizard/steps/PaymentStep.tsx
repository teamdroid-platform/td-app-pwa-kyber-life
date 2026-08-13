"use client";

import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { StepHeading } from "../WizardShell";

interface PaymentStepProps {
    /** Credit only applies to expense-like types; hidden otherwise. */
    creditEligible: boolean;
    paidWithCredit: boolean;
    onPaidWithCreditChange: (value: boolean) => void;
}

/**
 * Paso 4 — cómo se pagó.
 *
 * El switch de crédito es el control más consecuente del formulario (difiere la
 * salida de efectivo hasta que se registra el pago de la tarjeta) y solía ser el
 * menos explicado, así que declara su propio efecto sobre el saldo.
 *
 * El selector de cuenta o tarjeta concreta llega con el módulo Bancos; hasta
 * entonces este paso solo declara si el gasto se difirió a una tarjeta.
 */
export function PaymentStep({
    creditEligible,
    paidWithCredit,
    onPaidWithCreditChange,
}: PaymentStepProps) {
    return (
        <>
            <StepHeading question="¿Con qué lo pagaste?" hint="Puedes omitirlo si no aplica." />

            {creditEligible ? (
                <div
                    className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
                        paidWithCredit ? "border-accent-primary/50 bg-accent-primary/5" : "border-border/40 bg-bg-secondary/40",
                    )}
                >
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-primary/15 text-accent-primary">
                            <CreditCard className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm leading-tight text-text-primary">Pagado con tarjeta de crédito</p>
                            <p className="mt-0.5 text-[11px] leading-tight text-text-tertiary">
                                No baja tu saldo hasta registrar el pago de la tarjeta.
                            </p>
                        </div>
                    </div>
                    <Switch checked={paidWithCredit} onChange={onPaidWithCreditChange} label="Pagado con tarjeta de crédito" />
                </div>
            ) : (
                <p className="text-xs text-text-tertiary">
                    Este tipo de movimiento no admite pago con tarjeta de crédito.
                </p>
            )}
        </>
    );
}

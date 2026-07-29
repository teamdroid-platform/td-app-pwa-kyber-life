"use client";

import type { LucideIcon } from "lucide-react";
import { Banknote, CreditCard, Landmark, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { PickerGridTile } from "../../picker-tiles";
import { StepHeading } from "../WizardShell";

/**
 * Account names are free text, so the icon is inferred from the name. Falls
 * back to a wallet, which reads as "some account" rather than as a wrong guess.
 */
function accountIcon(name: string): LucideIcon {
    const n = name.toLowerCase();
    if (/(visa|master|amex|diners|tarjeta|credit|crédito)/.test(n)) return CreditCard;
    if (/(efectivo|cash|billetera)/.test(n)) return Banknote;
    if (/(ahorro|corriente|banco|cuenta)/.test(n)) return Landmark;
    return Wallet;
}

interface PaymentStepProps {
    accounts: string[];
    value: string;
    onSelect: (name: string) => void;
    /** Credit only applies to expense-like types; hidden otherwise. */
    creditEligible: boolean;
    paidWithCredit: boolean;
    onPaidWithCreditChange: (value: boolean) => void;
}

/**
 * Step 4 — which account paid, and whether it was on credit.
 *
 * The credit switch is the most consequential control in the form (it defers
 * the cash outflow until the card bill is logged) and used to be the least
 * explained, so it states its own effect on the balance.
 */
export function PaymentStep({
    accounts,
    value,
    onSelect,
    creditEligible,
    paidWithCredit,
    onPaidWithCreditChange,
}: PaymentStepProps) {
    return (
        <>
            <StepHeading question="¿Con qué lo pagaste?" hint="Puedes omitirlo si no quieres asociar una cuenta." />

            {accounts.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                    {accounts.map((account) => (
                        <PickerGridTile
                            key={account}
                            label={account}
                            Icon={accountIcon(account)}
                            iconClassName="bg-emerald-500/15 text-emerald-500"
                            selected={value === account}
                            // Tapping the selected tile again clears it, like the other pickers.
                            onClick={() => onSelect(value === account ? "" : account)}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-xs text-text-tertiary">
                    Todavía no tienes cuentas registradas. Puedes crearlas desde la configuración del módulo financiero.
                </p>
            )}

            {creditEligible && (
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
            )}
        </>
    );
}

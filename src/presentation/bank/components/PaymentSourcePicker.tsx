"use client";

import { CreditCard, Landmark, Wallet, PiggyBank, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBankNumber } from "@/lib/format-bank-number";
import type { BankAccount, BankCard, BankAccountType } from "@/domain/entities/bank";
import type { UUID } from "@/domain/core";

const ACCOUNT_ICON: Record<BankAccountType, typeof Landmark> = {
    CHECKING: Landmark,
    SAVINGS: PiggyBank,
    CASH: Wallet,
    INVESTMENT: TrendingUp,
};

export interface PaymentSource {
    accountId?: UUID;
    cardId?: UUID;
    paidWithCredit: boolean;
}

interface PaymentSourcePickerProps {
    accounts: BankAccount[];
    cards: BankCard[];
    value: Partial<PaymentSource>;
    onChange: (value: PaymentSource) => void;
}

/**
 * De dónde salió el dinero. Emite las tres columnas que la transacción
 * necesita, según lo que se eligió:
 *
 *  - Cuenta        → `accountId`, sin diferir.
 *  - Débito        → `cardId` **y** el `accountId` de su cuenta: el gasto sale
 *                    de ahí, la tarjeta es solo el instrumento.
 *  - Crédito       → `cardId` y `paidWithCredit`, sin cuenta: el dinero no sale
 *                    hoy, sale cuando se pague la tarjeta.
 */
export function PaymentSourcePicker({
    accounts, cards, value, onChange,
}: PaymentSourcePickerProps) {
    const isEmpty = accounts.length === 0 && cards.length === 0;

    function selectAccount(account: BankAccount) {
        if (value.accountId === account.id && !value.cardId) {
            onChange({ paidWithCredit: false });
            return;
        }
        onChange({ accountId: account.id, paidWithCredit: false });
    }

    function selectCard(card: BankCard) {
        if (value.cardId === card.id) {
            onChange({ paidWithCredit: false });
            return;
        }
        if (card.cardType === "CREDIT") {
            onChange({ cardId: card.id, paidWithCredit: true });
            return;
        }
        onChange({
            cardId: card.id,
            accountId: card.accountId ?? undefined,
            paidWithCredit: false,
        });
    }

    if (isEmpty) {
        return (
            <p className="text-xs leading-relaxed text-text-tertiary">
                Todavía no registras cuentas ni tarjetas. Puedes crearlas en Bancos y
                volver aquí, o dejar este paso vacío.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {accounts.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {accounts.map(account => {
                        const Icon = ACCOUNT_ICON[account.accountType];
                        const number = formatBankNumber(account, "ACCOUNT");
                        return (
                            <Option
                                key={account.id}
                                selected={value.accountId === account.id && !value.cardId}
                                onClick={() => selectAccount(account)}
                                icon={<Icon className="h-4 w-4" />}
                                iconClass="bg-emerald-500/15 text-emerald-500"
                                title={account.name}
                                subtitle={number || undefined}
                            />
                        );
                    })}
                </div>
            )}

            {cards.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {cards.map(card => {
                        const isCredit = card.cardType === "CREDIT";
                        const number = formatBankNumber(card, "CARD");
                        return (
                            <Option
                                key={card.id}
                                selected={value.cardId === card.id}
                                onClick={() => selectCard(card)}
                                icon={<CreditCard className="h-4 w-4" />}
                                iconClass={isCredit
                                    ? "bg-rose-500/15 text-rose-500"
                                    : "bg-slate-500/15 text-slate-500"}
                                title={card.name}
                                subtitle={[
                                    isCredit ? "Crédito" : "Débito",
                                    number,
                                ].filter(Boolean).join(" · ")}
                            />
                        );
                    })}
                </div>
            )}

            <p className="rounded-xl border border-border/40 bg-bg-secondary/40 p-3 text-[11px] leading-relaxed text-text-tertiary">
                Si eliges una tarjeta de crédito, el gasto <b>no baja tu saldo hoy</b>.
                Baja cuando registres el pago de la tarjeta.
            </p>
        </div>
    );
}

interface OptionProps {
    selected: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    iconClass: string;
    title: string;
    subtitle?: string;
}

function Option({ selected, onClick, icon, iconClass, title, subtitle }: OptionProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                "flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                selected
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border/40 hover:border-border",
            )}
        >
            <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                iconClass,
            )}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-primary">{title}</span>
                {subtitle && (
                    <span className="block truncate text-[11px] text-text-tertiary">{subtitle}</span>
                )}
            </span>
        </button>
    );
}

"use client";

import { CreditCard, Landmark, Wallet, PiggyBank, TrendingUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { accountLabel, cardLabel } from "@/lib/bank-identity-label";
import { AccountFormSheet } from "./AccountFormSheet";
import { CardFormSheet } from "./CardFormSheet";
import type { BankAccount, BankCard, BankAccountType, BankInstitution } from "@/domain/entities/bank";
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

/**
 * Lo que significa pagar con una tarjeta.
 *
 * El crédito difiere el gasto: no sale de ninguna cuenta hoy, sale cuando se
 * pague la tarjeta. El débito sí gasta, y de la cuenta a la que está atado —
 * la tarjeta es solo el instrumento.
 */
export function paymentSourceForCard(card: BankCard): PaymentSource {
    if (card.cardType === "CREDIT") {
        return { cardId: card.id, paidWithCredit: true };
    }
    return { cardId: card.id, accountId: card.accountId ?? undefined, paidWithCredit: false };
}

interface PaymentSourcePickerProps {
    accounts: BankAccount[];
    cards: BankCard[];
    value: Partial<PaymentSource>;
    onChange: (value: PaymentSource) => void;
    /**
     * Emisores disponibles para dar de alta aquí mismo. Junto con los dos
     * callbacks de abajo habilitan la creación en el paso; sin ellos el picker
     * solo elige entre lo que ya existe, como hacía antes.
     */
    institutions?: BankInstitution[];
    onAccountCreated?: (created: { account: BankAccount; institution: BankInstitution | null }) => void;
    onCardCreated?: (created: { card: BankCard; institution: BankInstitution | null }) => void;
    /** Rótulo sobre la lista. Solo hace falta cuando algo la precede. */
    heading?: string;
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
    institutions, onAccountCreated, onCardCreated, heading,
}: PaymentSourcePickerProps) {
    const isEmpty = accounts.length === 0 && cards.length === 0;
    const canCreate = !!institutions && !!onAccountCreated && !!onCardCreated;

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
        onChange(paymentSourceForCard(card));
    }

    const createButtons = canCreate && (
        <div className="grid grid-cols-2 gap-2">
            <AccountFormSheet
                institutions={institutions}
                onCreated={onAccountCreated}
                trigger={<CreateButton label="Nueva cuenta" icon={<Landmark className="h-4 w-4" />} />}
            />
            <CardFormSheet
                institutions={institutions}
                accounts={accounts}
                onCreated={onCardCreated}
                trigger={<CreateButton label="Nueva tarjeta" icon={<CreditCard className="h-4 w-4" />} />}
            />
        </div>
    );

    if (isEmpty) {
        return (
            <div className="flex flex-col gap-3">
                <p className="text-xs leading-relaxed text-text-tertiary">
                    {canCreate
                        ? "Todavía no registras cuentas ni tarjetas. Créala aquí mismo, o deja este paso vacío."
                        : "Todavía no registras cuentas ni tarjetas. Puedes crearlas en Bancos y volver aquí, o dejar este paso vacío."}
                </p>
                {createButtons}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {heading && (
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                    {heading}
                </p>
            )}

            {accounts.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {accounts.map(account => {
                        const Icon = ACCOUNT_ICON[account.accountType];
                        return (
                            <Option
                                key={account.id}
                                selected={value.accountId === account.id && !value.cardId}
                                onClick={() => selectAccount(account)}
                                icon={<Icon className="h-4 w-4" />}
                                iconClass="bg-emerald-500/15 text-emerald-500"
                                title={accountLabel(account)}
                                // El título ya lleva el número; repetirlo debajo
                                // llenaba la fila de lo mismo dos veces.
                                subtitle={[
                                    account.institutionName,
                                    // Detectada por un escaneo y aún sin revisar:
                                    // se puede usar, pero no cuenta para los
                                    // totales hasta confirmarla en Bancos.
                                    account.isUnconfirmed ? "sin revisar" : null,
                                ].filter(Boolean).join(" · ") || undefined}
                            />
                        );
                    })}
                </div>
            )}

            {cards.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {cards.map(card => {
                        const isCredit = card.cardType === "CREDIT";
                        return (
                            <Option
                                key={card.id}
                                selected={value.cardId === card.id}
                                onClick={() => selectCard(card)}
                                icon={<CreditCard className="h-4 w-4" />}
                                iconClass={isCredit
                                    ? "bg-rose-500/15 text-rose-500"
                                    : "bg-slate-500/15 text-slate-500"}
                                title={cardLabel(card)}
                                subtitle={[
                                    isCredit ? "Crédito" : "Débito",
                                    card.institutionName,
                                    card.isUnconfirmed ? "sin revisar" : null,
                                ].filter(Boolean).join(" · ")}
                            />
                        );
                    })}
                </div>
            )}

            {createButtons}

            {cards.some(c => c.cardType === "CREDIT") && (
                <p className="rounded-xl border border-border/40 bg-bg-secondary/40 p-3 text-[11px] leading-relaxed text-text-tertiary">
                    Si eliges una tarjeta de crédito, el gasto <b>no baja tu saldo hoy</b>.
                    Baja cuando registres el pago de la tarjeta.
                </p>
            )}
        </div>
    );
}

/**
 * Disparador de los formularios de alta, al pie de las opciones.
 *
 * Reenvía todo lo que reciba: `FormSheet` monta su trigger con `asChild`, así
 * que el `onClick` que abre la hoja —y el `ref`— llegan aquí como props. Un
 * componente que las descarte se renderiza igual pero no abre nada.
 */
function CreateButton({
    label, icon, className, ...props
}: { label: string; icon: React.ReactNode } & React.ComponentProps<"button">) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 p-2.5 text-xs font-medium text-text-tertiary transition-colors hover:border-accent-primary hover:text-text-primary",
                className,
            )}
        >
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                {icon}
                <Plus className="absolute -bottom-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-bg-primary" />
            </span>
            {label}
        </button>
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, CreditCard, Pencil, Trash2 } from "lucide-react";
import { formatLastFour } from "@/lib/format-bank-number";
import { CARD_TYPE_ACRONYM, CARD_TYPE_LABEL } from "@/lib/bank-identity-label";
import { deleteBankCardAction } from "@/app/actions/bank";
import { IdentityBadge } from "./IdentityBadge";
import { RowActionsSheet, KebabButton } from "./RowActionsSheet";
import { CardFormSheet } from "./CardFormSheet";
import { money } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankCardWithDebt } from "@/application/services/bank-service";
import type { BankAccount, BankInstitution } from "@/domain/entities/bank";

interface CardRowProps {
    card: BankCardWithDebt;
    /** Nombre de la cuenta atada, solo para tarjetas de débito. */
    accountName?: string;
    institutions: BankInstitution[];
    accounts: BankAccount[];
}

/**
 * Una tarjeta dentro del grupo de su emisor. Mismo trato que {@link AccountRow}:
 * acrónimo, número, y en la segunda línea solo lo que aporta —la marca, el
 * corte, la cuenta de la que descuenta un débito—.
 */
export function CardRow({ card, accountName, institutions, accounts }: CardRowProps) {
    const router = useRouter();
    const isCredit = card.cardType === "CREDIT";
    const number = formatLastFour(card);
    const acronym = CARD_TYPE_ACRONYM[card.cardType];

    const [menuOpen, setMenuOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [archiving, setArchiving] = useState(false);

    // Sin deuda es cero, no «menos cero»: el rojo se reserva para lo que de
    // verdad se debe, o dejaría de significar nada.
    const owes = isCredit && card.debt > 0;

    const context = [
        card.brand?.trim() || CARD_TYPE_LABEL[card.cardType],
        isCredit && card.statementDay ? `corte ${card.statementDay}` : null,
        !isCredit && accountName ? `→ ${accountName}` : null,
    ].filter(Boolean).join(" · ");

    async function archive() {
        setArchiving(true);
        const result = await deleteBankCardAction(card.id);
        setArchiving(false);
        setMenuOpen(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success("Tarjeta archivada");
        router.refresh();
    }

    return (
        <div className="flex items-center gap-1 pr-1.5 transition-colors hover:bg-muted/40">
            <Link
                href={`/financial/banks/cards/${card.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3"
            >
                <span className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    isCredit ? "bg-amber-500/12 text-amber-500" : "bg-blue-500/12 text-blue-500",
                )}>
                    <CreditCard className="h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <IdentityBadge
                            acronym={acronym}
                            title={`Tarjeta de ${CARD_TYPE_LABEL[card.cardType].toLowerCase()}`}
                        />
                        {number && <span className="font-mono text-sm font-semibold">{number}</span>}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                        {context}
                        {card.isUnconfirmed && <span className="text-amber-500"> · sin revisar</span>}
                        {!isCredit && !card.accountId && <span className="text-amber-500"> · sin cuenta</span>}
                    </span>
                </span>

                <span className="shrink-0 text-right tabular-nums">
                    {isCredit ? (
                        <>
                            <span className={cn(
                                "block text-sm font-semibold",
                                owes ? "text-rose-500" : "text-muted-foreground",
                            )}>
                                {owes ? `−${money(card.debt)}` : "Sin deuda"}
                            </span>
                            {card.creditLimit != null && (
                                <span className="block text-[10px] text-muted-foreground">
                                    de {money(card.creditLimit)}
                                </span>
                            )}
                        </>
                    ) : (
                        // Una tarjeta de débito no tiene saldo propio: gasta el de su cuenta.
                        <span className="block max-w-[5.5rem] text-[10px] leading-tight text-muted-foreground">
                            usa el saldo de la cuenta
                        </span>
                    )}
                </span>
            </Link>

            <KebabButton
                label={`Acciones de ${acronym} ${number || CARD_TYPE_LABEL[card.cardType]}`}
                onClick={() => setMenuOpen(true)}
            />

            <RowActionsSheet
                open={menuOpen}
                onOpenChange={setMenuOpen}
                title={`${acronym} ${number}`.trim()}
                description={context}
                actions={[
                    {
                        label: "Ver detalle y movimientos",
                        icon: <ArrowUpRight className="h-4 w-4" />,
                        href: `/financial/banks/cards/${card.id}`,
                    },
                    {
                        label: "Editar",
                        hint: "Tipo, número, emisor, corte",
                        icon: <Pencil className="h-4 w-4" />,
                        onSelect: () => { setMenuOpen(false); setEditOpen(true); },
                    },
                    {
                        label: archiving ? "Archivando…" : "Archivar tarjeta",
                        icon: <Trash2 className="h-4 w-4" />,
                        tone: "danger",
                        onSelect: archive,
                    },
                ]}
            />

            <CardFormSheet
                institutions={institutions}
                accounts={accounts}
                card={card}
                open={editOpen}
                onOpenChange={setEditOpen}
            />
        </div>
    );
}

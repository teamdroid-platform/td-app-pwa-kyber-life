"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Landmark, Pencil, PiggyBank, Scale, Trash2, TrendingUp, Wallet } from "lucide-react";
import { formatIdentityNumber } from "@/lib/format-bank-number";
import { ACCOUNT_TYPE_ACRONYM, ACCOUNT_TYPE_LABEL } from "@/lib/bank-identity-label";
import { deleteBankAccountAction } from "@/app/actions/bank";
import { IdentityBadge } from "./IdentityBadge";
import { RowActionsSheet, KebabButton } from "./RowActionsSheet";
import { AccountFormSheet } from "./AccountFormSheet";
import { BalanceSnapshotSheet } from "./BalanceSnapshotSheet";
import { money, shortDate } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankAccountWithBalance } from "@/application/services/bank-service";
import type { BankInstitution } from "@/domain/entities/bank";

const TYPE_ICON = {
    CHECKING: Landmark,
    SAVINGS: PiggyBank,
    CASH: Wallet,
    INVESTMENT: TrendingUp,
} as const;

interface AccountRowProps {
    account: BankAccountWithBalance;
    /** Para el formulario de edición que abre el menú. */
    institutions: BankInstitution[];
}

/**
 * Una cuenta dentro del grupo de su emisor.
 *
 * Cada dato una sola vez: el título decía «Ahorros ••••0814» y el subtítulo
 * repetía «Ahorros · ••••0814» — el mismo texto dos veces, cortado arriba y
 * entero abajo. Ahora el acrónimo dice qué es, el número dice cuál, y la
 * segunda línea guarda lo que ninguno de los dos cuenta.
 *
 * Tocar la fila lleva al detalle; el resto de acciones vive en el menú, no en
 * un lápiz suelto fuera de la tarjeta.
 */
export function AccountRow({ account, institutions }: AccountRowProps) {
    const router = useRouter();
    const Icon = TYPE_ICON[account.accountType];
    const negative = account.balance < 0;
    const number = formatIdentityNumber(account);
    const acronym = ACCOUNT_TYPE_ACRONYM[account.accountType];

    const [menuOpen, setMenuOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [snapshotOpen, setSnapshotOpen] = useState(false);
    const [archiving, setArchiving] = useState(false);

    async function archive() {
        setArchiving(true);
        const result = await deleteBankAccountAction(account.id);
        setArchiving(false);
        setMenuOpen(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success("Cuenta archivada");
        router.refresh();
    }

    return (
        <div className="flex items-center gap-1 pr-1.5 transition-colors hover:bg-muted/40">
            <Link
                href={`/financial/banks/accounts/${account.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3"
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-500">
                    <Icon className="h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <IdentityBadge acronym={acronym} title={ACCOUNT_TYPE_LABEL[account.accountType]} />
                        {number && <span className="font-mono text-sm font-semibold">{number}</span>}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                        {ACCOUNT_TYPE_LABEL[account.accountType]}
                        {/* Una detectada por un escaneo no entra a los saldos hasta
                            que el usuario la revisa. */}
                        {account.isUnconfirmed && (
                            <span className="text-amber-500"> · sin revisar</span>
                        )}
                    </span>
                </span>

                <span className="shrink-0 text-right tabular-nums">
                    <span className={cn(
                        "block text-sm font-semibold",
                        negative ? "text-rose-500" : "text-emerald-500",
                    )}>
                        {negative && "−"}{money(account.balance)}
                    </span>
                    {account.lastSnapshotAt && (
                        <span className="block text-[10px] text-muted-foreground">
                            al {shortDate(account.lastSnapshotAt)}
                        </span>
                    )}
                </span>
            </Link>

            <KebabButton
                label={`Acciones de ${acronym} ${number || ACCOUNT_TYPE_LABEL[account.accountType]}`}
                onClick={() => setMenuOpen(true)}
            />

            <RowActionsSheet
                open={menuOpen}
                onOpenChange={setMenuOpen}
                title={`${acronym} ${number}`.trim()}
                description={`${ACCOUNT_TYPE_LABEL[account.accountType]} · ${money(account.balance)}`}
                actions={[
                    {
                        label: "Ver detalle y movimientos",
                        icon: <ArrowUpRight className="h-4 w-4" />,
                        href: `/financial/banks/accounts/${account.id}`,
                    },
                    {
                        label: "Editar",
                        hint: "Tipo, número, emisor",
                        icon: <Pencil className="h-4 w-4" />,
                        onSelect: () => { setMenuOpen(false); setEditOpen(true); },
                    },
                    {
                        label: "Registrar saldo",
                        hint: "Conciliar con el que declara el banco",
                        icon: <Scale className="h-4 w-4" />,
                        onSelect: () => { setMenuOpen(false); setSnapshotOpen(true); },
                    },
                    {
                        label: archiving ? "Archivando…" : "Archivar cuenta",
                        icon: <Trash2 className="h-4 w-4" />,
                        tone: "danger",
                        onSelect: archive,
                    },
                ]}
            />

            <AccountFormSheet
                institutions={institutions}
                account={account}
                open={editOpen}
                onOpenChange={setEditOpen}
            />
            <BalanceSnapshotSheet
                accountId={account.id}
                open={snapshotOpen}
                onOpenChange={setSnapshotOpen}
            />
        </div>
    );
}

import { getTransactionByIdAction } from "@/app/actions/financial-transactions";
import { getTransactionAccountsAction } from "@/app/actions/bank";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TransactionDetailClient } from "@/presentation/financial/components/TransactionDetailClient";

export default async function TransactionDetailPage({
    params
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params;
    const result = await getTransactionByIdAction(id);

    if (!result.success || !result.data) {
        notFound();
    }

    const transaction = result.data;

    // Se resuelven aquí, en el servidor, para que la pantalla abra completa —
    // igual que hace el detalle del escaneo con las suyas.
    const bankAccounts = await getTransactionAccountsAction(id);

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
            {/* ── Page Header ──────────────────────────────── */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild className="rounded-full shrink-0">
                    <Link href="/financial/transactions">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Detalle de la transacción</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Registro completo de la operación financiera.
                    </p>
                </div>
            </div>

            <TransactionDetailClient
                initialTransaction={transaction}
                bankAccounts={bankAccounts.success ? bankAccounts.data : []}
            />
        </div>
    );
}

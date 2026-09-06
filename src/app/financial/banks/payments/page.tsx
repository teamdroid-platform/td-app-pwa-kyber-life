import { AlertTriangle } from "lucide-react";
import { getPendingCardPaymentsAction } from "@/app/actions/bank";
import { PendingPaymentsList } from "@/presentation/bank/components/PendingPaymentsList";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CardPaymentsPage() {
    const result = await getPendingCardPaymentsAction();

    if (!result.success) {
        return (
            <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
                <h1 className="text-xl font-semibold">No se pudieron cargar los pagos</h1>
                <p className="max-w-sm text-sm text-muted-foreground">{result.error}</p>
            </div>
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-bold tracking-tight">Pagos por confirmar</h1>
                <p className="text-sm text-muted-foreground">
                    Ninguno de estos pagos ha bajado todavía la deuda de su tarjeta.
                </p>
            </header>
            <PendingPaymentsList groups={result.data.groups} cards={result.data.cards} />
        </div>
    );
}

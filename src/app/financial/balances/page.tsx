import { AlertTriangle } from "lucide-react";
import { getBalanceBoardAction } from "@/app/actions/bank";
import { BalanceBoardClient } from "@/presentation/bank/components/BalanceBoardClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BalancesPage() {
    const result = await getBalanceBoardAction();

    if (!result.success) {
        return (
            <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
                <h1 className="text-xl font-semibold">No se pudieron cargar tus cuentas</h1>
                <p className="max-w-sm text-sm text-muted-foreground">{result.error}</p>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
            <BalanceBoardClient entries={result.data} />
        </div>
    );
}

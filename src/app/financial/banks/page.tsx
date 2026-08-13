import { AlertTriangle } from "lucide-react";
import { getBankOverviewAction } from "@/app/actions/bank";
import { BankOverviewClient } from "@/presentation/bank/components/BankOverviewClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BanksPage() {
    const result = await getBankOverviewAction();

    if (!result.success) {
        // Un fallo de lectura no debe parecer "no tienes cuentas": dice qué pasó.
        return (
            <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
                <h1 className="text-xl font-semibold">No se pudo cargar Bancos</h1>
                <p className="max-w-sm text-sm text-muted-foreground">{result.error}</p>
            </div>
        );
    }

    const { accounts, cards, institutions } = result.data;
    const subtitle = accounts.length === 0 && cards.length === 0
        ? "Registra tus bancos, cuentas y tarjetas"
        : `${institutions.length} instituciones · ${accounts.length} cuentas · ${cards.length} tarjetas`;

    return (
        <div className="flex min-h-screen w-full flex-col bg-background">
            <div className="w-full border-b bg-card/50 p-6 backdrop-blur-sm md:px-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Bancos</h1>
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            </div>

            <div className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
                <BankOverviewClient initialData={result.data} />
            </div>
        </div>
    );
}

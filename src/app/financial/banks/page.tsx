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

    // La cabecera vive dentro del cliente: el botón de añadir abre una hoja con
    // estado, y una banda aparte solo servía para separarlo de lo que abre.
    return (
        <div className="flex min-h-screen w-full flex-col bg-background">
            <div className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
                <BankOverviewClient initialData={result.data} />
            </div>
        </div>
    );
}

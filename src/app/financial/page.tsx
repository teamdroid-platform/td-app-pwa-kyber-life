import { Suspense } from "react";
import { FinancialDashboard } from "@/presentation/financial/components/FinancialDashboard";
import { Button } from "@/components/ui/button";
import { Plus, ScanLine, ListChecks } from "lucide-react";
import Link from "next/link";
import { RobotLoader } from "@/components/ui/RobotLoader";
import { NewTransactionDialog } from "@/presentation/financial/components/ai-capture/NewTransactionDialog";

export default function FinancialOverviewPage() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Resumen financiero</h1>
                    <p className="text-muted-foreground mt-1">
                        Controla tus ingresos, gastos y salud financiera de un vistazo.
                    </p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                    <Button variant="outline" asChild className="h-10 flex-1 rounded-xl sm:flex-initial">
                        <Link href="/financial/scans">
                            <ScanLine className="h-4 w-4 text-accent-primary" />
                            Escaneos
                        </Link>
                    </Button>
                    <Button variant="outline" asChild className="h-10 flex-1 rounded-xl sm:flex-initial">
                        <Link href="/financial/transactions">
                            <ListChecks className="h-4 w-4 text-accent-primary" />
                            Transacciones
                        </Link>
                    </Button>
                    <NewTransactionDialog>
                        <Button className="h-10 flex-1 rounded-xl sm:flex-initial">
                            <Plus className="h-4 w-4" />
                            Agregar
                        </Button>
                    </NewTransactionDialog>
                </div>
            </div>

            <Suspense fallback={
                <div className="flex items-center justify-center min-h-[400px]">
                    <RobotLoader text="Cargando resumen" />
                </div>
            }>
                <FinancialDashboard />
            </Suspense>
        </div>
    );
}

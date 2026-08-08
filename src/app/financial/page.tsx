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
                    <Button variant="outline" asChild className="h-10 flex-1 px-2 sm:px-4 sm:flex-none rounded-xl">
                        <Link href="/financial/scans">
                            <ScanLine className="mr-1.5 h-4 w-4 shrink-0 text-accent-primary" />
                            <span className="truncate text-xs sm:text-sm">Escaneos</span>
                        </Link>
                    </Button>
                    <Button variant="outline" asChild className="h-10 flex-1 px-2 sm:px-4 sm:flex-none rounded-xl">
                        <Link href="/financial/transactions">
                            <ListChecks className="mr-1.5 h-4 w-4 shrink-0 text-accent-primary" />
                            <span className="truncate text-xs sm:text-sm">Transacciones</span>
                        </Link>
                    </Button>
                    <NewTransactionDialog>
                        <Button className="h-10 flex-1 px-2 sm:px-4 sm:flex-none rounded-xl">
                            <Plus className="mr-1.5 h-4 w-4 shrink-0" />
                            <span className="truncate text-xs sm:text-sm">Agregar</span>
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

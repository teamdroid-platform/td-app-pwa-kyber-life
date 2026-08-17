import { Metadata } from "next";
import { getScannerTransactionByIdAction } from "@/app/actions/financial-inbox";
import { getInstitutionsAction } from "@/app/actions/financial-settings";
import { getScannedAccountsPreviewAction } from "@/app/actions/bank";
import { getInstitutionMatchInfo, INSTITUTION_MATCH_THRESHOLD } from "@/lib/institution-match";
import { ScanDetailsForm } from "@/presentation/financial/components/ScanDetailsForm";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
    title: "Detalles de Escaneo - KyberLife",
    description: "Revisa y edita los detalles de una transacción escaneada",
};

interface ScanDetailsPageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function ScanDetailsPage({ params }: ScanDetailsPageProps) {
    const { id } = await params;
    const response = await getScannerTransactionByIdAction(id);

    if (!response.success || !response.data) {
        return (
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex flex-col items-center justify-center h-[50vh] gap-4 text-center">
                    <AlertCircle className="h-12 w-12 text-destructive" />
                    <h2 className="text-2xl font-bold tracking-tight">Escaneo no encontrado</h2>
                    <p className="text-muted-foreground">
                        {response.error || "La transacción que buscas no existe o no tienes permiso para verla."}
                    </p>
                    <Link href="/financial/scans">
                        <Button variant="default" className="mt-4">
                            Volver a la bandeja
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    // Resolve the scanned merchant against existing institutions on the server,
    // so the form renders the final name immediately (no client-side flash).
    // Las cuentas del escaneo se identifican en la misma pasada, por lo mismo.
    const [institutions, scannedAccounts] = await Promise.all([
        getInstitutionsAction(),
        getScannedAccountsPreviewAction(id),
    ]);
    const institutionMatch = getInstitutionMatchInfo(
        response.data.merchant,
        institutions.map((i) => i.name),
    );
    const resolvedInstitutionName =
        institutionMatch.matchedName && institutionMatch.score >= INSTITUTION_MATCH_THRESHOLD
            ? institutionMatch.matchedName
            : response.data.merchant ?? "";

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            {/* ── Page Header ──────────────────────────────── */}
            <div className="flex items-center gap-4 mb-6">
                <Link 
                    href="/financial/scans"
                    className="p-2 -ml-2 rounded-full hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
                    title="Volver a escaneos"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-text-primary">Detalles de Escaneo</h2>
                    <p className="text-sm text-text-secondary mt-1">
                        Revisa todos los datos extraídos y edítalos antes de confirmar.
                    </p>
                </div>
            </div>

            <div className="mt-8 max-w-4xl mx-auto">
                <ScanDetailsForm
                    initialData={response.data}
                    resolvedInstitutionName={resolvedInstitutionName}
                    institutionMatch={institutionMatch}
                    scannedAccounts={scannedAccounts.success ? scannedAccounts.data : []}
                />
            </div>
        </div>
    );
}

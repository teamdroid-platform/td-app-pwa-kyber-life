import { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionForm } from "@/presentation/financial/components/TransactionForm";
import { AiCaptureFlow } from "@/presentation/financial/components/ai-capture/AiCaptureFlow";
import { FINANCIAL_FLAGS } from "@/lib/feature-flags";

export const metadata: Metadata = {
    title: "Nueva transacción - KyberLife",
    description: "Registra una nueva transacción financiera dictándola, escribiéndola o con el formulario",
};

/**
 * Capture a transaction. With assisted capture enabled the page opens on the
 * method chooser; with the flag off it is the manual form it has always been.
 *
 * The chrome the manual form used to carry (title, back link) now lives inside
 * each capture screen's own header, so the flow fills the viewport on a phone
 * instead of scrolling a page heading out of the way.
 */
export default function NewTransactionPage() {
    if (!FINANCIAL_FLAGS.AI_CAPTURE_ENABLED) {
        return (
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <div className="mb-6 flex items-center space-x-2">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/financial/transactions">
                            <ArrowLeft className="h-5 w-5" />
                            <span className="sr-only">Volver a transacciones</span>
                        </Link>
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Nueva transacción</h2>
                        <p className="text-muted-foreground">Ingresa un nuevo registro financiero.</p>
                    </div>
                </div>

                <div className="mt-8">
                    <TransactionForm />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-[calc(100vh-8rem)] flex-1 flex-col p-4 pt-6 md:p-8">
            {/* `useSearchParams` inside the flow needs a boundary to stream past. */}
            <Suspense
                fallback={
                    <div className="flex min-h-[50vh] flex-1 items-center justify-center text-text-tertiary">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                }
            >
                <AiCaptureFlow />
            </Suspense>
        </div>
    );
}

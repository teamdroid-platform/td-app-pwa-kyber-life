import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionForm } from "@/presentation/financial/components/TransactionForm";
import { AiCaptureReview } from "@/presentation/financial/components/ai-capture/AiCaptureReview";
import { FINANCIAL_FLAGS } from "@/lib/feature-flags";

export const metadata: Metadata = {
    title: "Nueva transacción - KyberLife",
    description: "Registra una nueva transacción financiera manual",
};

/**
 * Capture a transaction by hand, and review one captured by voice or text.
 *
 * Choosing the method happens in a dialog over whatever screen the user was on
 * (`NewTransactionDialog`); this route is where the work with real content
 * lives. `?mode=review` is set by that dialog once it has an extraction to hand
 * over — every other entry lands on the manual form, as it always has.
 */
export default async function NewTransactionPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const isReview = FINANCIAL_FLAGS.AI_CAPTURE_ENABLED && params.mode === "review";

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
                    <p className="text-muted-foreground">
                        {isReview ? "Revisa lo que entendimos antes de guardar." : "Ingresa un nuevo registro financiero."}
                    </p>
                </div>
            </div>

            <div className="mt-8">{isReview ? <AiCaptureReview /> : <TransactionForm />}</div>
        </div>
    );
}

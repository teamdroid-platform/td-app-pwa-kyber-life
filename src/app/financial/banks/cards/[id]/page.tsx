import { notFound } from "next/navigation";
import { getBankCardDetailAction } from "@/app/actions/bank";
import { CardDetailClient } from "@/presentation/bank/components/CardDetailClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BankCardPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const result = await getBankCardDetailAction(id);

    if (!result.success) notFound();

    return (
        <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
            <CardDetailClient initialData={result.data} />
        </div>
    );
}

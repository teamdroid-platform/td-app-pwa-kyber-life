import { notFound } from "next/navigation";
import { getBankAccountDetailAction } from "@/app/actions/bank";
import { AccountDetailClient } from "@/presentation/bank/components/AccountDetailClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BankAccountPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const result = await getBankAccountDetailAction(id);

    if (!result.success) notFound();

    return (
        <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
            <AccountDetailClient initialData={result.data} />
        </div>
    );
}

import { Suspense } from "react";
import { TransactionTimeline } from "@/presentation/financial/components/TransactionTimeline";
import { TransactionFilters } from "@/presentation/financial/components/TransactionFilters";
import { searchPaginatedTransactionsAction, searchAllFilteredTransactionsAction } from "@/app/actions/financial-transactions";
import { getCategoriesAction, getInstitutionsAction } from "@/app/actions/financial-settings";
import { Button } from "@/components/ui/button";
import { Plus, Inbox as InboxIcon } from "lucide-react";
import Link from "next/link";
import { TransactionTabs } from "@/presentation/financial/components/TransactionTabs";
import { defaultHubCustomRange } from "@/lib/date-range";

// Always render fresh on the server so a type-filter navigation refetches the
// correctly filtered first page instead of serving a cached route payload.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TransactionsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const query = typeof params.query === 'string' ? params.query : undefined;
    const status = typeof params.status === 'string' ? params.status : undefined;
    const typeParam = params.type;
    const types = typeof typeParam === 'string' && typeParam.length > 0 
        ? typeParam.split(',') 
        : Array.isArray(typeParam) ? typeParam : undefined;

    const categoryId = typeof params.categoryId === 'string' ? params.categoryId : undefined;
    const institutionId = typeof params.institutionId === 'string' ? params.institutionId : undefined;

    const currency = typeof params.currency === 'string' ? params.currency : undefined;
    const range = typeof params.range === 'string' ? params.range : undefined;
    let dateFrom = typeof params.dateFrom === 'string' ? params.dateFrom : undefined;
    let dateTo = typeof params.dateTo === 'string' ? params.dateTo : undefined;

    // Default range: the billing cycle that contains today (22nd of one month →
    // 21st of the next), matching every other date-range filter.
    if (!dateFrom && !dateTo && range !== 'all') {
        const cycle = defaultHubCustomRange();
        dateFrom = new Date(`${cycle.start}T00:00:00`).toISOString();
        dateTo = new Date(`${cycle.end}T23:59:59`).toISOString();
    }

    const [initialResult, allFilteredResult, categories, institutions] = await Promise.all([
        searchPaginatedTransactionsAction({
            query,
            status,
            types,
            currency,
            dateFrom,
            dateTo,
            categoryId,
            institutionId,
            page: 1,
            pageSize: 20,
        }),
        searchAllFilteredTransactionsAction({
            query,
            status,
            types,
            currency,
            dateFrom,
            dateTo,
            categoryId,
            institutionId,
        }),
        getCategoriesAction(),
        getInstitutionsAction()
    ]);

    const initialTransactions = initialResult.success && initialResult.data
        ? initialResult.data.data
        : [];

    const allFilteredTransactions = allFilteredResult.success && allFilteredResult.data
        ? allFilteredResult.data as any[] // we know it's FinancialTransaction[]
        : [];

    // Pass URL filters so the infinite-scroll can re-apply them
    const searchFilters = { query, status, types, currency, dateFrom, dateTo, range, categoryId, institutionId };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Transacciones</h1>
                    <p className="text-muted-foreground mt-2">
                        Revisa y gestiona tus transacciones financieras.
                    </p>
                </div>
                <div className="flex flex-row w-full sm:w-auto gap-2 mt-4 sm:mt-0">
                    <Button variant="outline" asChild className="flex-1 sm:flex-none">
                        <Link href="/financial/scans">
                            <InboxIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">Bandeja</span>
                        </Link>
                    </Button>
                    <Button asChild className="flex-1 sm:flex-none">
                        <Link href="/financial/transactions/new">
                            <Plus className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">Transacción</span>
                        </Link>
                    </Button>
                </div>
            </div>

            <Suspense fallback={<div className="h-10 animate-pulse bg-muted rounded-md" />}>
                {/* The filters travel as their own prop, not as children: the
                    tabs own the toggle that folds them away on mobile. */}
                <TransactionTabs
                    filters={
                        <Suspense fallback={<div className="h-10 animate-pulse bg-muted rounded-md" />}>
                            <TransactionFilters categories={categories} institutions={institutions} />
                        </Suspense>
                    }
                >
                    <Suspense fallback={<div className="h-40 flex items-center justify-center">Cargando transacciones...</div>}>
                        <TransactionTimeline
                            key={JSON.stringify(params)}
                            initialTransactions={initialTransactions}
                            allFilteredTransactions={allFilteredTransactions}
                            searchFilters={searchFilters}
                        />
                    </Suspense>
                </TransactionTabs>
            </Suspense>
        </div>
    );
}

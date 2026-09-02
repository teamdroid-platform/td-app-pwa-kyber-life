import { Suspense } from "react";
import { TransactionTimeline } from "@/presentation/financial/components/TransactionTimeline";
import { TransactionFilters } from "@/presentation/financial/components/TransactionFilters";
import { searchPaginatedTransactionsAction, searchAllFilteredTransactionsAction } from "@/app/actions/financial-transactions";
import type { FinancialTransaction } from "@/domain/entities/financial";
import { balanceService, periodSettingsService } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import { getCategoriesAction, getInstitutionsAction } from "@/app/actions/financial-settings";
import { Button } from "@/components/ui/button";
import { Plus, Inbox as InboxIcon, PieChart } from "lucide-react";
import Link from "next/link";
import { TransactionTabs } from "@/presentation/financial/components/TransactionTabs";
import { NewTransactionDialog } from "@/presentation/financial/components/ai-capture/NewTransactionDialog";
import { cycleRangeContaining, toFullDayIsoRange } from "@/lib/date-range";

// Always render fresh on the server so a type-filter navigation refetches the
// correctly filtered first page instead of serving a cached route payload.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Etiqueta legible del rango activo, para las explicaciones del selector de balance. */
function formatRangeLabel(startISO?: string, endISO?: string): string {
    if (!startISO || !endISO) return "Todo el tiempo";
    const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    const start = fmt(startISO);
    const end = fmt(endISO);
    return start === end ? start : `${start} – ${end}`;
}

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

    // Rango por defecto: el ciclo que contiene hoy, con el día de corte que el
    // usuario haya guardado para Finanzas.
    if (!dateFrom && !dateTo && range !== 'all') {
        const userId = await requireUserId();
        const cycleStartDay = await periodSettingsService.getCycleStartDay(userId, 'FINANCIAL');
        const iso = toFullDayIsoRange(cycleRangeContaining(cycleStartDay));
        dateFrom = iso.startDate;
        dateTo = iso.endDate;
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
        getInstitutionsAction(),
    ]);

    const initialTransactions = initialResult.success && initialResult.data
        ? initialResult.data.data
        : [];

    const allFilteredTransactions: FinancialTransaction[] = allFilteredResult.success && allFilteredResult.data
        ? allFilteredResult.data
        : [];

    // Los tres balances sobre EXACTAMENTE las filas que el listado muestra, no
    // sobre el rango entero: la lista filtra además por categoría, tipo,
    // estado, moneda y texto. Se le pasan las transacciones ya consultadas
    // arriba en vez de que el servicio las vuelva a leer, así el chip del
    // resumen y el gráfico de abajo no pueden contradecirse.
    const balances = await balanceService
        .getBalanceSet(await requireUserId(), {
            startDate: dateFrom ? new Date(dateFrom) : undefined,
            endDate: dateTo ? new Date(dateTo) : undefined,
            transactions: allFilteredTransactions,
        })
        .catch((error) => {
            console.error("Error fetching balance set:", error);
            return null;
        });

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
                <div className="flex w-full sm:w-auto gap-2 mt-4 sm:mt-0">
                    <Button variant="outline" asChild className="h-10 flex-1 px-2 sm:px-4 sm:flex-none">
                        <Link href="/financial">
                            <PieChart className="mr-1.5 h-4 w-4 shrink-0 text-accent-primary" />
                            <span className="truncate text-xs sm:text-sm">Resumen</span>
                        </Link>
                    </Button>
                    <Button variant="outline" asChild className="h-10 flex-1 px-2 sm:px-4 sm:flex-none">
                        <Link href="/financial/scans">
                            <InboxIcon className="mr-1.5 h-4 w-4 shrink-0 text-accent-primary" />
                            <span className="truncate text-xs sm:text-sm">Escaneos</span>
                        </Link>
                    </Button>
                    <NewTransactionDialog>
                        <Button className="h-10 flex-1 px-2 sm:px-4 sm:flex-none">
                            <Plus className="mr-1.5 h-4 w-4 shrink-0" />
                            <span className="truncate text-xs sm:text-sm">Agregar</span>
                        </Button>
                    </NewTransactionDialog>
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
                            balances={balances}
                            rangeLabel={formatRangeLabel(dateFrom, dateTo)}
                        />
                    </Suspense>
                </TransactionTabs>
            </Suspense>
        </div>
    );
}

import { Suspense } from "react";
import { TransactionTimeline } from "@/presentation/financial/components/TransactionTimeline";
import { TransactionFilters } from "@/presentation/financial/components/TransactionFilters";
import { searchPaginatedTransactionsAction, searchAllFilteredTransactionsAction } from "@/app/actions/financial-transactions";
import type { FinancialTransaction } from "@/domain/entities/financial";
import { DEFAULT_CYCLE_START_DAY } from "@/domain/entities/period";
import { balanceService, periodSettingsService } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import { getCategoriesAction, getInstitutionsAction } from "@/app/actions/financial-settings";
import { Plus } from "lucide-react";
import { TransactionTabs } from "@/presentation/financial/components/TransactionTabs";
import { NewTransactionDialog } from "@/presentation/financial/components/ai-capture/NewTransactionDialog";
import { cycleRangeContaining, toFullDayIsoRange } from "@/lib/date-range";
import { normalizeTransactionSort } from "@/domain/pagination";

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

/**
 * Día de corte de Finanzas para el usuario autenticado. `requireUserId()` lanza
 * "Unauthorized" cuando no hay sesión de Supabase que resolver —los modos MOCK
 * y MEMORY, donde la sesión vive en la cookie `kyber_session`—, así que aquí se
 * atrapa y se degrada al defecto del ámbito en vez de tumbar la página, con el
 * mismo criterio tolerante que ya usa `getAllCycleStartDaysAction`.
 */
async function resolveFinancialCycleStartDay(): Promise<number> {
    try {
        const userId = await requireUserId();
        return await periodSettingsService.getCycleStartDay(userId, 'FINANCIAL');
    } catch {
        return DEFAULT_CYCLE_START_DAY.FINANCIAL;
    }
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
    // El orden de la tabla. Se valida contra la lista blanca del dominio antes
    // de viajar: acaba en un `.order()`, que construye SQL con el campo.
    const sort = normalizeTransactionSort(params.sortBy, params.sortDir);

    const range = typeof params.range === 'string' ? params.range : undefined;
    let dateFrom = typeof params.dateFrom === 'string' ? params.dateFrom : undefined;
    let dateTo = typeof params.dateTo === 'string' ? params.dateTo : undefined;

    // Rango por defecto: el ciclo que contiene hoy, con el día de corte que el
    // usuario haya guardado para Finanzas. Si no hay sesión que resolver —modos
    // MOCK y MEMORY, donde la sesión es la cookie y no Supabase— se degrada al
    // defecto en vez de tumbar la pantalla.
    if (!dateFrom && !dateTo && range !== 'all') {
        const cycleStartDay = await resolveFinancialCycleStartDay();
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
            sortBy: sort?.field,
            sortDir: sort?.direction,
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
    // El orden viaja con los filtros para que el scroll infinito siga pidiendo
    // las páginas siguientes en el mismo orden que la primera.
    const searchFilters = { query, status, types, currency, dateFrom, dateTo, range, categoryId, institutionId, sortBy: sort?.field, sortDir: sort?.direction };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Transacciones</h1>
                <p className="text-muted-foreground mt-2">
                    Revisa y gestiona tus transacciones financieras.
                </p>
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

            {/* Agregar deja de ocupar una fila entera arriba y pasa a flotar
                sobre la lista: en esta pantalla se viene a leer, y el alto que
                comía la botonera vale más como transacciones a la vista.
                El margen inferior respeta el área segura del teléfono, para que
                no quede debajo de la barra del navegador. */}
            <NewTransactionDialog>
                <button
                    type="button"
                    aria-label="Agregar transacción"
                    className="fixed right-5 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-50 grid h-14 w-14 place-items-center rounded-full bg-accent-primary text-white shadow-xl shadow-accent-primary/25 transition-transform hover:scale-105 active:scale-95"
                >
                    <Plus className="h-6 w-6" />
                </button>
            </NewTransactionDialog>
        </div>
    );
}

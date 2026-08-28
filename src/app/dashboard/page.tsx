import {
    analyticsService, balanceService, bankService, financialDashboardService, financialInboxService,
    initializeContainer, userRepository,
} from "@/infrastructure/container";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { redirect } from "next/navigation";
import { HomeHub, type HomeMetrics } from "@/presentation/components/dashboard/HomeHub";
import { summarizeBalanceFreshness } from "@/lib/balance-freshness";
import { cumulative, formatWhen, percentChange, sumBalances, type DonutSlice } from "@/lib/home-overview";
import { DONUT_COLORS } from "@/presentation/components/dashboard/home/CategoryDonutCard";
import { isIncomeType } from "@/domain/services/financial-balance";
import type { ActivityItem } from "@/presentation/components/dashboard/home/RecentActivityCard";
import type { DashboardOverview, FinancialKPIs } from "@/application/services/financial-dashboard-service";
import type { BalanceSet } from "@/application/services/balance-service";
import type { FinancialTransaction } from "@/domain/entities/financial";

/**
 * «Viernes, 21 de agosto». Se arma en el servidor para que no baile al hidratar,
 * y solo se levanta la primera letra: en español el mes no va en mayúscula.
 */
function todayLabel(): string {
    const text = new Date().toLocaleDateString("es-EC", {
        weekday: "long", day: "numeric", month: "long",
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * ¿Vale la pena medir el tablero para quien está pidiendo la página?
 *
 * El tablero solo se dibuja de `lg` para arriba, y sus consultas recorren el
 * historial de movimientos y de compras. En un teléfono serían medio segundo
 * largo de espera por algo que nadie va a ver, así que ahí no se piden.
 *
 * La duda se resuelve a favor de medir: tabletas y agentes que no se declaran
 * reciben el tablero completo. Equivocarse hacia el móvil escondería el
 * tablero en una pantalla que sí lo muestra; equivocarse hacia el escritorio
 * solo cuesta una consulta de más.
 */
async function wantsDashboard(): Promise<boolean> {
    const { device } = userAgent({ headers: await headers() });
    return device.type !== "mobile";
}

/** El mes corriente y el anterior, para poder comparar el gasto contra algo. */
function periods(now: Date) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevious = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { startOfMonth, endOfMonth, startOfPrevious, endOfPrevious };
}

export default async function DashboardPage() {
    await initializeContainer();

    let userId: string | undefined;
    let userFirstName: string | undefined;

    if (process.env.DATA_SOURCE === "SUPABASE") {
        // The memoized resolver, not a fresh client: the layout above already
        // asked who the user is in this same render, and `auth.getUser()`
        // validates against the auth server every time it is called.
        const { getAuthUser } = await import("@/infrastructure/supabase/auth-user");
        const user = await getAuthUser();
        userId = user?.id;
        userFirstName = user?.user_metadata?.first_name;
    } else {
        const cookieStore = await cookies();
        userId = cookieStore.get("kyber_session")?.value;
        if (userId) {
            const user = await userRepository.findById(userId);
            userFirstName = user?.firstName || undefined;
        }
    }

    if (!userId) {
        redirect("/auth/login");
    }

    const now = new Date();
    const { startOfMonth, endOfMonth, startOfPrevious, endOfPrevious } = periods(now);
    const withDashboard = await wantsDashboard();

    // Todo en paralelo: son lecturas independientes y encadenarlas solo suma
    // esperas. El resumen del mes va por `getDashboardOverview` porque así los
    // seis bloques salen de una única lectura del historial, no de seis.
    //
    // Las cuatro consultas del tablero se lanzan solo cuando se va a dibujar:
    // son las caras, y en un teléfono no se ve ninguna.
    const [board, pendingScans, overview, previous, recent, purchaseCategories, balanceSet] = await Promise.all([
        bankService.getBalanceBoard(userId),
        financialInboxService.getUnprocessedTransactions(userId),
        withDashboard ? financialDashboardService.getDashboardOverview(userId, startOfMonth, endOfMonth, 1) : null,
        withDashboard ? financialDashboardService.getKPIs(userId, startOfPrevious, endOfPrevious) : null,
        withDashboard ? financialDashboardService.getRecentTransactions(userId, 4) : [],
        withDashboard ? analyticsService.getTopCategories(userId, 5) : [],
        // Los tres balances del mes corriente, para el selector de la tarjeta
        // que hoy pinta `monthNet`. Solo se piden junto al resto del tablero.
        withDashboard ? balanceService.getBalanceSet(userId, { startDate: startOfMonth, endDate: endOfMonth }) : null,
    ]);

    const balances = sumBalances(board);

    const metrics = overview && previous && balanceSet
        ? buildMetrics({ overview, previous, recent, purchaseCategories, balances, balanceSet, now })
        : null;

    return (
        <HomeHub
            userFirstName={userFirstName}
            todayLabel={todayLabel()}
            balances={summarizeBalanceFreshness(board)}
            pendingScans={pendingScans.length}
            metrics={metrics}
        />
    );
}

/** Las cifras del tablero, a partir de lo que devolvieron los servicios. */
function buildMetrics({ overview, previous, recent, purchaseCategories, balances, balanceSet, now }: {
    overview: DashboardOverview;
    previous: FinancialKPIs;
    recent: FinancialTransaction[];
    purchaseCategories: { name: string; value: number; percentage: number }[];
    balances: ReturnType<typeof sumBalances>;
    balanceSet: BalanceSet;
    now: Date;
}): HomeMetrics {
    const daily = overview.dailyBreakdown;

    const slices: DonutSlice[] = purchaseCategories.map((category, index) => ({
        label: category.name,
        value: category.value,
        percentage: category.percentage,
        color: DONUT_COLORS[index % DONUT_COLORS.length],
    }));

    const recentItems: ActivityItem[] = recent.map(transaction => ({
        id: transaction.id!,
        title: transaction.merchant || transaction.description || "Movimiento",
        when: formatWhen(transaction.date, now),
        amount: Number(transaction.amount),
        currency: transaction.currency || overview.kpis.currency,
        kind: isIncomeType(transaction.type)
            ? "income"
            : transaction.type === "TRANSFER" || transaction.type === "WITHDRAWAL" || transaction.type === "OTHER"
                ? "other"
                : "expense",
    }));

    return {
        currency: overview.kpis.currency,
        balances: balanceSet,
        accounts: balances.accounts,
        accountsWithBalance: balances.accountsWithBalance,
        monthIncome: overview.kpis.totalIncome,
        monthExpenses: overview.kpis.totalExpenses,
        monthNet: overview.kpis.netBalance,
        expensesDeltaPct: percentChange(overview.kpis.totalExpenses, previous.totalExpenses),
        pendingTransactions: overview.kpis.pendingTransactionsCount,
        series: {
            dates: daily.map(day => day.date),
            income: daily.map(day => day.income),
            expenses: daily.map(day => day.expenses),
            net: daily.map(day => day.net),
        },
        balanceSeries: cumulative(daily.map(day => day.net)),
        expensesSeries: cumulative(daily.map(day => day.expenses)),
        purchases: {
            slices,
            total: slices.reduce((sum, slice) => sum + slice.value, 0),
        },
        recent: recentItems,
        periodLabel: "Este mes",
    };
}

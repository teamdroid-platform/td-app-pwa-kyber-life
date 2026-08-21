import { bankService, financialInboxService, initializeContainer, userRepository } from "@/infrastructure/container";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeHub } from "@/presentation/components/dashboard/HomeHub";
import { summarizeBalanceFreshness } from "@/lib/balance-freshness";

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

    // Lo único que el inicio necesita saber: qué está esperando al usuario.
    // Ninguna de las dos consultas recorre el historial de movimientos.
    const [board, pendingScans] = await Promise.all([
        bankService.getBalanceBoard(userId),
        financialInboxService.getUnprocessedTransactions(userId),
    ]);

    return (
        <HomeHub
            userFirstName={userFirstName}
            todayLabel={todayLabel()}
            balances={summarizeBalanceFreshness(board)}
            pendingScans={pendingScans.length}
        />
    );
}

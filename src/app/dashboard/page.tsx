import { initializeContainer, userRepository } from "@/infrastructure/container";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeDashboard } from "@/presentation/components/dashboard/HomeDashboard";

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

    return <HomeDashboard userFirstName={userFirstName} />;
}

import { AppLayout } from "@/presentation/components/layout/AppLayout";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { initializeContainer, userRepository, periodSettingsService } from "@/infrastructure/container";
import { PeriodSettingsProvider } from "@/presentation/components/period/PeriodSettingsProvider";

export default async function MarketLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await initializeContainer(); // Ensure seeded on first load

    const dataSource = process.env.DATA_SOURCE;
    let user = null;

    if (dataSource === 'SUPABASE') {
        const { createClient } = await import("@/infrastructure/supabase/server");
        const supabase = await createClient();
        const { data: { user: supabaseUser }, error } = await supabase.auth.getUser();

        if (error || !supabaseUser) {
            redirect("/auth/login");
        }

        user = await userRepository.findById(supabaseUser.id);
    } else {
        const cookieStore = await cookies();
        const session = cookieStore.get("kyber_session");

        if (!session || !session.value) {
            redirect("/auth/login");
        }

        // Verify user actually exists (Handle In-Memory persistence restart / stale cookie)
        user = await userRepository.findById(session.value);
    }

    if (!user) {
        // Stale session, force logout by redirecting. 
        redirect("/auth/login");
    }

    const cycleStartDay = await periodSettingsService.getCycleStartDay(user.id, 'MARKET');

    return (
        <AppLayout user={user}>
            <PeriodSettingsProvider cycleStartDay={cycleStartDay}>
                {children}
            </PeriodSettingsProvider>
        </AppLayout>
    );
}

import { AppLayout } from "@/presentation/components/layout/AppLayout";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { initializeContainer, userRepository } from "@/infrastructure/container";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await initializeContainer();

    const dataSource = process.env.DATA_SOURCE;
    let user = null;

    if (dataSource === 'SUPABASE') {
        // Memoized per request, so the page below reuses this answer instead of
        // validating the session against the auth server a second time.
        const { getAuthUser } = await import("@/infrastructure/supabase/auth-user");
        const supabaseUser = await getAuthUser();

        if (!supabaseUser) {
            redirect("/auth/login");
        }

        // Fetch full profile from DB
        user = await userRepository.findById(supabaseUser.id);

        if (!user) {
            console.warn(`[Layout] Supabase User ${supabaseUser.id} exists but Profile not found. using fallback.`);
            // Create a temporary/fallback user to allow access (and potentially trigger a profile creation flow later)
            user = {
                id: supabaseUser.id,
                email: supabaseUser.email || "",
                passwordHash: "", // Not needed for display
                defaultCurrencyCode: "USD",
                image: null,
                firstName: supabaseUser.user_metadata?.first_name || "Usuario",
                lastName: supabaseUser.user_metadata?.last_name || "",
                phone: null,
                bio: null,
                country: null,
                province: null,
                city: null,
                parish: null,
                neighborhood: null,
                primaryStreet: null,
                secondaryStreet: null,
                addressReference: null,
                postalCode: null,
                socials: null,
                role: "USER",
                isDeleted: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }
    } else {
        const cookieStore = await cookies();
        const session = cookieStore.get("kyber_session");

        if (!session || !session.value) {
            redirect("/auth/login");
        }

        user = await userRepository.findById(session.value);
    }

    if (!user) {
        // Double check: if supabase user exists but profile doesn't (rare sync issue), redirect or error
        // For MEMORY mode: if user ID in cookie doesn't match any user in memory (e.g. server restart with non-persistent memory),
        // we MUST clear the cookie to stop the Infinite Redirect Loop (Middleware -> Dashboard -> Layout -> Login -> Middleware)
        if (dataSource !== 'SUPABASE') {
            // Cannot delete cookies in Server Component (Layout), so redirect to Route Handler that does it
            redirect("/api/auth/logout");
        }

        redirect("/auth/login");
    }

    return <AppLayout user={user}>{children}</AppLayout>;
}

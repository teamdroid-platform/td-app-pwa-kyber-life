import { AppLayout } from "@/presentation/components/layout/AppLayout";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { initializeContainer, userRepository, periodSettingsService } from "@/infrastructure/container";
import { FinancialRealtimeProvider } from "@/presentation/financial/components/FinancialRealtimeProvider";
import { PeriodSettingsProvider } from "@/presentation/components/period/PeriodSettingsProvider";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Finanzas | KyberLife",
    description: "Gestiona tus finanzas, controla tus gastos y planifica tu presupuesto.",
};

export default async function FinancialLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await initializeContainer();

    const dataSource = process.env.DATA_SOURCE;
    let user = null;

    if (dataSource === 'SUPABASE') {
        const { getAuthUser } = await import("@/infrastructure/supabase/auth-user");
        const supabaseUser = await getAuthUser();

        if (!supabaseUser) {
            redirect("/auth/login");
        }

        user = await userRepository.findById(supabaseUser.id);

        if (!user) {
            console.warn(`[FinancialLayout] Supabase User ${supabaseUser.id} exists but Profile not found. Using fallback.`);
            user = {
                id: supabaseUser.id,
                email: supabaseUser.email || "",
                passwordHash: "",
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
        if (dataSource !== 'SUPABASE') {
            redirect("/api/auth/logout");
        }
        redirect("/auth/login");
    }

    const cycleStartDay = await periodSettingsService.getCycleStartDay(user.id, 'FINANCIAL');

    return (
        <AppLayout user={user}>
            <div className="flex flex-col w-full h-full">
                {/* El techo de lectura sube cuando de verdad hay sitio. Se mide
                    sobre este contenedor y no sobre la ventana porque la barra
                    lateral se lleva 256px y se pliega en caliente: a 1600 de
                    ventana quedan 1280 con ella abierta y 1536 con ella plegada,
                    y solo el segundo caso justifica ensanchar.

                    El contenedor va en el elemento de fuera a propósito: la
                    consulta no puede vivir en el mismo nodo cuyo ancho decide. */}
                <main className="@container/financial flex-1 w-full flex flex-col items-center">
                    <div className="w-full max-w-5xl @6xl/financial:max-w-[1400px]">
                        <PeriodSettingsProvider cycleStartDay={cycleStartDay}>
                            <FinancialRealtimeProvider>
                                {children}
                            </FinancialRealtimeProvider>
                        </PeriodSettingsProvider>
                    </div>
                </main>
            </div>
        </AppLayout>
    );
}

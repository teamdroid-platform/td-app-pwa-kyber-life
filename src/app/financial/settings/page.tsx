import {
    getInstitutionsAction,
    getInstitutionTypesAction,
    getCategoriesAction
} from "@/app/actions/financial-settings";
import { SettingsDashboard } from "@/presentation/financial/components/settings/SettingsDashboard";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FinancialSettingsPage() {
    const [institutions, institutionTypes, categories] = await Promise.all([
        getInstitutionsAction(),
        getInstitutionTypesAction(),
        getCategoriesAction()
    ]);

    return (
        <div className="w-full flex flex-col min-h-screen bg-background">
            <div className="w-full border-b bg-card/50 backdrop-blur-sm p-6 md:px-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Configuración Financiera</h1>
                <p className="text-sm text-muted-foreground mt-2">Gestiona tus comercios y categorías operativas. Tus cuentas y tarjetas están en Bancos.</p>
            </div>
            <div className="p-4 md:p-6 flex-1 w-full max-w-7xl mx-auto space-y-6">
                <SettingsDashboard
                    initialInstitutions={institutions}
                    institutionTypes={institutionTypes}
                    initialCategories={categories}
                />
            </div>
        </div>
    );
}

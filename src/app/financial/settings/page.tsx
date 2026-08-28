import {
    getInstitutionsAction,
    getInstitutionTypesAction,
    getCategoriesAction
} from "@/app/actions/financial-settings";
import { getBalanceScopeAction } from "@/app/actions/balance";
import { getBankOverviewAction } from "@/app/actions/bank";
import { DEFAULT_BALANCE_MODE } from "@/domain/entities/balance";
import { SettingsDashboard } from "@/presentation/financial/components/settings/SettingsDashboard";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FinancialSettingsPage() {
    const [institutions, institutionTypes, categories, scopeResult, bankOverviewResult] = await Promise.all([
        getInstitutionsAction(),
        getInstitutionTypesAction(),
        getCategoriesAction(),
        getBalanceScopeAction(),
        getBankOverviewAction(),
    ]);

    // Un fallo al leer bancos o el scope de balances no debe tumbar toda la
    // pantalla: las pestañas de instituciones y categorías siguen funcionando,
    // así que la de Balances arranca vacía en vez de romper la carga.
    const balanceDefaultMode = scopeResult.success
        ? (scopeResult.data.settings?.defaultMode ?? DEFAULT_BALANCE_MODE)
        : DEFAULT_BALANCE_MODE;
    const balanceRules = scopeResult.success ? scopeResult.data.rules : [];
    const bankInstitutions = bankOverviewResult.success ? bankOverviewResult.data.institutions : [];
    const bankAccounts = bankOverviewResult.success ? bankOverviewResult.data.accounts : [];
    const bankCards = bankOverviewResult.success ? bankOverviewResult.data.cards : [];

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
                    balanceDefaultMode={balanceDefaultMode}
                    balanceRules={balanceRules}
                    bankInstitutions={bankInstitutions}
                    bankAccounts={bankAccounts}
                    bankCards={bankCards}
                />
            </div>
        </div>
    );
}

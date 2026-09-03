import { MarketSettingsDashboard } from "@/presentation/market/components/settings/MarketSettingsDashboard";
import SupermarketsTab from "./components/supermarkets/supermarkets-tab";
import CategoriesTab from "./components/categories/categories-tab";
import UnitsTab from "./components/units/units-tab";
import { getAllCycleStartDaysAction } from "@/app/actions/period-settings";
import { DEFAULT_CYCLE_START_DAY } from "@/domain/entities/period";
import { PeriodSettingsManager } from "@/presentation/components/period/PeriodSettingsManager";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MarketSettingsPage() {
    const cyclesResult = await getAllCycleStartDaysAction();
    const cycles = cyclesResult.success ? cyclesResult.data : DEFAULT_CYCLE_START_DAY;

    return (
        <div className="w-full flex flex-col min-h-screen bg-background">
            <div className="w-full border-b bg-card/50 backdrop-blur-sm p-6 md:px-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Configuración de Market</h1>
                <p className="text-sm text-muted-foreground mt-2">Gestiona tus supermercados, categorías y unidades de medida.</p>
            </div>
            <div className="p-4 md:p-6 flex-1 w-full max-w-7xl mx-auto space-y-6">
                <MarketSettingsDashboard 
                    supermarketsTab={<SupermarketsTab />}
                    categoriesTab={<CategoriesTab />}
                    unitsTab={<UnitsTab />}
                    periodsTab={
                        <PeriodSettingsManager
                            scope="MARKET"
                            cycleStartDay={cycles.MARKET}
                            financialCycleStartDay={cycles.FINANCIAL}
                        />
                    }
                />
            </div>
        </div>
    );
}

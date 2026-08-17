"use client";

import { FinancialInstitution, FinancialInstitutionType, FinancialCategory } from "@/domain/entities/financial";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InstitutionManager } from "./InstitutionManager";
import { CategoryManager } from "./CategoryManager";
import { Building2, Tags } from "lucide-react";

interface SettingsDashboardProps {
    initialInstitutions: FinancialInstitution[];
    institutionTypes: FinancialInstitutionType[];
    initialCategories: FinancialCategory[];
}

/**
 * Aquí "institución" significa **comercio**: tienda, restaurante, servicio.
 * Las cuentas y tarjetas viven en el módulo Bancos, bajo el emisor que
 * realmente las emite.
 */
export function SettingsDashboard({
    initialInstitutions,
    institutionTypes,
    initialCategories
}: SettingsDashboardProps) {
    return (
        <Tabs defaultValue="institutions" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted/50 p-1 rounded-xl">
                <TabsTrigger value="institutions" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2">
                    <Building2 className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">Instituciones</span>
                </TabsTrigger>
                <TabsTrigger value="categories" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2">
                    <Tags className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">Categorías</span>
                </TabsTrigger>
            </TabsList>
            <TabsContent value="institutions" className="mt-0">
                <InstitutionManager initialData={initialInstitutions} institutionTypes={institutionTypes} />
            </TabsContent>
            <TabsContent value="categories" className="mt-0">
                <CategoryManager initialData={initialCategories} />
            </TabsContent>
        </Tabs>
    );
}

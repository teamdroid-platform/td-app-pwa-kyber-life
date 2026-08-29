"use client";

import { useMemo } from "react";
import { FinancialInstitution, FinancialInstitutionType, FinancialCategory } from "@/domain/entities/financial";
import type { BankInstitution } from "@/domain/entities/bank";
import type { BankAccountWithBalance, BankCardWithDebt } from "@/application/services/bank-service";
import type { BalanceMode, BalanceScopeRule } from "@/domain/entities/balance";
import { accountLabel, cardLabel } from "@/lib/bank-identity-label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InstitutionManager } from "./InstitutionManager";
import { CategoryManager } from "./CategoryManager";
import { BalanceScopeManager } from "./BalanceScopeManager";
import { Building2, Tags, Scale } from "lucide-react";

interface SettingsDashboardProps {
    initialInstitutions: FinancialInstitution[];
    institutionTypes: FinancialInstitutionType[];
    initialCategories: FinancialCategory[];
    balanceDefaultMode: BalanceMode;
    balanceRules: BalanceScopeRule[];
    bankInstitutions: BankInstitution[];
    bankAccounts: BankAccountWithBalance[];
    bankCards: BankCardWithDebt[];
}

/**
 * Aquí "institución" significa **comercio**: tienda, restaurante, servicio.
 * Las cuentas y tarjetas viven en el módulo Bancos, bajo el emisor que
 * realmente las emite.
 */
export function SettingsDashboard({
    initialInstitutions,
    institutionTypes,
    initialCategories,
    balanceDefaultMode,
    balanceRules,
    bankInstitutions,
    bankAccounts,
    bankCards,
}: SettingsDashboardProps) {
    // Las etiquetas de cuenta/tarjeta se calculan al mostrar, no se guardan:
    // mismo criterio que el resto del módulo Bancos (ver bank-identity-label.ts).
    const scopeInstitutions = useMemo(
        () => bankInstitutions.map(i => ({ id: i.id, name: i.name })),
        [bankInstitutions],
    );
    const scopeAccounts = useMemo(
        () => bankAccounts.map(a => ({ id: a.id, institutionId: a.institutionId ?? null, label: accountLabel(a) })),
        [bankAccounts],
    );
    const scopeCards = useMemo(
        () => bankCards.map(c => ({ id: c.id, institutionId: c.institutionId ?? null, label: cardLabel(c) })),
        [bankCards],
    );

    return (
        <Tabs defaultValue="institutions" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8 bg-muted/50 p-1 rounded-xl">
                <TabsTrigger value="institutions" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2">
                    <Building2 className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">Instituciones</span>
                </TabsTrigger>
                <TabsTrigger value="categories" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2">
                    <Tags className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">Categorías</span>
                </TabsTrigger>
                <TabsTrigger value="balances" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2">
                    <Scale className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">Balances</span>
                </TabsTrigger>
            </TabsList>
            <TabsContent value="institutions" className="mt-0">
                <InstitutionManager initialData={initialInstitutions} institutionTypes={institutionTypes} />
            </TabsContent>
            <TabsContent value="categories" className="mt-0">
                <CategoryManager initialData={initialCategories} />
            </TabsContent>
            <TabsContent value="balances" className="mt-0">
                <BalanceScopeManager
                    defaultMode={balanceDefaultMode}
                    initialRules={balanceRules}
                    institutions={scopeInstitutions}
                    accounts={scopeAccounts}
                    cards={scopeCards}
                />
            </TabsContent>
        </Tabs>
    );
}

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ListFilter, TrendingDown, TrendingUp, ArrowRightLeft, Wallet, SlidersHorizontal } from "lucide-react";
import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
    { value: "ALL", label: "Todos", icon: ListFilter },
    { value: "EXPENSE", label: "Gastos", icon: TrendingDown },
    { value: "INCOME", label: "Ingresos", icon: TrendingUp },
    { value: "TRANSFER", label: "Transferencias", icon: ArrowRightLeft },
    { value: "WITHDRAWAL", label: "Retiros", icon: Wallet }
];

/**
 * Filters that are not the type chips — those already have their own visible
 * row. A date filter counts as one however it is expressed in the URL.
 */
export function countActiveFilters(params: URLSearchParams): number {
    let count = 0;
    for (const key of ["query", "status", "categoryId", "institutionId", "currency"]) {
        if (params.get(key)) count += 1;
    }
    if (params.get("dateFrom") || params.get("dateTo") || params.get("range")) count += 1;
    return count;
}

export function TransactionTabs({ filters, children }: { filters?: ReactNode; children?: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const typeParam = searchParams.get("type");
    const currentTypes = typeParam ? typeParam.split(',') : [];
    const isAll = currentTypes.length === 0;

    // Collapsed by default on phones, where the filter block took half the
    // screen before a single transaction was visible. On desktop, where the
    // space isn't contested, the filters stay where they always were.
    const [filtersOpen, setFiltersOpen] = useState(false);
    const activeFilters = countActiveFilters(searchParams);

    const handleToggle = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());

        if (value === "ALL") {
            params.delete("type");
        } else {
            let newTypes = [...currentTypes];
            if (newTypes.includes(value)) {
                newTypes = newTypes.filter(t => t !== value);
            } else {
                newTypes.push(value);
            }

            if (newTypes.length === 0) {
                params.delete("type");
            } else {
                params.set("type", newTypes.join(','));
            }
        }

        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="w-full pb-2">
            <div className="mb-4 flex items-center gap-2 sm:mb-6">
                <div className="grid flex-1 grid-cols-5 items-center justify-center rounded-xl bg-muted/50 p-1 text-muted-foreground">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = tab.value === "ALL" ? isAll : currentTypes.includes(tab.value);

                        return (
                            <button
                                key={tab.value}
                                onClick={() => handleToggle(tab.value)}
                                className={`flex items-center justify-center gap-2 rounded-lg py-2 transition-all text-sm whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isActive ? 'bg-background shadow-sm text-foreground' : 'hover:text-foreground'}`}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline font-medium">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Right of the type row, and only where the filters are folded
                    away. The count is not decoration: a filtered list with its
                    filters hidden would otherwise read as missing transactions. */}
                {filters && (
                    <button
                        type="button"
                        onClick={() => setFiltersOpen((open) => !open)}
                        aria-expanded={filtersOpen}
                        aria-label={
                            activeFilters > 0
                                ? `${filtersOpen ? "Ocultar" : "Mostrar"} filtros · ${activeFilters} ${activeFilters === 1 ? "activo" : "activos"}`
                                : `${filtersOpen ? "Ocultar" : "Mostrar"} filtros`
                        }
                        className={cn(
                            "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors sm:hidden",
                            filtersOpen || activeFilters > 0
                                ? "border-accent-primary/50 bg-accent-primary/15 text-accent-primary"
                                : "border-border/50 bg-muted/50 text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        {activeFilters > 0 && (
                            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-bg-primary bg-accent-primary px-1 text-[9px] font-bold leading-none text-accent-primary-foreground">
                                {activeFilters}
                            </span>
                        )}
                    </button>
                )}
            </div>

            {filters && (
                <div className={cn("mb-4", !filtersOpen && "hidden sm:block")}>
                    {filters}
                </div>
            )}

            {children && (
                <div className="mt-0 outline-none">
                    {children}
                </div>
            )}
        </div>
    );
}

"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import { SETTINGS_SORT_OPTIONS, type SettingsSortMode, type SortDirection } from "../../lib/transaction-type-buckets";

interface SettingsListControlsProps {
    query: string;
    onQueryChange: (value: string) => void;
    sort: SettingsSortMode;
    onSortChange: (value: SettingsSortMode) => void;
    direction: SortDirection;
    onDirectionChange: (value: SortDirection) => void;
    placeholder?: string;
}

/** Shared search-by-name + sort (with asc/desc direction) toolbar for the settings managers. */
export function SettingsListControls({
    query,
    onQueryChange,
    sort,
    onSortChange,
    direction,
    onDirectionChange,
    placeholder = "Buscar por nombre…",
}: SettingsListControlsProps) {
    const isAsc = direction === "asc";
    return (
        <div className="flex items-center gap-2 mb-5">
            <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder={placeholder}
                    className="pl-8 h-9 rounded-lg bg-muted/40 border-border/40"
                    aria-label="Buscar por nombre"
                />
            </div>
            <Select value={sort} onValueChange={(v) => onSortChange(v as SettingsSortMode)}>
                <SelectTrigger className="h-9 w-[120px] sm:w-[180px] shrink-0 rounded-lg bg-muted/40 border-border/40" aria-label="Ordenar por">
                    <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-muted-foreground shrink-0" />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {SETTINGS_SORT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg bg-muted/40 border-border/40"
                onClick={() => onDirectionChange(isAsc ? "desc" : "asc")}
                aria-label={isAsc ? "Orden ascendente (cambiar a descendente)" : "Orden descendente (cambiar a ascendente)"}
                title={isAsc ? "Ascendente" : "Descendente"}
            >
                {isAsc ? <ArrowUpNarrowWide className="w-4 h-4" /> : <ArrowDownNarrowWide className="w-4 h-4" />}
            </Button>
        </div>
    );
}

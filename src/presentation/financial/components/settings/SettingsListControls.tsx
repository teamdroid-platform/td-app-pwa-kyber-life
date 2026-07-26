"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown } from "lucide-react";
import { SETTINGS_SORT_OPTIONS, type SettingsSortMode } from "../../lib/transaction-type-buckets";

interface SettingsListControlsProps {
    query: string;
    onQueryChange: (value: string) => void;
    sort: SettingsSortMode;
    onSortChange: (value: SettingsSortMode) => void;
    placeholder?: string;
}

/** Shared search-by-name + sort toolbar for the settings list managers. */
export function SettingsListControls({ query, onQueryChange, sort, onSortChange, placeholder = "Buscar por nombre…" }: SettingsListControlsProps) {
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
                <SelectTrigger className="h-9 w-[130px] sm:w-[190px] shrink-0 rounded-lg bg-muted/40 border-border/40" aria-label="Ordenar">
                    <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-muted-foreground shrink-0" />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {SETTINGS_SORT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

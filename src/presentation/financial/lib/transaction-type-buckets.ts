import { TrendingUp, TrendingDown, ArrowRightLeft, Wallet, type LucideIcon } from "lucide-react";
import type { TransactionTypeBucket } from "@/domain/services/financial-balance";
import type { TransactionTypeCounts } from "@/application/services/financial-settings-service";

/** Display order of the four type buckets. */
export const TYPE_BUCKET_ORDER: TransactionTypeBucket[] = ["income", "expense", "transfer", "withdrawal"];

/** Label / color / icon for each bucket, matching the rest of the module. */
export const TYPE_BUCKET_META: Record<TransactionTypeBucket, { label: string; color: string; icon: LucideIcon }> = {
    income: { label: "Ingresos", color: "#10b981", icon: TrendingUp },
    expense: { label: "Gastos", color: "#f43f5e", icon: TrendingDown },
    transfer: { label: "Transferencias", color: "#f59e0b", icon: ArrowRightLeft },
    withdrawal: { label: "Retiros", color: "#0284c7", icon: Wallet },
};

export type SettingsSortMode = "name" | "count" | "type";

export const SETTINGS_SORT_OPTIONS: { value: SettingsSortMode; label: string }[] = [
    { value: "name", label: "Nombre" },
    { value: "count", label: "N.º de transacciones" },
    { value: "type", label: "Tipo de transacción" },
];

/** Index (in TYPE_BUCKET_ORDER) of the entity's most-frequent bucket; last when empty. */
function dominantRank(counts?: TransactionTypeCounts): number {
    if (!counts || counts.total === 0) return TYPE_BUCKET_ORDER.length;
    let bestIdx = TYPE_BUCKET_ORDER.length;
    let bestVal = -1;
    TYPE_BUCKET_ORDER.forEach((b, i) => {
        if (counts[b] > bestVal) {
            bestVal = counts[b];
            bestIdx = i;
        }
    });
    return bestIdx;
}

/**
 * Sort settings entities (categories / institutions) by the chosen mode:
 *   - "name":  alphabetical.
 *   - "count": by total transactions (desc), name as tiebreak.
 *   - "type":  grouped by dominant type bucket, then total (desc), then name.
 * Falls back to name while stats are still loading.
 */
export function sortSettingsItems<T extends { id?: string | null; name: string }>(
    items: T[],
    mode: SettingsSortMode,
    statsById: Record<string, TransactionTypeCounts> | null,
): T[] {
    const byName = (a: T, b: T) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    const sorted = [...items];
    const countOf = (t: T) => (t.id && statsById ? statsById[t.id]?.total ?? 0 : 0);

    if (mode === "name" || !statsById) return sorted.sort(byName);

    if (mode === "count") {
        return sorted.sort((a, b) => countOf(b) - countOf(a) || byName(a, b));
    }

    // "type"
    return sorted.sort((a, b) => {
        const sa = a.id ? statsById[a.id] : undefined;
        const sb = b.id ? statsById[b.id] : undefined;
        const ra = dominantRank(sa);
        const rb = dominantRank(sb);
        if (ra !== rb) return ra - rb;
        return (sb?.total ?? 0) - (sa?.total ?? 0) || byName(a, b);
    });
}

/**
 * Auto-generated notes for a manually captured transaction.
 *
 * Extracted from `TransactionForm` so the stepped wizard writes exactly the
 * same sentence: two implementations would drift, and the note is stored data.
 */

/** Lowercase type labels, so the sentence reads naturally. */
const NOTE_TYPE_LABELS: Record<string, string> = {
    EXPENSE: "gasto",
    INCOME: "ingreso",
    TRANSFER: "transferencia",
    WITHDRAWAL: "retiro",
};

/** Format a datetime-local string as "DD/MM/YYYY HH:mm". */
export function formatNotesDateTime(dtLocal: string): string {
    if (!dtLocal) return "";
    const d = new Date(dtLocal);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface AutoNotesInput {
    type: string;
    description: string;
    institutionName: string;
    amount: string;
    date: string;
    accountName: string;
}

/** Build the auto-generated notes sentence from the current form fields. */
export function buildAutoNotes(p: AutoNotesInput): string {
    const typeLabel = NOTE_TYPE_LABELS[p.type] ?? p.type.toLowerCase();
    let s = `Registro de ${typeLabel}`;
    if (p.description.trim()) s += ` por ${p.description.trim()}`;
    if (p.institutionName.trim()) s += ` en ${p.institutionName.trim()}`;
    if (p.amount && Number(p.amount) > 0) s += ` por un monto de $${p.amount}`;
    const dateStr = formatNotesDateTime(p.date);
    if (dateStr) s += ` el ${dateStr}`;
    if (p.accountName.trim()) s += ` desde la cuenta ${p.accountName.trim()}`;
    return s;
}

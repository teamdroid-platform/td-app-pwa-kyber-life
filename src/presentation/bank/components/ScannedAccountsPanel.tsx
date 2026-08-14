import { ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScannedAccountView } from "@/application/services/bank-service";

interface ScannedAccountsPanelProps {
    accounts: ScannedAccountView[];
    /**
     * Encabezado del bloque. El escaneo y la transacción confirmada muestran lo
     * mismo con distinto título.
     */
    title?: string;
    className?: string;
}

/**
 * Las cuentas del movimiento, de solo lectura y en una línea por lado.
 *
 * Responde a «qué dijo el banco», no a «con qué pagué» — eso se elige en el
 * paso de pago, que gana sobre cualquier lectura automática. Por eso no hay
 * ningún control aquí.
 *
 * Es deliberadamente compacto: vive pegado a la fila de forma de pago, donde
 * compite por espacio con el resto del resumen. La cadena original del banco y
 * el nivel de la coincidencia viajan en el `title` en vez de ocupar línea
 * propia; la pantalla de conciliación es donde esa evidencia se examina.
 */
export function ScannedAccountsPanel({
    accounts, title = "Cuentas del escaneo", className,
}: ScannedAccountsPanelProps) {
    if (accounts.length === 0) return null;

    return (
        <div className={cn("rounded-2xl border border-border/40 bg-bg-secondary/30 px-3 py-2.5", className)}>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                <Landmark className="h-3 w-3" /> {title}
            </p>

            <ul className="flex flex-col gap-1">
                {accounts.map((account, index) => (
                    <ScannedAccountRow key={`${account.role}-${account.raw}-${index}`} account={account} />
                ))}
            </ul>
        </div>
    );
}

function ScannedAccountRow({ account }: { account: ScannedAccountView }) {
    const isSource = account.role === "SOURCE";
    const RoleIcon = isSource ? ArrowUpRight : ArrowDownLeft;

    return (
        <li
            className="flex items-center gap-1.5 text-xs"
            title={evidence(account)}
        >
            <RoleIcon
                className={cn("h-3.5 w-3.5 shrink-0", isSource ? "text-rose-500" : "text-emerald-500")}
                aria-label={isSource ? "Origen" : "Destino"}
            />
            <span className="shrink-0 font-mono text-text-primary">{account.display}</span>
            <span className="truncate text-text-tertiary">{attribution(account)}</span>
        </li>
    );
}

/** A quién pertenece el número, en las palabras que el sistema puede sostener. */
function attribution(account: ScannedAccountView): string {
    if (account.match) {
        return account.match.institutionName
            ? `${account.match.name} · ${account.match.institutionName}`
            : account.match.name;
    }

    // Sin identidad, lo que se puede decir depende del lado: el origen suele ser
    // del usuario y solo falta registrarlo; el destino, en cambio, es de un
    // tercero. Decir «no es tuya» de un origen sería afirmar de más.
    const fallback = account.role === "SOURCE" ? "Sin registrar" : "De un tercero";
    return account.institutionHint ? `${fallback} · ${account.institutionHint}` : fallback;
}

/** Lo que sostiene la lectura, para quien quiera comprobarla. */
function evidence(account: ScannedAccountView): string | undefined {
    const parts = [
        account.raw,
        account.resolution === "INFERRED" ? "Coincide por los últimos dígitos" : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(" · ") : undefined;
}

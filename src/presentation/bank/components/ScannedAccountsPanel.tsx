import { ArrowDownLeft, ArrowUpRight, CreditCard, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScannedAccountView } from "@/application/services/bank-service";

const ROLE_LABEL: Record<ScannedAccountView["role"], string> = {
    SOURCE: "Origen",
    DESTINATION: "Destino",
};

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
 * Las cuentas que trajo el escaneo, de solo lectura.
 *
 * Responde a «qué dijo el banco», no a «con qué pagué» — eso se elige en el
 * paso de pago, que gana sobre cualquier lectura automática. Por eso aquí no
 * hay ningún control: enseña el número al estándar de la app, a qué cuenta
 * tuya corresponde, y deja a la vista la cadena original como evidencia.
 */
export function ScannedAccountsPanel({
    accounts, title = "Cuentas del escaneo", className,
}: ScannedAccountsPanelProps) {
    if (accounts.length === 0) return null;

    return (
        <div className={cn("rounded-2xl border border-border/40 bg-bg-secondary/30 p-3", className)}>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                <Landmark className="h-3.5 w-3.5" /> {title}
            </p>

            <ul className="flex flex-col gap-1.5">
                {accounts.map((account, index) => (
                    <li key={`${account.role}-${account.raw}-${index}`}>
                        <ScannedAccountRow account={account} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ScannedAccountRow({ account }: { account: ScannedAccountView }) {
    const isSource = account.role === "SOURCE";
    const RoleIcon = isSource ? ArrowUpRight : ArrowDownLeft;
    const KindIcon = account.kind === "CARD" ? CreditCard : Landmark;

    return (
        <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-bg-primary/40 p-2.5">
            <span
                className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    isSource ? "bg-rose-500/15 text-rose-500" : "bg-emerald-500/15 text-emerald-500",
                )}
                aria-hidden
            >
                <RoleIcon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                    {ROLE_LABEL[account.role]}
                </p>

                <p className="flex items-center gap-1.5 font-mono text-sm text-text-primary">
                    <KindIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
                    <span className="truncate">{account.display}</span>
                </p>

                <Attribution account={account} />

                {/* La cadena original queda a la vista: es lo que permite juzgar
                    si la atribución automática acertó. Una cuenta ya elegida no
                    tiene lectura que juzgar, y entonces no hay nada que mostrar. */}
                {account.raw && (
                    <p className="truncate font-mono text-[10px] text-text-tertiary" title={account.raw}>
                        {account.raw}
                    </p>
                )}
            </div>
        </div>
    );
}

/** A quién pertenece el número, en las palabras que el sistema puede sostener. */
function Attribution({ account }: { account: ScannedAccountView }) {
    if (account.match) {
        return (
            <p className="truncate text-xs text-text-secondary">
                {account.match.name}
                {account.match.institutionName && (
                    <span className="text-text-tertiary"> · {account.match.institutionName}</span>
                )}
                {account.resolution === "INFERRED" && (
                    <span className="text-text-tertiary"> · por los últimos dígitos</span>
                )}
            </p>
        );
    }

    // Sin identidad, lo que se puede decir depende del lado: el origen suele ser
    // del usuario y solo falta registrarlo; el destino, en cambio, es de un
    // tercero. Decir «no es tuya» de un origen sería afirmar de más.
    return (
        <p className="truncate text-xs text-text-tertiary">
            {account.role === "SOURCE" ? "Aún sin registrar en Bancos" : "No es una cuenta tuya"}
            {account.institutionHint && <span> · {account.institutionHint}</span>}
        </p>
    );
}

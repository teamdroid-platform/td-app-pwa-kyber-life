"use client";

import { ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountOwnership, ScannedAccountView } from "@/application/services/bank-service";

interface ScannedAccountsPanelProps {
    accounts: ScannedAccountView[];
    /**
     * Encabezado del bloque. El escaneo y la transacción confirmada muestran lo
     * mismo con distinto título.
     */
    title?: string;
    className?: string;
    /**
     * Deja declarar de quién es cada cuenta. Sin esto el panel es de solo
     * lectura, que es como se muestra en el resumen y en el detalle.
     */
    onOwnershipChange?: (raw: string, ownership: AccountOwnership) => void;
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
    accounts, title = "Cuentas del escaneo", className, onOwnershipChange,
}: ScannedAccountsPanelProps) {
    if (accounts.length === 0) return null;

    return (
        <div className={cn("rounded-2xl border border-border/40 bg-bg-secondary/30 px-3 py-2.5", className)}>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                <Landmark className="h-3 w-3" /> {title}
            </p>

            <ul className="flex flex-col gap-1">
                {accounts.map((account, index) => (
                    <ScannedAccountRow
                        key={`${account.role}-${account.raw}-${index}`}
                        account={account}
                        onOwnershipChange={onOwnershipChange}
                    />
                ))}
            </ul>
        </div>
    );
}

function ScannedAccountRow({
    account, onOwnershipChange,
}: {
    account: ScannedAccountView;
    onOwnershipChange?: (raw: string, ownership: AccountOwnership) => void;
}) {
    const isSource = account.role === "SOURCE";
    const RoleIcon = isSource ? ArrowUpRight : ArrowDownLeft;

    // Una cuenta ya identificada como tuya no admite discusión: el número
    // corresponde a un registro que existe. Se pregunta por lo que no lo está.
    const askable = !!onOwnershipChange && !account.match;

    return (
        <li className={cn("text-xs", askable && "flex flex-col gap-1 py-0.5")}>
            <span className="flex items-center gap-1.5" title={evidence(account)}>
                <RoleIcon
                    className={cn("h-3.5 w-3.5 shrink-0", isSource ? "text-rose-500" : "text-emerald-500")}
                    aria-label={isSource ? "Origen" : "Destino"}
                />
                <span className="shrink-0 font-mono text-text-primary">{account.display}</span>
                <span className="truncate text-text-tertiary">{attribution(account)}</span>
            </span>

            {askable && (
                <OwnershipChoice
                    value={account.ownership ?? (isSource ? "MINE" : "EXTERNAL")}
                    declared={account.ownership != null}
                    onChange={next => onOwnershipChange!(account.raw, next)}
                />
            )}
        </li>
    );
}

/**
 * De quién es la cuenta, en dos botones.
 *
 * Arranca en lo que el sistema supone por el lado y lo dice —«supuesto»— hasta
 * que el usuario elige: transferir entre cuentas propias es normal, y dar el
 * destino por ajeno sin avisar es lo que hacía desaparecer una cuenta suya.
 */
function OwnershipChoice({
    value, declared, onChange,
}: {
    value: AccountOwnership;
    declared: boolean;
    onChange: (next: AccountOwnership) => void;
}) {
    const options: { value: AccountOwnership; label: string }[] = [
        { value: "MINE", label: "Es mía" },
        { value: "EXTERNAL", label: "De un tercero" },
    ];

    return (
        <span className="flex items-center gap-1 pl-5">
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    aria-pressed={value === option.value}
                    className={cn(
                        "rounded-lg border px-2 py-0.5 text-[11px] transition-colors",
                        value === option.value
                            ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                            : "border-border/40 text-text-tertiary hover:border-border",
                    )}
                >
                    {option.label}
                </button>
            ))}
            {!declared && <span className="text-[10px] text-text-tertiary">supuesto</span>}
        </span>
    );
}

/**
 * El recorrido del dinero en una línea, para ir dentro de otra fila.
 *
 * Es la misma información del panel comprimida al máximo: sirve como valor de
 * la fila «Cuenta», donde compite con el resto del resumen y no puede permitirse
 * un bloque propio.
 */
export function AccountsTrail({ accounts }: { accounts: ScannedAccountView[] }) {
    if (accounts.length === 0) return null;

    return (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {accounts.map((account, index) => {
                const isSource = account.role === "SOURCE";
                const Icon = isSource ? ArrowUpRight : ArrowDownLeft;
                return (
                    <span
                        key={`${account.role}-${account.raw}-${index}`}
                        className="inline-flex items-center gap-1"
                        title={[account.raw, attribution(account)].filter(Boolean).join(" · ")}
                    >
                        <Icon
                            className={cn("h-3.5 w-3.5 shrink-0", isSource ? "text-rose-500" : "text-emerald-500")}
                            aria-label={isSource ? "Origen" : "Destino"}
                        />
                        <span className="font-mono text-sm">{account.display}</span>
                        {account.match && (
                            <span className="text-xs text-text-tertiary">{account.match.name}</span>
                        )}
                    </span>
                );
            })}
        </span>
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

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
                        <span className="text-xs text-text-tertiary">{attribution(account)}</span>
                    </span>
                );
            })}
        </span>
    );
}

/**
 * Cómo llamar a una cuenta identificada sin repetir lo que el número ya dijo.
 *
 * Las cuentas que nacen de un escaneo se llaman «Cuenta ••••10», así que
 * ponerlas junto a «25••••10» enseña dos veces lo mismo. Cuando el nombre no
 * aporta nada nuevo, manda el emisor, que sí distingue.
 */
function identityLabel(match: NonNullable<ScannedAccountView["match"]>): string {
    if (!match.institutionName) return match.name;
    // El emisor se muestra siempre; el nombre solo si añade algo. Repetirlo
    // daba «10••••11 Cuenta COAC Jardín Azuayo · COAC Jardín Azuayo».
    if (addsNothing(match.name, match.institutionName)) return match.institutionName;
    return `${match.name} · ${match.institutionName}`;
}

/**
 * Si el nombre no dice nada que la fila no muestre ya: «Cuenta ••••10» junto al
 * número, o «Cuenta COAC Jardín Azuayo» junto a su emisor. Son las dos formas
 * que toman los nombres generados al detectar una identidad, y el usuario los
 * reemplaza por uno de verdad desde Bancos.
 */
function addsNothing(name: string, institutionName: string): boolean {
    const rest = name
        .replace(institutionName, "")
        .replace(/cuenta|tarjeta|[\s•X*·\-–0-9]/gi, "");
    return rest.length === 0;
}

/** A quién pertenece el número, en las palabras que el sistema puede sostener. */
function attribution(account: ScannedAccountView): string {
    if (account.match) return identityLabel(account.match);

    // Lo que el usuario declaró manda sobre cualquier suposición: decir «de un
    // tercero» de una cuenta que acaba de marcar como suya le contradice a la
    // cara. Sin declarar, se supone por el lado — el origen suele ser suyo y
    // solo falta registrarlo; el destino, en cambio, es de otro.
    const fallback = account.ownership
        ? (account.ownership === "MINE" ? "Tuya, sin registrar aún" : "De un tercero")
        : (account.role === "SOURCE" ? "Sin registrar" : "De un tercero");

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

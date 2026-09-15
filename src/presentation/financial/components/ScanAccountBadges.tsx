"use client";

import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";
import type { ScannedAccountView } from "@/application/services/bank-service";
import { extractScannedAccounts, resolveAccountBadgeInfo } from "../lib/scan-accounts";
import { cn } from "@/lib/utils";

interface ScanAccountBadgesProps {
    scan: FinancialScannerTransaction;
    /**
     * Los números del escaneo resueltos contra las cuentas del usuario. Con
     * ellos, una cuenta registrada muestra su tipo real; sin ellos —o para un
     * número que no está registrado— se infiere del texto.
     */
    views?: ScannedAccountView[];
    /** Nombre del perfil: un destino sin registrar a su nombre es suyo. */
    ownerName?: string | null;
    className?: string;
    /**
     * Qué poner cuando el escáner no identificó ninguna cuenta. En la tarjeta
     * se omite el bloque entero; en la tabla la celda tiene que decir algo, o
     * un hueco vacío se lee como un fallo de la pantalla.
     */
    emptyLabel?: string;
}

/**
 * Las cuentas de origen y destino que el escáner sacó del correo.
 *
 * Se muestran las dos siempre que existan, y con su flecha: en una
 * transferencia, de dónde salió y a dónde entró es la mitad de lo que hay que
 * revisar antes de aprobar. Una sola cuenta sin decir cuál de las dos es
 * obligaría a abrir el detalle para saberlo.
 *
 * Eran dos bloques de JSX casi idénticos dentro de `FinancialInbox`, uno por
 * rol. Ahora es uno solo con el rol como dato, y lo comparten la tarjeta de
 * móvil y la tabla de escritorio.
 */
export function ScanAccountBadges({ scan, views, ownerName, className, emptyLabel }: ScanAccountBadgesProps) {
    const accounts = extractScannedAccounts(scan);
    if (!accounts.source && !accounts.destination) {
        return emptyLabel ? <span className="text-[11.5px] text-muted-foreground">{emptyLabel}</span> : null;
    }

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            {accounts.source && (
                <AccountRow role="SOURCE" account={accounts.source} scan={scan} view={viewFor(views, "SOURCE", accounts.source)} ownerName={ownerName} />
            )}
            {accounts.destination && (
                <AccountRow role="DESTINATION" account={accounts.destination} scan={scan} view={viewFor(views, "DESTINATION", accounts.destination)} ownerName={ownerName} />
            )}
        </div>
    );
}

/**
 * La lectura del servidor para un número. Se busca por la cadena del banco y,
 * si el mismo número sale en los dos lados, por el lado también.
 */
function viewFor(
    views: ScannedAccountView[] | undefined, role: "SOURCE" | "DESTINATION", account: string,
): ScannedAccountView | null {
    const raw = account.trim();
    const same = views?.filter(v => v.raw === raw) ?? [];
    return same.find(v => v.role === role) ?? same[0] ?? null;
}

function AccountRow({
    role,
    account,
    scan,
    view,
    ownerName,
}: {
    role: "SOURCE" | "DESTINATION";
    account: string;
    scan: FinancialScannerTransaction;
    view: ScannedAccountView | null;
    ownerName?: string | null;
}) {
    const info = resolveAccountBadgeInfo(role, account, scan, view, ownerName);
    const isSource = role === "SOURCE";
    const Arrow = isSource ? ArrowUpRight : ArrowDownLeft;

    return (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
                className={cn(
                    "inline-flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-md border",
                    isSource
                        ? "border-rose-500/20 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
                        : "border-emerald-500/20 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
                )}
                title={isSource ? "Origen" : "Destino"}
            >
                <Arrow className="h-3 w-3 stroke-[2.5]" />
                <span className="sr-only">{isSource ? "Cuenta de origen" : "Cuenta de destino"}</span>
            </span>

            <span className="inline-flex h-5 shrink-0 select-none items-center rounded-md border border-slate-200 bg-slate-100/90 px-1.5 font-mono text-[11px] font-medium tracking-wide text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-200">
                {info.formattedNumber}
            </span>

            {/* Tipo de cuenta: TCR, TDE, AHO, CTE, CTA… */}
            <span className="inline-flex h-5 shrink-0 select-none items-center rounded-md border border-indigo-500/20 bg-indigo-50 px-1.5 text-[9.5px] font-bold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                {info.typeAcronym}
            </span>

            {/* MIA si es una cuenta del usuario, TER si es de un tercero. */}
            <span className="inline-flex h-5 shrink-0 select-none items-center rounded-md border border-slate-200/60 bg-slate-100/60 px-1.5 text-[9px] font-bold text-slate-600 dark:border-slate-600/40 dark:bg-slate-800/40 dark:text-slate-400">
                {info.ownershipAcronym}
            </span>
        </div>
    );
}

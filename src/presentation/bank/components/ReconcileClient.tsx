"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReconcileGroupCard } from "./ReconcileGroupCard";
import { confirmReconcileAction } from "@/app/actions/bank-reconcile";
import type { ReconcileState } from "@/app/actions/bank-reconcile";

const SECTIONS = [
    {
        id: "exact" as const,
        title: "Resueltas",
        hint: "Los últimos 4 dígitos bastaron para identificarlas.",
    },
    {
        id: "inferred" as const,
        title: "Inferidas",
        hint: "Menos de 4 dígitos, pero un solo candidato compatible. Revisa la evidencia.",
    },
    {
        id: "pending" as const,
        title: "Pendientes",
        hint: "Ambiguas o sin candidato. No entran a ningún saldo hasta que decidas.",
    },
];

/**
 * Conciliación del historial, en tres secciones por orden de esfuerzo: lo que
 * se resolvió solo, lo que se infirió y hay que revisar, y lo que necesita que
 * el usuario decida.
 */
export function ReconcileClient({ initialData }: { initialData: ReconcileState }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);

    const total = initialData.exact.length + initialData.inferred.length + initialData.pending.length;

    async function confirmar() {
        setConfirming(true);
        const result = await confirmReconcileAction();
        setConfirming(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success(
            `${result.data.confirmed} identidades confirmadas, ${result.data.relinked} movimientos re-apuntados`,
        );
        router.refresh();
    }

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center gap-3">
                <Link
                    href="/financial/banks"
                    aria-label="Volver a Bancos"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-xl font-bold tracking-tight">Conciliar cuentas</h1>
                    <p className="truncate text-xs text-muted-foreground">
                        {initialData.exact.length} exactas · {initialData.inferred.length} inferidas
                        {" · "}{initialData.pending.length} pendientes
                    </p>
                </div>
            </header>

            {total === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 opacity-20" />
                    <p className="font-medium text-foreground">No hay nada que conciliar</p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                        Todos los números detectados en tus escaneos ya están identificados.
                    </p>
                </div>
            ) : (
                <>
                    <p className="flex items-start gap-2.5 rounded-2xl border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            Nada de esto <b>no entra a tus saldos hasta que lo confirmes</b>.
                            Marca como ajena cualquier cuenta que no sea tuya.
                        </span>
                    </p>

                    {SECTIONS.map(section => {
                        const groups = initialData[section.id];
                        if (groups.length === 0) return null;

                        return (
                            <section key={section.id} className="flex flex-col gap-2">
                                <header className="pt-1">
                                    <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        {section.title} · {groups.length}
                                    </h2>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                                        {section.hint}
                                    </p>
                                </header>

                                {groups.map(group => (
                                    <ReconcileGroupCard
                                        key={group.key}
                                        group={group}
                                        identities={initialData.identities}
                                        section={section.id}
                                    />
                                ))}
                            </section>
                        );
                    })}

                    <Button onClick={confirmar} disabled={confirming} className="mt-1 w-full">
                        {confirming
                            ? "Confirmando…"
                            : `Confirmar y re-apuntar ${initialData.totalMovements} movimientos`}
                    </Button>
                </>
            )}
        </div>
    );
}

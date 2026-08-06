"use client";

import { useEffect, useState } from "react";
import { DollarSign, FileJson, Hash, Mail, Tag, Zap, Database } from "lucide-react";
import { FieldCard } from "@/components/ui/field-card";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";
import { createClient } from "@/infrastructure/supabase/client";

interface ScanOriginalDataProps {
    transaction: FinancialScannerTransaction;
}

/**
 * What the scan actually extracted, read-only.
 *
 * Kept consultable while confirming: the values in the form are the resolved
 * ones (institution matched to an existing one, amount parsed), so being able
 * to check them against the raw email is what makes a confirmation informed.
 */
export function ScanOriginalData({ transaction }: ScanOriginalDataProps) {
    const originStats = transaction.originStats as Record<string, unknown> | null | undefined;
    const isEmailOrigin = originStats?.origin === "email";

    const [triggerSource, setTriggerSource] = useState<string>("Cargando...");

    useEffect(() => {
        if (!transaction.executionId) {
            setTriggerSource("N/A");
            return;
        }

        async function fetchExecution() {
            const supabase = createClient();
            const { data, error } = await supabase
                .from("financial_scanner_executions")
                .select("*")
                .eq("execution_id", transaction.executionId)
                .single();

            if (data) {
                // Some sources might use the `source` column, others might embed it in `request_payload` or `stats`
                const src = data.trigger_source || data.source || data.request_payload?.trigger_source || "N/A";
                setTriggerSource(src);
            } else {
                setTriggerSource("N/A");
                if (error) console.error("Error fetching execution:", error);
            }
        }

        fetchExecution();
    }, [transaction.executionId]);

    return (
        <div className="rounded-2xl border border-border/40 bg-bg-secondary/30 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                <FileJson className="h-3.5 w-3.5" /> Datos originales extraídos
            </p>

            <div className="grid grid-cols-2 gap-2">
                <FieldCard icon={<Database className="h-3.5 w-3.5" />} iconClass="bg-blue-500/15 text-blue-500" label="Origin (Payload)">
                    <p className="break-all font-mono text-xs text-text-secondary">
                        {String(originStats?.origin || "N/A")}
                    </p>
                </FieldCard>
                <FieldCard icon={<Zap className="h-3.5 w-3.5" />} iconClass="bg-purple-500/15 text-purple-500" label="Trigger Source">
                    <p className="break-all font-mono text-xs text-text-secondary">{triggerSource}</p>
                </FieldCard>
                <FieldCard icon={<Hash className="h-3.5 w-3.5" />} iconClass="bg-slate-500/15 text-slate-400" label="Hash / Ref">
                    <p className="break-all font-mono text-xs text-text-secondary">{transaction.hash || "N/A"}</p>
                </FieldCard>
                <FieldCard icon={<FileJson className="h-3.5 w-3.5" />} iconClass="bg-slate-500/15 text-slate-400" label="ID Ejecución">
                    <p className="break-all font-mono text-xs text-text-secondary">{transaction.executionId || "N/A"}</p>
                </FieldCard>
            </div>

            {isEmailOrigin && (
                <div className="mt-3 space-y-2 rounded-xl border border-border/40 bg-bg-primary/40 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        <Mail className="h-3.5 w-3.5" /> Detalles del correo
                    </p>
                    {typeof originStats?.from === "string" && (
                        <p className="break-all font-mono text-xs text-text-secondary"><span className="text-text-tertiary">De: </span>{originStats.from}</p>
                    )}
                    {typeof originStats?.to === "string" && (
                        <p className="break-all font-mono text-xs text-text-secondary"><span className="text-text-tertiary">Para: </span>{originStats.to}</p>
                    )}
                    {typeof originStats?.subject === "string" && (
                        <p className="text-xs text-text-secondary"><span className="text-text-tertiary">Asunto: </span>{originStats.subject}</p>
                    )}
                </div>
            )}

            <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-text-tertiary">
                    Payload (origin stats)
                </summary>
                <pre className="mt-1.5 max-h-[240px] overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-border/40 bg-bg-primary/40 p-3 font-mono text-[11px] text-text-secondary">
                    {originStats ? JSON.stringify(originStats, null, 2) : "Sin datos adicionales"}
                </pre>
            </details>
        </div>
    );
}

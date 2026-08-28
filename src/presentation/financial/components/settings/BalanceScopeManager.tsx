"use client";

import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { BalanceMode, BalanceScopeRule, BalanceScopeTargetType } from "@/domain/entities/balance";
import { BALANCE_MODES } from "@/domain/entities/balance";
import { resolveScope } from "@/domain/services/balance-scope";
import {
    setBalanceDefaultModeAction, setBalanceScopeRuleAction, clearBalanceScopeAction,
} from "@/app/actions/balance";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<BalanceMode, string> = {
    TOTAL: "Total",
    PERIOD: "Del periodo",
    PERIOD_WITH_CREDIT: "Con tarjetas",
};

const MODE_HINT: Record<BalanceMode, string> = {
    TOTAL: "Suma de los saldos de tus cuentas con saldo declarado. No depende del rango ni de esta configuración.",
    PERIOD: "Ingresos menos gastos reales del rango, restando ahorros y sumando fondeos. Los consumos con tarjeta no cuentan hasta que pagas.",
    PERIOD_WITH_CREDIT: "Igual que el del periodo, restando además los consumos con tarjeta del rango.",
};

interface ScopeItem {
    id: string;
    institutionId: string | null;
    label: string;
}

interface BalanceScopeManagerProps {
    defaultMode: BalanceMode;
    initialRules: BalanceScopeRule[];
    institutions: { id: string; name: string }[];
    accounts: ScopeItem[];
    cards: ScopeItem[];
}

/**
 * Qué bancos, cuentas y tarjetas alimentan los balances de periodo.
 *
 * Guarda solo excepciones: un banco sin regla está incluido y sus cuentas
 * heredan, así que una cuenta que el escáner cree mañana entra sola.
 */
export function BalanceScopeManager({
    defaultMode, initialRules, institutions, accounts, cards,
}: BalanceScopeManagerProps) {
    const [mode, setMode] = useState<BalanceMode>(defaultMode);
    const [rules, setRules] = useState<BalanceScopeRule[]>(initialRules);
    const [expanded, setExpanded] = useState<string | null>(null);

    const scope = useMemo(() => resolveScope(rules, { accounts, cards }), [rules, accounts, cards]);

    const itemsOf = (institutionId: string): ScopeItem[] => [
        ...accounts.filter(a => a.institutionId === institutionId),
        ...cards.filter(c => c.institutionId === institutionId),
    ];

    /** Estado local optimista; si la action falla, se revierte. */
    async function applyRule(
        targetType: BalanceScopeTargetType,
        targetId: string,
        included: boolean,
        clearTargetIds?: string[],
    ) {
        const previous = rules;
        const now = new Date().toISOString();
        const dropped = new Set(clearTargetIds ?? []);

        setRules([
            ...rules.filter(r => !dropped.has(r.targetId) && !(r.targetType === targetType && r.targetId === targetId)),
            {
                id: `${targetType}:${targetId}`,
                ownerUserId: "",
                targetType,
                targetId,
                included,
                createdAt: now,
                updatedAt: now,
                isDeleted: false,
            },
        ]);

        const result = await setBalanceScopeRuleAction({ targetType, targetId, included, clearTargetIds });
        if (!result.success) setRules(previous);
    }

    async function changeMode(next: BalanceMode) {
        const previous = mode;
        setMode(next);
        const result = await setBalanceDefaultModeAction(next);
        if (!result.success) setMode(previous);
    }

    async function reset() {
        const previous = rules;
        setRules([]);
        const result = await clearBalanceScopeAction();
        if (!result.success) setRules(previous);
    }

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">Balance por defecto</h3>
                <p className="text-xs text-text-secondary">
                    El que aparece al abrir cada pantalla. Siempre puedes cambiarlo desde el propio balance.
                </p>
                <div className="space-y-2">
                    {BALANCE_MODES.map((option) => (
                        <label
                            key={option}
                            className={cn(
                                "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                                mode === option
                                    ? "border-accent-primary/50 bg-accent-primary/5"
                                    : "border-border/40 bg-bg-secondary/40 hover:bg-bg-hover",
                            )}
                        >
                            <input
                                type="radio"
                                name="default-balance-mode"
                                value={option}
                                checked={mode === option}
                                onChange={() => changeMode(option)}
                                className="mt-1 shrink-0"
                            />
                            <span className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium text-text-primary">{MODE_LABEL[option]}</span>
                                <span className="text-xs leading-snug text-text-secondary">{MODE_HINT[option]}</span>
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-text-primary">Qué entra en el balance</h3>
                        <p className="text-xs text-text-secondary">
                            Aplica al balance del periodo y al de tarjetas. El total siempre suma todo.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={reset} className="shrink-0 gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restablecer
                    </Button>
                </div>

                <ul className="divide-y divide-border/40 rounded-xl border border-border/40">
                    {institutions.map((institution) => {
                        const items = itemsOf(institution.id);
                        const includedCount = items.filter(i => scope.isAccountIncluded(i.id)).length;
                        // Con items.length === 0, "includedCount === items.length" y
                        // "includedCount === 0" son AMBAS ciertas (0 === 0): un banco
                        // sin cuentas ni tarjetas quedaría siempre marcado como
                        // "todo incluido" sin importar la regla guardada, así que un
                        // clic escribiría una excepción invisible — el checkbox nunca
                        // reflejaría el cambio. Sin items que contar, la única fuente
                        // honesta es la regla de banco misma.
                        const bankRule = rules.find(
                            r => !r.isDeleted && r.targetType === "INSTITUTION" && r.targetId === institution.id,
                        );
                        const allIn = items.length > 0 ? includedCount === items.length : (bankRule?.included ?? true);
                        const noneIn = items.length > 0 ? includedCount === 0 : bankRule?.included === false;
                        const isOpen = expanded === institution.id;

                        return (
                            <li key={institution.id}>
                                <div className="flex items-center gap-3 p-3">
                                    <Checkbox
                                        aria-label={institution.name}
                                        checked={allIn ? true : noneIn ? false : "indeterminate"}
                                        onCheckedChange={() => applyRule(
                                            "INSTITUTION",
                                            institution.id,
                                            // Parcial o excluido pasa a incluido entero.
                                            !allIn,
                                            items.map(i => i.id),
                                        )}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setExpanded(isOpen ? null : institution.id)}
                                        className="flex flex-1 items-center justify-between gap-2 text-left"
                                    >
                                        <span className="flex flex-col">
                                            <span className="text-sm font-medium text-text-primary">{institution.name}</span>
                                            <span className="text-xs text-text-secondary">
                                                {includedCount} de {items.length} incluidas
                                            </span>
                                        </span>
                                        <ChevronDown
                                            className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>

                                {isOpen && (
                                    <ul className="space-y-1 border-t border-border/30 bg-bg-secondary/30 p-3 pl-10">
                                        {items.map((item) => (
                                            <li key={item.id} className="flex items-center gap-3">
                                                <Checkbox
                                                    aria-label={item.label}
                                                    checked={scope.isAccountIncluded(item.id)}
                                                    onCheckedChange={(checked) => applyRule(
                                                        cards.some(c => c.id === item.id) ? "CARD" : "ACCOUNT",
                                                        item.id,
                                                        checked === true,
                                                    )}
                                                />
                                                <span className="text-sm text-text-primary">{item.label}</span>
                                            </li>
                                        ))}
                                        {items.length === 0 && (
                                            <li className="text-xs text-text-secondary">
                                                Este banco todavía no tiene cuentas ni tarjetas.
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}

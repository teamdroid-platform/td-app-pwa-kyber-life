"use client";

import { Clock, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FinancialTransactionType } from "@/domain/entities/financial";
import { AmountHeroInput } from "../../AmountHeroInput";
import { TransactionTypeChips } from "../../TransactionTypeChips";
import { StepHeading } from "../WizardShell";

const MAX_DESCRIPTION = 120;

/** How many suggestions the step offers, matching what the query returns. */
const MAX_SUGGESTIONS = 5;

/** Plural, lowercase, for the line that introduces the suggestions. */
const SUGGESTION_SCOPE: Record<string, string> = {
    EXPENSE: "gastos",
    INCOME: "ingresos",
    TRANSFER: "transferencias",
    WITHDRAWAL: "retiros",
};

/** Placeholder widths, so the loading row reads as chips and not as a bar. */
const SKELETON_WIDTHS = ["w-28", "w-20", "w-32"];

interface AmountStepProps {
    amount: string;
    onAmountChange: (value: string) => void;
    currency: string;
    type: FinancialTransactionType;
    onTypeChange: (value: FinancialTransactionType) => void;
    description: string;
    onDescriptionChange: (value: string) => void;
    /** The user's most used descriptions for this type, offered as one-tap answers. */
    suggestions: string[];
    /** True while the suggestions are still being fetched. */
    suggestionsLoading?: boolean;
}

/**
 * Step 1 — amount, type and description.
 *
 * The description shares this screen because it is the transaction's title
 * everywhere (`getTransactionDisplayTitle` falls back to "Gasto – Supermaxi"
 * without it), so it cannot be a field the user scrolls past. The suggestions —
 * the user's most used descriptions for the selected type — exist so that
 * requiring it costs a tap rather than a sentence.
 */
export function AmountStep({
    amount,
    onAmountChange,
    currency,
    type,
    onTypeChange,
    description,
    onDescriptionChange,
    suggestions,
    suggestionsLoading = false,
}: AmountStepProps) {
    // Never offer what's already typed; it would read as a no-op.
    const unused = suggestions
        .filter((s) => s.toLowerCase() !== description.trim().toLowerCase())
        .slice(0, MAX_SUGGESTIONS);

    const scope = SUGGESTION_SCOPE[type] ?? "transacciones";

    return (
        <>
            <StepHeading question="¿Cuánto fue?" />

            <AmountHeroInput amount={amount} onChange={onAmountChange} currency={currency} />

            <TransactionTypeChips value={type} onChange={onTypeChange} />

            <div className="flex flex-col gap-2">
                <label htmlFor="description" className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <FileText className="h-4 w-4 text-accent-primary" />
                    ¿En qué fue?
                </label>
                <Input
                    id="description"
                    name="description"
                    type="text"
                    maxLength={MAX_DESCRIPTION}
                    placeholder="Ej. Compra semanal"
                    value={description}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    autoComplete="off"
                />
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-text-tertiary">Así se verá en tu listado de transacciones.</p>
                    <span className="shrink-0 text-[11px] text-text-tertiary">{description.length}/{MAX_DESCRIPTION}</span>
                </div>

                {/* While they load, the same heading and chip-shaped placeholders
                    hold the space — an empty gap that fills in later reads as a
                    layout jump, not as progress. */}
                {suggestionsLoading ? (
                    <>
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                            Tus más usadas en {scope}
                        </p>
                        <div className="flex flex-wrap gap-1.5" aria-hidden="true">
                            {SKELETON_WIDTHS.map((width) => (
                                <span
                                    key={width}
                                    className={`h-[30px] ${width} animate-pulse rounded-full border border-border/30 bg-bg-secondary/60`}
                                />
                            ))}
                        </div>
                        <span className="sr-only" role="status">Cargando tus descripciones más usadas</span>
                    </>
                ) : unused.length > 0 && (
                    <>
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                            Tus más usadas en {scope}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {unused.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => onDescriptionChange(suggestion)}
                                    className="flex max-w-full items-center gap-1.5 rounded-full border border-border/40 bg-bg-secondary/60 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent-primary/50 hover:text-text-primary"
                                >
                                    <Clock className="h-3 w-3 shrink-0 text-text-tertiary" />
                                    <span className="truncate">{suggestion}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

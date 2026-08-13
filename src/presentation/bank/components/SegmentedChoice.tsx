"use client";

import { cn } from "@/lib/utils";

interface SegmentedChoiceProps<T extends string> {
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (value: T) => void;
    "aria-label"?: string;
}

/** Selector de dos o tres opciones excluyentes, al estilo de los chips del wizard. */
export function SegmentedChoice<T extends string>({
    value, options, onChange, ...rest
}: SegmentedChoiceProps<T>) {
    return (
        <div className="flex gap-1.5" role="group" aria-label={rest["aria-label"]}>
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    aria-pressed={value === option.value}
                    className={cn(
                        "flex-1 rounded-xl border px-3 py-2 text-sm transition-colors",
                        value === option.value
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

import { ChevronRight, ClipboardList, MessageSquareText, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewTransactionDialog } from "@/presentation/financial/components/ai-capture/NewTransactionDialog";
import type { CaptureMethod } from "@/presentation/financial/components/ai-capture/CaptureMethodChooser";
import { CARD } from "./ui";

/**
 * Las tres vías, cada una con su color.
 *
 * El tinte no adorna: son tres filas del mismo tamaño y sin él la única
 * diferencia entre ellas sería leer la etiqueta. El verde encabeza porque es
 * el color con el que el sistema habla de dinero.
 */
const WAYS: {
    id: CaptureMethod;
    label: string;
    hint: string;
    Icon: typeof Mic;
    className: string;
    iconClassName: string;
}[] = [
    {
        id: "voice", label: "Audio", hint: "Dilo y la app lo interpreta.", Icon: Mic,
        className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/70",
        iconClassName: "bg-emerald-500/20 text-emerald-300",
    },
    {
        id: "text", label: "Texto", hint: "Descríbelo en tus propias palabras.", Icon: MessageSquareText,
        className: "border-violet-500/35 bg-violet-500/10 text-violet-300 hover:border-violet-500/70",
        iconClassName: "bg-violet-500/20 text-violet-300",
    },
    {
        id: "form", label: "Formulario", hint: "Completa todos los detalles.", Icon: ClipboardList,
        className: "border-amber-500/35 bg-amber-500/10 text-amber-300 hover:border-amber-500/70",
        iconClassName: "bg-amber-500/20 text-amber-300",
    },
];

/**
 * Cada vía ocupa una fila alta —la tarjeta llega hasta el pie de los paneles—,
 * así que el contenido va a la escala de esa fila: icono grande, rótulo de
 * titular y descripción legible. Con el cuerpo pequeño de una lista, las tres
 * filas eran tres islas de texto flotando en un hueco.
 */
const ROW = "flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-colors";

/**
 * La acción principal del inicio: anotar lo que se acaba de gastar.
 *
 * Va primero y ocupa su propia columna porque es el único botón por el que la
 * mayoría entra; las cifras de al lado se leen después, o no se leen.
 */
export function CaptureCard({ className }: { className?: string }) {
    return (
        <section className={cn(
            CARD,
            "relative overflow-hidden !rounded-3xl p-4 sm:p-5",
            className,
        )}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-emerald-500" />
            <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-500/[0.08] to-transparent"
            />

            <div className="relative flex h-full flex-col">
                <h2 className="text-[22px] font-bold tracking-tight text-text-primary">Registrar un movimiento</h2>
                <p className="mt-1 text-[14px] text-text-tertiary">Elige cómo deseas registrar tu movimiento.</p>

                {/* Las tres filas se reparten el alto sobrante: la tarjeta llega
                    hasta el pie de los paneles de al lado, y con alto fijo dejaría
                    un hueco muerto al final. Quitar una vía no encoge la tarjeta:
                    las que quedan crecen para ocupar lo mismo. */}
                <div className="mt-5 grid flex-1 auto-rows-fr gap-3">
                    {WAYS.map(({ id, label, hint, Icon, className: tone, iconClassName }) => (
                        <NewTransactionDialog key={id} startWith={id}>
                            <button type="button" className={cn(ROW, tone)}>
                                <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", iconClassName)}>
                                    <Icon className="h-6 w-6" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[17px] font-bold leading-tight">{label}</span>
                                    <span className="mt-0.5 block truncate text-[13px] text-text-tertiary">{hint}</span>
                                </span>
                                <ChevronRight className="h-5 w-5 shrink-0 opacity-70" />
                            </button>
                        </NewTransactionDialog>
                    ))}
                </div>
            </div>
        </section>
    );
}

import type { ScannedAccountView } from "@/application/services/bank-service";

export interface ChosenPaymentSides {
    /** La tarjeta y/o la cuenta de la que salió el dinero. */
    source: readonly (string | null | undefined)[];
    /** La cuenta a la que entró. */
    destination: string | null | undefined;
}

/**
 * Lo que queda del recorrido detectado una vez aplicada la elección del usuario.
 *
 * Cada lado se decide por separado. Si el usuario eligió una cuenta para un
 * lado, la lectura detectada de ese lado sobra salvo que diga lo mismo (que
 * apunte a esa misma cuenta): una lectura sin registrar o distinta solo
 * contradice lo elegido. El lado sin elección conserva lo detectado.
 *
 * Antes bastaba con que hubiera una lectura cualquiera para que el resumen
 * mostrara solo el recorrido, y la cuenta elegida desaparecía de la fila.
 */
export function trailBesideChoice(
    views: readonly ScannedAccountView[],
    chosen: ChosenPaymentSides,
): ScannedAccountView[] {
    const sourcePicks = chosen.source.filter((id): id is string => !!id);

    return views.filter(view => {
        const picks = view.role === "SOURCE"
            ? sourcePicks
            : chosen.destination ? [chosen.destination] : [];
        if (picks.length === 0) return true;
        return !!view.match && picks.includes(view.match.id);
    });
}

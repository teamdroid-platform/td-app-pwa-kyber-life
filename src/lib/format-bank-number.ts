export interface BankNumberParts {
    lastFour?: string | null;
    prefixDigits?: string | null;
}

/**
 * Cómo se muestra un número de cuenta o tarjeta.
 *
 * Las tarjetas llevan cuatro equis, las cuentas cuatro puntos. Mismo largo en
 * ambos casos: lo que las distingue a simple vista es el glifo, no el conteo.
 *
 * Decide por el tipo de entidad y nunca por el largo del número — una tarjeta
 * sin BIN conocido sigue siendo una tarjeta. La cadena cruda que escribió el
 * banco no llega hasta aquí: vive en `bank_number_observations` y solo se
 * muestra en la pantalla de conciliación, como evidencia.
 */
export function formatBankNumber(
    parts: BankNumberParts,
    kind: 'ACCOUNT' | 'CARD',
): string {
    const mask = kind === 'CARD' ? 'XXXX' : '••••';
    const prefix = parts.prefixDigits ?? '';
    const suffix = parts.lastFour ?? '';

    if (!prefix && !suffix) return '';

    return `${prefix}${mask}${suffix}`;
}

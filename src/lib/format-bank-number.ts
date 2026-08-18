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

/**
 * El número reducido a sus cuatro últimos dígitos: `····0814`.
 *
 * Un mismo listado mezclaba `493176XXXX2780`, `25••••10` y `XXXX8361`, y una
 * cuenta de ahorros con seis dígitos de prefijo terminaba pareciendo una
 * tarjeta. Lo que identifica son los cuatro finales; el resto es ruido que
 * empuja al banco fuera de la fila. El número completo sigue disponible como
 * evidencia, en el `title` y en la pantalla de conciliación.
 */
export function formatLastFour(parts: BankNumberParts): string {
    const suffix = (parts.lastFour ?? "").trim();
    return suffix ? `····${suffix}` : "";
}

/**
 * La cola de un número ya enmascarado: `493176XXXX2780` → `····2780`.
 *
 * Se toman los dígitos que van **después** de la máscara, no los cuatro
 * últimos de la cadena: en `25••••10` el «25» es prefijo y el sufijo conocido
 * son dos dígitos, así que devolver `····2510` inventaría un número que el
 * banco nunca escribió. Cuando solo se conocen dos, se muestran dos.
 */
export function lastFourOfDisplay(display: string): string {
    const masked = display.match(/[•X]+(\d*)$/);
    if (masked) return `····${masked[1]}`;

    const digits = display.replace(/\D/g, "");
    return digits ? `····${digits.slice(-4)}` : display;
}

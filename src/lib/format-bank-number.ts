export interface BankNumberParts {
    lastFour?: string | null;
    prefixDigits?: string | null;
}

/** Todo número mostrado en un listado ocupa exactamente esto. */
export const IDENTITY_NUMBER_LENGTH = 8;

const MASK_CHAR = "X";

/**
 * El número tal como se guardó, con máscara entre principio y final.
 *
 * Es la forma **fiel**: no recorta ni rellena nada, así que alimenta el campo
 * editable de los formularios sin perder dígitos al guardar. Un
 * `493176XXXX2780` que se abriera como `XXXX2780` borraría el prefijo de la
 * base en cuanto el usuario pulsara guardar.
 *
 * Cuenta y tarjeta usan la misma máscara: distinguirlas era trabajo del glifo
 * cuando no había nada más, pero desde que cada fila lleva su acrónimo —AHO,
 * TCR— el punto contra la equis solo añadía dos formas de escribir lo mismo.
 */
export function formatBankNumber(parts: BankNumberParts): string {
    const prefix = parts.prefixDigits ?? '';
    const suffix = parts.lastFour ?? '';

    if (!prefix && !suffix) return '';

    return `${prefix}${MASK_CHAR.repeat(4)}${suffix}`;
}

/**
 * El número como se muestra en un listado: siempre {@link IDENTITY_NUMBER_LENGTH}
 * caracteres.
 *
 * Un mismo listado mezclaba `XXXX0814`, `XXXXX111` y `XXXXXX10` con largos
 * distintos, y la columna se veía rota. Lo que se estira para igualarlos es la
 * **máscara**, nunca los dígitos: en `25••••10` el banco solo dio dos finales,
 * y rellenar hasta cuatro escribiría un `0010` que no existe.
 *
 * El prefijo se muestra si cabe —`25XXXX10` dice más que `XXXXXX10`—, y cede el
 * sitio cuando no: el final identifica la cuenta y el principio no.
 */
export function formatIdentityNumber(parts: BankNumberParts): string {
    const prefix = (parts.prefixDigits ?? "").trim();
    const suffix = (parts.lastFour ?? "").trim();

    // Sin cola no hay nada que mostrar. Un prefijo suelto —un BIN de seis—
    // identifica al emisor, no a la cuenta: puesto en una lista donde todas las
    // demás terminan en dígitos comparables, invitaría a compararlo con ellas.
    if (!suffix) return "";

    // Un sufijo imposiblemente largo se recorta por el final, que es la parte
    // que identifica.
    const tail = suffix.slice(-IDENTITY_NUMBER_LENGTH);

    // Al menos una equis: sin máscara el número parecería completo, y afirmar
    // que se conoce entero es justo lo que no se puede afirmar.
    const roomForPrefix = IDENTITY_NUMBER_LENGTH - tail.length - 1;
    const head = prefix.length <= roomForPrefix ? prefix : "";

    const mask = MASK_CHAR.repeat(IDENTITY_NUMBER_LENGTH - head.length - tail.length);
    return `${head}${mask}${tail}`;
}

/**
 * Lo mismo, partiendo de una cadena ya enmascarada: `493176XXXX2780` →
 * `XXXX2780`, `25••••10` → `25XXXX10`.
 *
 * Se separan los dígitos que van **antes** y **después** de la máscara, no los
 * cuatro últimos de la cadena: en `25••••10` el «25» es prefijo, así que leer
 * «2510» como final inventaría un número que el banco nunca escribió.
 */
export function identityNumberFromDisplay(display: string): string {
    const masked = display.match(/^\D*(\d*)[•X×x*·●#]+(\d*)\D*$/);
    if (masked) {
        return formatIdentityNumber({ prefixDigits: masked[1], lastFour: masked[2] });
    }

    const digits = display.replace(/\D/g, "");
    return digits ? formatIdentityNumber({ lastFour: digits.slice(-4) }) : display;
}

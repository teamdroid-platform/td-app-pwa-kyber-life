/**
 * Fija la zona horaria de toda la ejecución de Jest antes de que arranquen
 * los workers.
 *
 * Hay pruebas (p. ej. la fecha por defecto del pago de tarjeta en
 * `CardDetailClient.test.tsx`) que distinguen a propósito la hora local de la
 * UTC; sin un huso fijo solo "prueban algo" quien corre la suite en una
 * máquina en UTC-5, y en cualquier otra máquina (típicamente UTC) no
 * comprobarían nada o fallarían. `globalSetup` corre una sola vez en el
 * proceso principal, antes de que Jest reparta los tests entre workers, así
 * que `process.env.TZ` queda fijado en el entorno que heredan los procesos
 * hijos — a diferencia de fijarlo en `jest.setup.js` (que corre ya dentro de
 * cada worker), esto es fiable también en Windows.
 *
 * America/Guayaquil es UTC-5 todo el año, sin horario de verano, así que la
 * ejecución es determinista en cualquier fecha.
 */
module.exports = async function globalSetup() {
    process.env.TZ = "America/Guayaquil";
};

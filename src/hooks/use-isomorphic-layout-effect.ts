import { useEffect, useLayoutEffect } from "react";

/**
 * `useLayoutEffect` en el navegador y `useEffect` al renderizar en el servidor.
 *
 * Un efecto de disposición no puede correr en el servidor —no hay ventana que
 * medir—, y React avisa por consola cada vez que un componente de cliente se
 * pinta ahí con uno. Este alias calla ese aviso sin renunciar a lo que hace
 * falta en el navegador: correr antes de que la pantalla siguiente pinte.
 */
export const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

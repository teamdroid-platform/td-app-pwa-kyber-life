import Link from "next/link";
import {
    ChevronRight, ClipboardList, Inbox, Landmark, Receipt, Settings, ShoppingBag, ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD, IconTile, SectionLabel, type Tint } from "./ui";

interface Access {
    href: string;
    title: string;
    hint: string;
    Icon: typeof Receipt;
    tint: Tint;
    /**
     * Accesos que solo aparecen de `lg` para arriba: en móvil alargarían la
     * lista con lo que casi nunca se toca, y el menú lateral ya lleva a todos.
     */
    desktopOnly?: boolean;
}

/**
 * Una fila por destino, agrupadas por módulo.
 *
 * En escritorio son cuatro columnas: arriba finanzas, abajo market, y la
 * configuración de cada módulo cierra su propia fila.
 */
const ACCESSES: Access[] = [
    { href: "/financial/transactions", title: "Transacciones", hint: "Historial y filtros", Icon: Receipt, tint: "violet" },
    { href: "/financial/banks", title: "Bancos", hint: "Cuentas y tarjetas", Icon: Landmark, tint: "blue" },
    { href: "/financial/scans", title: "Escaneos", hint: "Comprobantes", Icon: Inbox, tint: "sky", desktopOnly: true },
    { href: "/financial/settings", title: "Configuración de finanzas", hint: "Categorías y reglas", Icon: Settings, tint: "emerald", desktopOnly: true },
    { href: "/market/purchases", title: "Compras", hint: "Listas y productos", Icon: ShoppingBag, tint: "rose" },
    { href: "/market/purchases/new", title: "Nueva compra", hint: "Agregar a la lista", Icon: ShoppingCart, tint: "cyan" },
    { href: "/market/templates", title: "Plantillas", hint: "Mis plantillas", Icon: ClipboardList, tint: "amber", desktopOnly: true },
    { href: "/market/settings", title: "Configuración de market", hint: "Tiendas y unidades", Icon: Settings, tint: "cyan", desktopOnly: true },
];

/**
 * A dónde ir.
 *
 * En estrecho es una lista continua dentro de una sola tarjeta —cuatro filas,
 * las de todos los días—; en cuanto el contenedor da de sí, cada acceso se
 * despega en su propia tarjeta: dos columnas primero y cuatro cuando hay
 * sitio de sobra.
 *
 * Los cortes miran el ancho del contenedor `home`, no el de la ventana: este
 * bloque vive dentro del `main`, que la barra lateral estrecha 256px sin que
 * la ventana cambie de tamaño.
 */
export function QuickAccess() {
    return (
        <section>
            <SectionLabel>Accesos rápidos</SectionLabel>

            <div className={cn(
                CARD,
                "overflow-hidden",
                "@4xl/home:grid @4xl/home:grid-cols-2 @4xl/home:gap-3 @4xl/home:overflow-visible @4xl/home:rounded-none @4xl/home:border-0 @4xl/home:bg-transparent @4xl/home:backdrop-blur-none",
                "@6xl/home:grid-cols-4",
            )}>
                {ACCESSES.map(({ href, title, hint, Icon, tint, desktopOnly }) => (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            "items-center gap-3 border-b border-border-base px-3.5 py-3 transition-colors last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40",
                            "@4xl/home:rounded-2xl @4xl/home:border @4xl/home:border-slate-200/80 @4xl/home:bg-white/90 @4xl/home:shadow-sm @4xl/home:shadow-slate-200/50 @4xl/home:hover:border-indigo-300 @4xl/home:hover:shadow-md @4xl/home:dark:border-indigo-500/20 @4xl/home:dark:bg-slate-900/60 @4xl/home:dark:shadow-md @4xl/home:dark:shadow-black/20 @4xl/home:dark:hover:border-indigo-500/40",
                            desktopOnly ? "hidden @4xl/home:flex" : "flex",
                        )}
                    >
                        <IconTile tint={tint} size="sm"><Icon className="h-4 w-4" /></IconTile>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-text-primary">{title}</span>
                            <span className="block truncate text-[11px] text-text-tertiary">{hint}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
                    </Link>
                ))}
            </div>
        </section>
    );
}

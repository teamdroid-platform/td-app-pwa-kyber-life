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
 * En móvil es una lista continua dentro de una sola tarjeta —cuatro filas, las
 * de todos los días—; de `lg` para arriba cada acceso se despega en su propia
 * tarjeta y se reparten en cuatro columnas.
 */
export function QuickAccess() {
    return (
        <section>
            <SectionLabel>Accesos rápidos</SectionLabel>

            <div className={cn(
                CARD,
                "overflow-hidden",
                "lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:backdrop-blur-none",
            )}>
                {ACCESSES.map(({ href, title, hint, Icon, tint, desktopOnly }) => (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            "items-center gap-3 border-b border-border-base px-3.5 py-3 transition-colors last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40",
                            "lg:rounded-2xl lg:border lg:border-slate-200/80 lg:bg-white/90 lg:shadow-sm lg:shadow-slate-200/50 lg:hover:border-indigo-300 lg:hover:shadow-md lg:dark:border-indigo-500/20 lg:dark:bg-slate-900/60 lg:dark:shadow-md lg:dark:shadow-black/20 lg:dark:hover:border-indigo-500/40",
                            desktopOnly ? "hidden lg:flex" : "flex",
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

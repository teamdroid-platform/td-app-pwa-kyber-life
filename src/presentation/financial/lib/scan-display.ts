import {
    Utensils, Car, HeartPulse, Lightbulb, Ticket, ShoppingCart,
    GraduationCap, Home, Dog, TrendingUp, ArrowRightLeft, Wallet, Receipt,
} from "lucide-react";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";

/**
 * Cómo se presenta un escaneo: su icono y color según la categoría que el
 * escáner adivinó, su importe, su hora y su resumen.
 *
 * Salió de `FinancialInbox` cuando el escritorio estrenó la tabla. La bandeja
 * de móvil y la tabla pintan el mismo escaneo, y el emparejado de categorías
 * —que va por palabras sueltas, no por id— no aguanta dos copias.
 */
export function formatAmount(amount?: number | null, currency = "USD") {
    if (amount == null) {
        return "--";
    }

    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * El mismo color de la categoría, servido para un chip.
 *
 * `containerClass` lleva un resplandor que funciona en el círculo del icono —
 * mide 44px y el halo lo separa del fondo— pero en una etiqueta de 20px de
 * alto emborrona el texto. Se quita el `shadow-[...]` y se conserva el resto:
 * borde, fondo y color de letra, que es lo que hace falta para que el chip y
 * el icono digan lo mismo.
 *
 * Se recorta la cadena en vez de declarar un segundo juego de clases porque
 * asi no hay dos listas de doce colores que mantener sincronizadas, y las
 * clases resultantes ya existen en el CSS: son las mismas.
 */
export function categoryChipClass(config: CategoryVisualConfig): string {
    return config.containerClass.replace(/\s*shadow-\[[^\]]*\]/g, "");
}

export interface CategoryVisualConfig {
    icon: React.ElementType;
    containerClass: string;
}

export function getCategoryVisualConfig(category?: string | null, txType?: string | null): CategoryVisualConfig {
    const cat = (category || "").toLowerCase().trim();
    const type = (txType || "").toUpperCase();

    if (
        cat.includes("aliment") ||
        cat.includes("comida") ||
        cat.includes("restauran") ||
        cat.includes("food") ||
        cat.includes("supermerc") ||
        cat.includes("cafeter")
    ) {
        return {
            icon: Utensils,
            containerClass: "border-[#FFB020]/50 bg-[#FFB020]/10 text-[#FFB020] shadow-[0_0_14px_rgba(255,176,32,0.25)]",
        };
    }
    if (
        cat.includes("transpor") ||
        cat.includes("viaje") ||
        cat.includes("taxi") ||
        cat.includes("uber") ||
        cat.includes("cabify") ||
        cat.includes("gasolin") ||
        cat.includes("combust") ||
        cat.includes("peaje")
    ) {
        return {
            icon: Car,
            containerClass: "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 shadow-[0_0_14px_rgba(6,182,212,0.25)]",
        };
    }
    if (
        cat.includes("ropa") ||
        cat.includes("calzado") ||
        cat.includes("compra") ||
        cat.includes("shop") ||
        cat.includes("tienda") ||
        cat.includes("mall") ||
        cat.includes("amazon")
    ) {
        return {
            icon: ShoppingCart,
            containerClass: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.25)]",
        };
    }
    if (
        cat.includes("transfer") ||
        type === "TRANSFER"
    ) {
        return {
            icon: ArrowRightLeft,
            containerClass: "border-purple-500/50 bg-purple-500/10 text-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.25)]",
        };
    }
    if (
        cat.includes("salud") ||
        cat.includes("farmac") ||
        cat.includes("medic") ||
        cat.includes("hospital") ||
        cat.includes("dentist")
    ) {
        return {
            icon: HeartPulse,
            containerClass: "border-rose-500/50 bg-rose-500/10 text-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.25)]",
        };
    }
    if (
        cat.includes("servici") ||
        cat.includes("luz") ||
        cat.includes("agua") ||
        cat.includes("telef") ||
        cat.includes("internet") ||
        cat.includes("electric")
    ) {
        return {
            icon: Lightbulb,
            containerClass: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400 shadow-[0_0_14px_rgba(234,179,8,0.25)]",
        };
    }
    if (
        cat.includes("entreten") ||
        cat.includes("cine") ||
        cat.includes("streaming") ||
        cat.includes("netflix") ||
        cat.includes("spotify") ||
        cat.includes("juego") ||
        cat.includes("ocio")
    ) {
        return {
            icon: Ticket,
            containerClass: "border-purple-500/50 bg-purple-500/10 text-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.25)]",
        };
    }
    if (
        cat.includes("educa") ||
        cat.includes("curso") ||
        cat.includes("universid") ||
        cat.includes("colegio") ||
        cat.includes("libro")
    ) {
        return {
            icon: GraduationCap,
            containerClass: "border-blue-500/50 bg-blue-500/10 text-blue-400 shadow-[0_0_14px_rgba(59,130,246,0.25)]",
        };
    }
    if (
        cat.includes("hogar") ||
        cat.includes("casa") ||
        cat.includes("arriendo") ||
        cat.includes("alquiler") ||
        cat.includes("mueble")
    ) {
        return {
            icon: Home,
            containerClass: "border-teal-500/50 bg-teal-500/10 text-teal-400 shadow-[0_0_14px_rgba(20,184,166,0.25)]",
        };
    }
    if (
        cat.includes("mascot") ||
        cat.includes("veterin") ||
        cat.includes("perro") ||
        cat.includes("gato")
    ) {
        return {
            icon: Dog,
            containerClass: "border-orange-500/50 bg-orange-500/10 text-orange-400 shadow-[0_0_14px_rgba(249,115,22,0.25)]",
        };
    }

    if (type === "INCOME") {
        return {
            icon: TrendingUp,
            containerClass: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.25)]",
        };
    }
    if (type === "WITHDRAWAL") {
        return {
            icon: Wallet,
            containerClass: "border-sky-500/50 bg-sky-500/10 text-sky-400 shadow-[0_0_14px_rgba(14,165,233,0.25)]",
        };
    }

    return {
        icon: Receipt,
        containerClass: "border-[#FFB020]/40 bg-[#FFB020]/10 text-[#FFB020] shadow-[0_0_14px_rgba(255,176,32,0.2)]",
    };
}


/**
 * Extract the best available summary from a scanner transaction.
 * Priority: summary → originStats.emailBody → originStats.snippet
 */

export function extractSummary(tx: FinancialScannerTransaction): string {
    if (tx.summary && tx.summary.trim() !== "") {
        return tx.summary;
    }
    const stats = tx.originStats as Record<string, unknown> | null | undefined;
    const emailBody = stats?.emailBody as string | undefined;
    if (emailBody && emailBody.trim() !== "") {
        return `[MAIL] ${emailBody}`;
    }
    const snippet = stats?.snippet as string | undefined;
    if (snippet && snippet.trim() !== "") {
        return `[SNIPPET] ${snippet}`;
    }
    return "";
}

export function formatTime(value?: string | null) {
    if (!value) {
        return "--:--";
    }

    return new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}


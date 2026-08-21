import { Home, ShoppingCart, FileText, BarChart2, Settings, Store, Package, Tag, Scale, User, Wallet, Receipt, Inbox, Landmark, LucideIcon } from "lucide-react";

export type MenuItem = {
    label: string;
    icon?: LucideIcon;
    href?: string;
    items?: MenuItem[];
    isSection?: boolean;
    activeAliases?: string[];
};

export const MENU_ITEMS: MenuItem[] = [
    { label: "Inicio", icon: Home, href: "/dashboard" },
    {
        label: "Finanzas",
        isSection: true,
        items: [
            { label: "Resumen", icon: BarChart2, href: "/financial" },
            { label: "Transacciones", icon: Receipt, href: "/financial/transactions" },
            { label: "Escaneos", icon: Inbox, href: "/financial/scans", activeAliases: ["/financial/scanner"] },
            { label: "Bancos", icon: Landmark, href: "/financial/banks" },
            { label: "Configuración", icon: Settings, href: "/financial/settings" },
        ]
    },
    {
        label: "Market",
        isSection: true,
        items: [
            { label: "Resumen", icon: BarChart2, href: "/market/analytics" },
            { label: "Compras", icon: ShoppingCart, href: "/market/purchases" },
            { label: "Plantillas", icon: FileText, href: "/market/templates" },
            { label: "Productos", icon: Package, href: "/market/items" },
            {
                label: "Configuración",
                icon: Settings,
                href: "/market/settings",
                activeAliases: ["/market/supermarkets", "/market/categories", "/market/units"]
            },
        ]
    },
    {
        label: "Cuenta",
        isSection: true,
        items: [
            { label: "Perfil", icon: User, href: "/profile" },
        ]
    }
];

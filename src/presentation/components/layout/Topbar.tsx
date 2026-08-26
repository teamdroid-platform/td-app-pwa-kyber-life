"use client";

import { Menu, Search, PanelLeft, ChevronDown, User as UserIcon, LogOut, Home } from "lucide-react";
import { NotificationBell } from "@/presentation/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MENU_ITEMS, MenuItem } from "@/config/menu-items";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/actions/auth";

interface TopbarProps {
    onMenuClick?: () => void;
    isSidebarOpen: boolean;
    onSidebarToggle: () => void;
    user: any;
}

export function Topbar({ onMenuClick, isSidebarOpen, onSidebarToggle, user }: TopbarProps) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const isHomePage = pathname === "/";

    // Flatten menu items for search
    const searchableItems = useMemo(() => {
        const items: { label: string; href: string; icon?: any, breadcrumb?: string }[] = [];

        const traverse = (menuItems: MenuItem[], parentLabel?: string) => {
            menuItems.forEach(item => {
                if (item.href && !item.isSection) {
                    items.push({
                        label: item.label,
                        href: item.href,
                        icon: item.icon,
                        breadcrumb: parentLabel
                    });
                }
                if (item.items) {
                    traverse(item.items, item.isSection ? undefined : (parentLabel ? `${parentLabel} > ${item.label}` : item.label));
                }
            });
        };

        traverse(MENU_ITEMS);
        return items;
    }, []);

    const filteredResults = useMemo(() => {
        if (!query.trim()) return [];
        const lowerQuery = query.toLowerCase();
        return searchableItems.filter(item =>
            item.label.toLowerCase().includes(lowerQuery) ||
            item.breadcrumb?.toLowerCase().includes(lowerQuery)
        );
    }, [query, searchableItems]);

    // Close search on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (href: string) => {
        setQuery("");
        setSearchOpen(false);
        setIsFocused(false);
        router.push(href);
    };

    return (
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 sm:gap-4 bg-bg-primary/60 backdrop-blur-md px-3 sm:px-4 md:px-6 transition-all duration-300">
            {/* Mobile Menu Button */}
            <Button
                variant="ghost"
                size="icon"
                className="lg:hidden hover:bg-bg-hover text-text-secondary hover:text-text-primary"
                onClick={onMenuClick}
                aria-label="Toggle menu"
            >
                <Menu className="h-5 w-5" />
            </Button>

            {/* Mobile Home Button (Visible when not on Home) */}
            {!isHomePage && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden hover:bg-bg-hover text-text-secondary hover:text-text-primary"
                    onClick={() => router.push("/")}
                    aria-label="Ir a inicio"
                    title="Inicio"
                >
                    <Home className="h-5 w-5" />
                </Button>
            )}

            {/* Desktop Search Area */}
            <div className="flex-1 max-w-xl hidden md:flex items-center gap-3" ref={wrapperRef}>
                {/* Sidebar Toggle */}
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onSidebarToggle}
                    className="shrink-0 hidden lg:flex h-10 w-10 border-border-base bg-bg-primary hover:bg-bg-secondary text-text-secondary"
                >
                    <PanelLeft className={cn("h-5 w-5 transition-transform", !isSidebarOpen && "rotate-180")} />
                </Button>

                {/* Desktop Home Button (Visible when not on Home) */}
                {!isHomePage && (
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => router.push("/")}
                        className="shrink-0 hidden md:flex h-10 w-10 border-border-base bg-bg-primary hover:bg-bg-secondary text-text-secondary hover:text-text-primary"
                        aria-label="Ir a inicio"
                        title="Inicio"
                    >
                        <Home className="h-4.5 w-4.5" />
                    </Button>
                )}

                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                    <Input
                        placeholder="Busca o escribe un comando..."
                        className="pl-9 h-10 bg-bg-primary border-border-base text-text-primary placeholder:text-text-tertiary focus:ring-accent-primary focus:border-accent-primary"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                    />

                    {/* Search Results Dropdown */}
                    {isFocused && query.trim().length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-bg-primary border border-border-base rounded-lg shadow-lg overflow-hidden py-1 max-h-[300px] overflow-y-auto z-50 animate-in fade-in zoom-in-95 duration-100">
                            {filteredResults.length > 0 ? (
                                filteredResults.map((result, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleSelect(result.href)}
                                        className="w-full text-left px-4 py-2 hover:bg-bg-secondary flex items-center gap-3 transition-colors group"
                                    >
                                        {result.icon ? (
                                            <result.icon className="w-4 h-4 text-text-tertiary group-hover:text-accent-primary" />
                                        ) : (
                                            <Search className="w-4 h-4 text-text-tertiary group-hover:text-accent-primary" />
                                        )}
                                        <div>
                                            <div className="text-sm font-medium text-text-primary group-hover:text-accent-primary">
                                                {result.label}
                                            </div>
                                            {result.breadcrumb && (
                                                <div className="text-xs text-text-tertiary">
                                                    {result.breadcrumb}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="px-4 py-3 text-sm text-text-tertiary text-center">
                                    No se encontraron resultados
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile Search Toggle */}
            <Button
                variant="ghost"
                size="icon"
                className="md:hidden hover:bg-bg-hover"
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="Toggle search"
            >
                <Search className="h-5 w-5" />
            </Button>

            {/* Spacer for mobile (pushes actions to right) */}
            <div className="flex-1 md:hidden" />

            {/* Right Actions */}
            <div className="ml-auto flex items-center gap-3">
                <ThemeToggle />

                {user?.id && <NotificationBell userId={user.id} />}

                {/* User Profile */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className="flex items-center gap-3 pl-3 border-l border-border-base ml-2 cursor-pointer group select-none hover:bg-bg-tertiary/40 rounded-full p-1.5 pr-4 transition-all duration-200">
                            <Avatar className="h-9 w-9 border border-border-base transition-all group-hover:scale-105 group-hover:ring-2 group-hover:ring-accent-primary/20 shadow-sm">
                                <AvatarImage src={user?.image} alt={user?.firstName || "User"} />
                                <AvatarFallback className="bg-gradient-to-br from-accent-primary/10 to-accent-primary/5 text-accent-primary font-bold">
                                    {user?.firstName ? user.firstName[0].toUpperCase() : (user?.email ? user.email.slice(0, 2).toUpperCase() : "US")}
                                </AvatarFallback>
                            </Avatar>

                            <div className="hidden xl:block text-left">
                                <p className="text-sm font-semibold text-text-primary leading-none group-hover:text-accent-primary transition-colors">
                                    {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user?.email?.split('@')[0] || "Usuario")}
                                </p>
                                <p className="text-[10px] text-text-tertiary font-medium mt-0.5 uppercase tracking-wide">Admin</p>
                            </div>

                            <ChevronDown className="h-4 w-4 text-text-tertiary/70 hidden xl:block transition-transform duration-200 group-data-[state=open]:rotate-180 group-hover:text-text-primary" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{(user?.firstName || user?.lastName) ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : "Usuario"}</p>
                                <p className="text-xs leading-none text-muted-foreground">{user?.email || "user@example.com"}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push('/profile')} className="cursor-pointer">
                            <UserIcon className="mr-2 h-4 w-4" />
                            <span>Perfil</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => logoutAction()} className="text-accent-danger focus:text-accent-danger cursor-pointer">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Cerrar sesión</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Mobile Search Expanded (Below on mobile when open) */}
            {searchOpen && (
                <div className="absolute top-16 left-0 right-0 p-4 bg-bg-secondary border-b border-border-base md:hidden">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                        <Input
                            placeholder="Buscar..."
                            className="pl-9 bg-bg-primary border-border-base w-full"
                            autoFocus
                        />
                    </div>
                </div>
            )}
        </header>
    );
}

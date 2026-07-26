"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { FinancialCategory } from "@/domain/entities/financial";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Tags, Lock, UserRound, ArrowUpRight, type LucideIcon } from "lucide-react";
import { createCategoryAction, updateCategoryAction, deleteCategoryAction, getCategoryTransactionCountAction, getCategoryTransactionStatsAction } from "@/app/actions/financial-settings";
import type { TransactionTypeCounts } from "@/application/services/financial-settings-service";
import { FormSheet } from "@/components/ui/form-sheet";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { UUID } from "@/domain/core";
import * as Icons from "lucide-react";
import { normalizeForMatch } from "@/lib/institution-match";
import { SettingsListControls } from "./SettingsListControls";
import { TransactionCountSummary } from "./TransactionCountSummary";
import { sortSettingsItems, type SettingsSortMode } from "../../lib/transaction-type-buckets";

interface CategoryManagerProps {
    initialData: FinancialCategory[];
}

export function CategoryManager({ initialData }: CategoryManagerProps) {
    const [categories, setCategories] = useState<FinancialCategory[]>(initialData);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<UUID | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Delete confirmation state
    const [deletingCat, setDeletingCat] = useState<FinancialCategory | null>(null);
    const [deleteCount, setDeleteCount] = useState<number | null>(null); // null while counting
    const [isDeleting, setIsDeleting] = useState(false);

    // Search / sort + background transaction stats
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SettingsSortMode>("name");
    const [stats, setStats] = useState<Record<string, TransactionTypeCounts> | null>(null);

    // Load per-category transaction counts in the background so the initial
    // render (names + actions) is never blocked.
    useEffect(() => {
        let active = true;
        getCategoryTransactionStatsAction()
            .then((res) => { if (active) setStats(res); })
            .catch(() => { if (active) setStats({}); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        setCategories(initialData);
    }, [initialData]);

    // Form state
    const [name, setName] = useState("");
    const [color, setColor] = useState("#3b82f6"); // Default blue

    const handleOpenDialog = (cat?: FinancialCategory) => {
        if (cat) {
            setEditingId(cat.id!);
            setName(cat.name);
            setColor(cat.color || "#3b82f6");
        } else {
            setEditingId(null);
            setName("");
            setColor("#3b82f6");
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("El nombre es requerido");
            return;
        }

        setIsSubmitting(true);
        try {
            const dataToSave = { 
                name, 
                color
            };

            if (editingId) {
                await updateCategoryAction(editingId, dataToSave);
                setCategories(categories.map(c => c.id === editingId ? { ...c, ...dataToSave } as FinancialCategory : c));
                toast.success("Categoría actualizada");
            } else {
                const newCat = await createCategoryAction(dataToSave);
                setCategories([...categories, newCat]);
                toast.success("Categoría creada");
            }
            setIsDialogOpen(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Error al guardar");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteRequest = async (cat: FinancialCategory) => {
        setDeletingCat(cat);
        setDeleteCount(null);
        try {
            const count = await getCategoryTransactionCountAction(cat.id!);
            setDeleteCount(count);
        } catch {
            // If the count can't be resolved, fall back to the plain confirmation.
            setDeleteCount(0);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deletingCat) return;
        setIsDeleting(true);
        try {
            const { reassignedCount } = await deleteCategoryAction(deletingCat.id!);
            setCategories(prev => prev.filter(c => c.id !== deletingCat.id));
            if (reassignedCount > 0) {
                const noun = reassignedCount === 1 ? "transacción reasignada" : "transacciones reasignadas";
                toast.success(`Categoría eliminada. ${reassignedCount} ${noun} a «Otros».`);
            } else {
                toast.success("Categoría eliminada");
            }
            setDeletingCat(null);
            setDeleteCount(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Error al eliminar");
        } finally {
            setIsDeleting(false);
        }
    };

    const deleteDescription = deleteCount === null
        ? "Comprobando transacciones asociadas…"
        : deleteCount > 0
            ? `Esta categoría tiene ${deleteCount} ${deleteCount === 1 ? "transacción asociada" : "transacciones asociadas"}. Al eliminarla, ${deleteCount === 1 ? "esa transacción quedará huérfana y se marcará" : "esas transacciones quedarán huérfanas y se marcarán"} con la categoría «Otros». ¿Deseas continuar?`
            : "¿Seguro que deseas eliminar esta categoría? Esta acción no se puede deshacer.";

    // Split into user-owned vs. system (base) categories so each group is shown
    // under its own heading and the user can tell them apart at a glance. Apply
    // the name search + the chosen sort within each group.
    const visibleCategories = categories.filter(c => !c.isDeleted);
    const { myCategories, systemCategories } = useMemo(() => {
        const nq = normalizeForMatch(query);
        const matched = nq ? visibleCategories.filter(c => normalizeForMatch(c.name).includes(nq)) : visibleCategories;
        return {
            myCategories: sortSettingsItems(matched.filter(c => c.ownerUserId !== null), sort, stats),
            systemCategories: sortSettingsItems(matched.filter(c => c.ownerUserId === null), sort, stats),
        };
    }, [visibleCategories, query, sort, stats]);

    const resolveIcon = (name?: string | null): LucideIcon => {
        if (name && name in Icons) {
            return (Icons as unknown as Record<string, LucideIcon>)[name];
        }
        return Tags;
    };

    const renderCategoryCard = (cat: FinancialCategory) => {
        const IconComponent = resolveIcon(cat.icon);
        const isSystem = cat.ownerUserId === null;
        const counts = cat.id && stats ? stats[cat.id] : undefined;
        return (
            <div key={cat.id} className="p-4 border rounded-xl bg-card shadow-sm flex flex-col gap-3 group hover:border-primary/50 hover:shadow-md transition-all">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center opacity-90 shadow-sm"
                            style={{ backgroundColor: `${cat.color || '#3b82f6'}25`, color: cat.color || '#3b82f6' }}
                        >
                            <IconComponent className="w-5 h-5" />
                        </div>
                        <h3 className="font-semibold text-base text-card-foreground truncate" title={cat.name}>
                            {cat.name}
                        </h3>
                    </div>
                    {isSystem ? (
                        <span className="shrink-0 text-muted-foreground/60" title="Categoría del sistema (no editable)">
                            <Lock className="w-4 h-4" />
                        </span>
                    ) : (
                        <div className="flex gap-0.5 shrink-0 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10" title="Editar" onClick={() => handleOpenDialog(cat)}>
                                <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10" title="Eliminar" onClick={() => handleDeleteRequest(cat)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border/40">
                    <TransactionCountSummary counts={counts} loading={stats === null} className="min-w-0" />
                    {counts && counts.total > 0 && (
                        <Link
                            href={`/financial/transactions?categoryId=${cat.id}&range=all`}
                            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:underline"
                            title="Ver transacciones de esta categoría"
                        >
                            Ver <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Tus Categorías</CardTitle>
                        <CardDescription>Clasifica tus transacciones para mejores reportes.</CardDescription>
                    </div>
                    <FormSheet
                        open={isDialogOpen}
                        onOpenChange={setIsDialogOpen}
                        trigger={
                            <Button onClick={() => handleOpenDialog()} className="gap-2">
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Nueva Categoría</span>
                            </Button>
                        }
                        title={editingId ? "Editar Categoría" : "Nueva Categoría"}
                        bodyClassName="space-y-4 py-4"
                        footer={
                            <Button className="w-full" onClick={handleSave} disabled={isSubmitting}>
                                {isSubmitting ? "Guardando..." : "Guardar"}
                            </Button>
                        }
                    >
                        <Field label="Nombre" htmlFor="cat-name">
                            <Input
                                id="cat-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej. Alimentación"
                            />
                        </Field>
                        <Field label="Color" htmlFor="cat-color">
                            <div className="flex gap-3 items-center">
                                <Input
                                    id="cat-color"
                                    type="color"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="w-14 h-10 p-1 cursor-pointer"
                                />
                                <span className="text-sm text-gray-500 uppercase">{color}</span>
                            </div>
                        </Field>
                    </FormSheet>
                </div>
            </CardHeader>
            <CardContent className="px-0 space-y-8">
                <SettingsListControls
                    query={query}
                    onQueryChange={setQuery}
                    sort={sort}
                    onSortChange={setSort}
                    placeholder="Buscar categoría…"
                />

                {/* ── Mis categorías (creadas por el usuario) ───────────── */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <UserRound className="w-4 h-4 text-primary shrink-0" />
                        <h3 className="text-sm font-semibold text-foreground">Mis categorías</h3>
                        <span className="text-xs text-muted-foreground">({myCategories.length})</span>
                    </div>
                    {myCategories.length === 0 ? (
                        query ? (
                            <p className="text-center text-sm text-muted-foreground py-8">Ninguna categoría propia coincide con «{query}».</p>
                        ) : (
                        <div className="text-center py-10 text-muted-foreground border border-dashed rounded-xl bg-muted/30">
                            <Tags className="w-9 h-9 mx-auto mb-3 opacity-20" />
                            <p className="font-medium text-foreground">Aún no has creado categorías propias</p>
                            <p className="text-sm mt-1 mb-4">Crea las tuyas para personalizar la organización de tus gastos.</p>
                            <Button variant="outline" onClick={() => handleOpenDialog()}>
                                <Plus className="w-4 h-4" />
                                Crear categoría
                            </Button>
                        </div>
                        )
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {myCategories.map(renderCategoryCard)}
                        </div>
                    )}
                </section>

                {/* ── Categorías del sistema (base, no editables) ───────── */}
                {systemCategories.length > 0 && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                            <h3 className="text-sm font-semibold text-foreground">Categorías del sistema</h3>
                            <span className="text-xs text-muted-foreground">({systemCategories.length})</span>
                            <span className="hidden sm:inline text-xs text-muted-foreground/70">· predefinidas, no editables</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {systemCategories.map(renderCategoryCard)}
                        </div>
                    </section>
                )}
            </CardContent>

            <ConfirmationModal
                open={!!deletingCat}
                onOpenChange={(open) => {
                    if (!open && !isDeleting) {
                        setDeletingCat(null);
                        setDeleteCount(null);
                    }
                }}
                title={`Eliminar «${deletingCat?.name ?? ""}»`}
                description={deleteDescription}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="destructive"
                isLoading={isDeleting || deleteCount === null}
                onConfirm={handleDeleteConfirm}
            />
        </Card>
    );
}

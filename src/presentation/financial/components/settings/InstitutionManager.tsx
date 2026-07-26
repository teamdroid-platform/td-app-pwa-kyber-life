"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { FinancialInstitution, FinancialInstitutionType } from "@/domain/entities/financial";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Building2, Combine, ArrowUpRight } from "lucide-react";
import { createInstitutionAction, updateInstitutionAction, deleteInstitutionAction, createInstitutionTypeAction, getInstitutionTransactionCountAction, mergeInstitutionAction, getInstitutionTransactionStatsAction } from "@/app/actions/financial-settings";
import type { TransactionTypeCounts } from "@/application/services/financial-settings-service";
import { FormSheet } from "@/components/ui/form-sheet";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UUID } from "@/domain/core";
import * as Icons from "lucide-react";
import { normalizeForMatch } from "@/lib/institution-match";
import { SettingsListControls } from "./SettingsListControls";
import { TransactionCountSummary } from "./TransactionCountSummary";
import { sortSettingsItems, type SettingsSortMode, type SortDirection } from "../../lib/transaction-type-buckets";

interface InstitutionManagerProps {
    initialData: FinancialInstitution[];
    institutionTypes: FinancialInstitutionType[];
}

export function InstitutionManager({ initialData, institutionTypes }: InstitutionManagerProps) {
    const [institutions, setInstitutions] = useState<FinancialInstitution[]>(initialData);
    const [types, setTypes] = useState<FinancialInstitutionType[]>(institutionTypes);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<UUID | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Merge (unify) state
    const [mergingInst, setMergingInst] = useState<FinancialInstitution | null>(null);
    const [mergeTargetId, setMergeTargetId] = useState<string>("");
    const [mergeCount, setMergeCount] = useState<number | null>(null); // null while counting
    const [isMerging, setIsMerging] = useState(false);

    // Search / sort + background transaction stats
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SettingsSortMode>("name");
    const [direction, setDirection] = useState<SortDirection>("asc");
    const [stats, setStats] = useState<Record<string, TransactionTypeCounts> | null>(null);

    // Load per-institution transaction counts in the background so the initial
    // render (names + actions) is never blocked.
    useEffect(() => {
        let active = true;
        getInstitutionTransactionStatsAction()
            .then((res) => { if (active) setStats(res); })
            .catch(() => { if (active) setStats({}); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        setInstitutions(initialData);
    }, [initialData]);

    useEffect(() => {
        setTypes(institutionTypes);
    }, [institutionTypes]);

    // Form state
    const [name, setName] = useState("");
    const [institutionTypeId, setInstitutionTypeId] = useState<string>("");
    const [customType, setCustomType] = useState("");

    const handleOpenDialog = (inst?: FinancialInstitution) => {
        if (inst) {
            setEditingId(inst.id!);
            setName(inst.name);
            if (inst.institutionTypeId) {
                const isKnownType = types.some(t => t.id === inst.institutionTypeId);
                if (isKnownType) {
                    setInstitutionTypeId(inst.institutionTypeId);
                    setCustomType("");
                } else {
                    setInstitutionTypeId(types[0]?.id || "");
                    setCustomType("");
                }
            } else {
                setInstitutionTypeId(types[0]?.id || "");
                setCustomType("");
            }
        } else {
            setEditingId(null);
            setName("");
            setInstitutionTypeId(types[0]?.id || "");
            setCustomType("");
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
            let finalTypeId = institutionTypeId;

            if (institutionTypeId === 'CUSTOM') {
                if (!customType.trim()) {
                    toast.error("El tipo de institución es requerido");
                    setIsSubmitting(false);
                    return;
                }
                
                const generatedCode = customType.trim().toUpperCase().replace(/\s+/g, '_');
                
                const newType = await createInstitutionTypeAction({
                    code: generatedCode,
                    label: customType.trim(),
                    iconName: 'Tag'
                });
                
                setTypes([...types, newType]);
                finalTypeId = newType.id;
            }
            
            if (editingId) {
                const updatedInst = await updateInstitutionAction(editingId, { name, institutionTypeId: finalTypeId });
                setInstitutions(institutions.map(i => i.id === editingId ? updatedInst : i));
                toast.success("Institución actualizada");
            } else {
                const newInst = await createInstitutionAction({ name, institutionTypeId: finalTypeId });
                setInstitutions([...institutions, newInst]);
                toast.success("Institución creada");
            }
            setIsDialogOpen(false);
        } catch (error: any) {
            toast.error(error.message || "Error al guardar");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: UUID) => {
        if (!confirm("¿Seguro que deseas eliminar esta institución?")) return;

        try {
            await deleteInstitutionAction(id);
            setInstitutions(institutions.filter(i => i.id !== id));
            toast.success("Institución eliminada");
        } catch (error: any) {
            toast.error("Error al eliminar");
        }
    };

    const handleMergeRequest = async (inst: FinancialInstitution) => {
        setMergingInst(inst);
        setMergeTargetId("");
        setMergeCount(null);
        try {
            const count = await getInstitutionTransactionCountAction(inst.id!);
            setMergeCount(count);
        } catch {
            setMergeCount(0);
        }
    };

    const handleMergeConfirm = async () => {
        if (!mergingInst || !mergeTargetId) return;
        setIsMerging(true);
        try {
            const { reassignedCount } = await mergeInstitutionAction(mergingInst.id!, mergeTargetId);
            const targetName = institutions.find(i => i.id === mergeTargetId)?.name ?? "la institución elegida";
            setInstitutions(prev => prev.filter(i => i.id !== mergingInst.id));
            if (reassignedCount > 0) {
                const noun = reassignedCount === 1 ? "transacción reasignada" : "transacciones reasignadas";
                toast.success(`Instituciones unificadas. ${reassignedCount} ${noun} a «${targetName}».`);
            } else {
                toast.success(`Instituciones unificadas en «${targetName}».`);
            }
            setMergingInst(null);
            setMergeTargetId("");
            setMergeCount(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Error al unificar instituciones");
        } finally {
            setIsMerging(false);
        }
    };

    // Candidate targets: every other (non-deleted) institution.
    const mergeTargets = institutions.filter(i => !i.isDeleted && i.id !== mergingInst?.id);

    const activeInstitutions = institutions.filter(i => !i.isDeleted);
    const visibleInstitutions = useMemo(() => {
        const nq = normalizeForMatch(query);
        const filtered = nq ? activeInstitutions.filter(i => normalizeForMatch(i.name).includes(nq)) : activeInstitutions;
        return sortSettingsItems(filtered, sort, stats, direction);
    }, [activeInstitutions, query, sort, stats, direction]);

    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Tus Instituciones</CardTitle>
                        <CardDescription>Instituciones, comercios y otras entidades vinculadas a tus transacciones.</CardDescription>
                    </div>
                    <FormSheet
                        open={isDialogOpen}
                        onOpenChange={setIsDialogOpen}
                        trigger={
                            <Button onClick={() => handleOpenDialog()} className="gap-2">
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Nueva Institución</span>
                            </Button>
                        }
                        title={editingId ? "Editar Institución" : "Nueva Institución"}
                        bodyClassName="space-y-4 py-4"
                        footer={
                            <Button className="w-full" onClick={handleSave} disabled={isSubmitting}>
                                {isSubmitting ? "Guardando..." : "Guardar"}
                            </Button>
                        }
                    >
                        <Field label="Nombre" htmlFor="inst-name">
                            <Input
                                id="inst-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej. Banco Pichincha"
                            />
                        </Field>
                        <Field label="Tipo de Institución">
                            <Select value={institutionTypeId} onValueChange={setInstitutionTypeId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    {types.map(type => (
                                        <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                                    ))}
                                    <SelectItem value="CUSTOM">Otro (Personalizado)</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        {institutionTypeId === 'CUSTOM' && (
                            <Field label="Especificar Tipo" htmlFor="inst-custom-type">
                                <Input
                                    id="inst-custom-type"
                                    value={customType}
                                    onChange={(e) => setCustomType(e.target.value)}
                                    placeholder="Ej. Proveedor de Internet"
                                />
                            </Field>
                        )}
                    </FormSheet>
                </div>
            </CardHeader>
            <CardContent className="px-0">
                {activeInstitutions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl bg-muted/30">
                        <Building2 className="w-10 h-10 mx-auto mb-4 opacity-20" />
                        <p className="font-medium text-foreground">No tienes instituciones registradas</p>
                        <p className="text-sm mt-1 mb-4">Empieza añadiendo tu banco principal.</p>
                        <Button variant="outline" onClick={() => handleOpenDialog()}>
                            Añadir la primera
                        </Button>
                    </div>
                ) : (
                    <>
                    <SettingsListControls
                        query={query}
                        onQueryChange={setQuery}
                        sort={sort}
                        onSortChange={setSort}
                        direction={direction}
                        onDirectionChange={setDirection}
                        placeholder="Buscar institución…"
                    />
                    {visibleInstitutions.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-10">No hay instituciones que coincidan con «{query}».</p>
                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {visibleInstitutions.map(inst => {
                            // If institutionTypeObj is missing in local state but we have an ID, try to find it
                            const typeObj = inst.institutionTypeObj || types.find(t => t.id === inst.institutionTypeId);
                            const label = typeObj ? typeObj.label : 'Sin clasificar';
                            const IconComponent = typeObj && (Icons as any)[typeObj.iconName] ? (Icons as any)[typeObj.iconName] : Icons.HelpCircle;
                            const counts = inst.id && stats ? stats[inst.id] : undefined;

                            return (
                                <div key={inst.id} className="p-4 border rounded-xl bg-card shadow-sm flex flex-col gap-3 group hover:border-primary/50 hover:shadow-md transition-all">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="w-11 h-11 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                <IconComponent className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-base text-card-foreground leading-snug break-words" title={inst.name}>{inst.name}</h3>
                                                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{label}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-0.5 shrink-0 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10" title="Editar" onClick={() => handleOpenDialog(inst)}>
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-violet-500 hover:bg-violet-500/10" title="Unificar con otra institución" onClick={() => handleMergeRequest(inst)}>
                                                <Combine className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10" title="Eliminar" onClick={() => handleDelete(inst.id!)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border/40">
                                        <TransactionCountSummary counts={counts} loading={stats === null} className="min-w-0" />
                                        {counts && counts.total > 0 && (
                                            <Link
                                                href={`/financial/transactions?institutionId=${inst.id}&range=all`}
                                                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:underline"
                                                title="Ver transacciones de esta institución"
                                            >
                                                Ver <ArrowUpRight className="w-3.5 h-3.5" />
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    )}
                    </>
                )}
            </CardContent>

            <FormSheet
                open={!!mergingInst}
                onOpenChange={(open) => {
                    if (!open && !isMerging) {
                        setMergingInst(null);
                        setMergeTargetId("");
                        setMergeCount(null);
                    }
                }}
                title="Unificar institución"
                description={mergingInst ? `Fusiona «${mergingInst.name}» con otra institución. Todas sus transacciones pasarán a la institución elegida y «${mergingInst.name}» será eliminada.` : ""}
                bodyClassName="space-y-4 py-4"
                footer={
                    <Button
                        className="w-full"
                        variant="destructive"
                        onClick={handleMergeConfirm}
                        disabled={!mergeTargetId || isMerging}
                    >
                        {isMerging ? "Unificando..." : "Unificar y eliminar"}
                    </Button>
                }
            >
                <Field label="Fusionar con">
                    <Select value={mergeTargetId} onValueChange={setMergeTargetId} disabled={isMerging}>
                        <SelectTrigger>
                            <SelectValue placeholder={mergeTargets.length > 0 ? "Elige la institución destino" : "No hay otra institución"} />
                        </SelectTrigger>
                        <SelectContent>
                            {mergeTargets.map(t => (
                                <SelectItem key={t.id} value={t.id!}>{t.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <p className="text-xs text-muted-foreground">
                    {mergeCount === null
                        ? "Comprobando transacciones asociadas…"
                        : mergeCount > 0
                            ? `Se reasignarán ${mergeCount} ${mergeCount === 1 ? "transacción" : "transacciones"} a la institución elegida.`
                            : "Esta institución no tiene transacciones asociadas."}
                </p>
            </FormSheet>
        </Card>
    );
}

import type { IBankCardStatementRepository } from "@/domain/repositories/bank";
import type { BankCardStatement } from "@/domain/entities/bank";
import type { UUID, ISODate } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

type Row = Record<string, unknown>;

function mapToEntity(row: Row): BankCardStatement {
    return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        cardId: row.card_id as string,
        periodStart: row.period_start as string,
        periodEnd: row.period_end as string,
        dueDate: row.due_date as string,
        computedAmount: Number(row.computed_amount),
        // Null significa "el banco no declaró total"; no colapsar a 0.
        totalAmount: row.total_amount === null || row.total_amount === undefined
            ? null
            : Number(row.total_amount),
        paidAmount: Number(row.paid_amount),
        status: row.status as BankCardStatement["status"],
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted),
    };
}

function toRow(entity: BankCardStatement): Row {
    return {
        owner_user_id: entity.ownerUserId,
        card_id: entity.cardId,
        period_start: entity.periodStart,
        period_end: entity.periodEnd,
        due_date: entity.dueDate,
        computed_amount: entity.computedAmount,
        total_amount: entity.totalAmount ?? null,
        paid_amount: entity.paidAmount,
        status: entity.status,
        is_deleted: entity.isDeleted,
    };
}

export class SupabaseBankCardStatementRepository implements IBankCardStatementRepository {
    async create(entity: BankCardStatement): Promise<BankCardStatement> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_statements")
            .insert({ id: entity.id, ...toRow(entity) })
            .select()
            .single();

        if (error) throw new Error(`Error creating card statement: ${error.message}`);
        return mapToEntity(data);
    }

    async findById(id: UUID): Promise<BankCardStatement | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_statements").select("*").eq("id", id).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findAll(): Promise<BankCardStatement[]> {
        throw new Error("findAll not implemented for bank_card_statements. Use findByCardId.");
    }

    async findByCardId(cardId: UUID): Promise<BankCardStatement[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_statements").select("*")
            .eq("card_id", cardId).eq("is_deleted", false)
            .order("period_start", { ascending: false });

        if (error) throw new Error(`Error loading card statements: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async findOpenForCard(cardId: UUID): Promise<BankCardStatement | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_statements").select("*")
            .eq("card_id", cardId).eq("is_deleted", false).eq("status", "OPEN")
            .order("period_start", { ascending: false })
            .limit(1).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    /** Sirve al cierre perezoso: dice si el período en curso ya tiene fila. */
    async findByCardAndPeriodStart(cardId: UUID, periodStart: ISODate): Promise<BankCardStatement | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_statements").select("*")
            .eq("card_id", cardId).eq("period_start", periodStart)
            .eq("is_deleted", false).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async update(entity: BankCardStatement): Promise<BankCardStatement> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_statements")
            .update({ ...toRow(entity), updated_at: new Date().toISOString() })
            .eq("id", entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating card statement: ${error.message}`);
        return mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from("bank_card_statements")
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq("id", id);

        if (error) throw new Error(`Error deleting card statement: ${error.message}`);
    }
}

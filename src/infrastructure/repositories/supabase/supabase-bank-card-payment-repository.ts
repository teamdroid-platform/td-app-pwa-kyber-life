import type { IBankCardPaymentRepository } from "@/domain/repositories/bank";
import type { BankCardPayment } from "@/domain/entities/bank";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

type Row = Record<string, unknown>;

function mapToEntity(row: Row): BankCardPayment {
    return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        cardId: row.card_id as string,
        statementId: (row.statement_id as string) ?? null,
        amount: Number(row.amount),
        currency: row.currency as string,
        date: row.date as string,
        description: (row.description as string) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted),
    };
}

function toRow(entity: BankCardPayment): Row {
    return {
        owner_user_id: entity.ownerUserId,
        card_id: entity.cardId,
        statement_id: entity.statementId ?? null,
        amount: entity.amount,
        currency: entity.currency,
        date: entity.date,
        description: entity.description ?? null,
        is_deleted: entity.isDeleted,
    };
}

export class SupabaseBankCardPaymentRepository implements IBankCardPaymentRepository {
    async create(entity: BankCardPayment): Promise<BankCardPayment> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_payments")
            .insert({ id: entity.id, ...toRow(entity) })
            .select()
            .single();

        if (error) throw new Error(`Error creating card payment: ${error.message}`);
        return mapToEntity(data);
    }

    async findById(id: UUID): Promise<BankCardPayment | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_payments").select("*").eq("id", id).eq("is_deleted", false).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findAll(): Promise<BankCardPayment[]> {
        throw new Error("findAll not implemented for bank_card_payments. Use findByCardId.");
    }

    async findByCardId(userId: UUID, cardId: UUID): Promise<BankCardPayment[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_payments").select("*")
            .eq("owner_user_id", userId).eq("card_id", cardId).eq("is_deleted", false)
            .order("date", { ascending: false });

        if (error) throw new Error(`Error loading card payments: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async update(entity: BankCardPayment): Promise<BankCardPayment> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_payments")
            .update({ ...toRow(entity), updated_at: new Date().toISOString() })
            .eq("id", entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating card payment: ${error.message}`);
        return mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from("bank_card_payments")
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq("id", id);

        if (error) throw new Error(`Error deleting card payment: ${error.message}`);
    }
}

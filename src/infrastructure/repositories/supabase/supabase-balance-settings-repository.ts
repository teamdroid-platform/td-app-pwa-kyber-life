import type { IBalanceSettingsRepository } from "@/domain/repositories/balance";
import type {
    BalanceMode, BalanceScopeRule, BalanceScopeTargetType, BalanceSettings,
} from "@/domain/entities/balance";
import { DEFAULT_SHOW_RUNNING_BALANCE } from "@/domain/entities/balance";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

interface ScopeRuleRow {
    id: string;
    owner_user_id: string;
    target_type: BalanceScopeTargetType;
    target_id: string;
    included: boolean;
    created_at: string;
    updated_at: string;
}

interface SettingsRow {
    owner_user_id: string;
    default_mode: string;
    show_running_balance?: boolean | null;
}

/**
 * `show_running_balance` se lee con `??`: la columna llegó después que la
 * tabla, y una fila guardada antes de la migración no la trae.
 */
function mapSettings(row: SettingsRow): BalanceSettings {
    return {
        ownerUserId: row.owner_user_id,
        defaultMode: row.default_mode as BalanceMode,
        showRunningBalance: row.show_running_balance ?? DEFAULT_SHOW_RUNNING_BALANCE,
    };
}

function mapRule(row: ScopeRuleRow): BalanceScopeRule {
    return {
        id: row.id,
        ownerUserId: row.owner_user_id,
        targetType: row.target_type,
        targetId: row.target_id,
        included: row.included,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isDeleted: false,
    };
}

export class SupabaseBalanceSettingsRepository implements IBalanceSettingsRepository {
    async getSettings(userId: UUID): Promise<BalanceSettings | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_settings')
            .select('*')
            .eq('owner_user_id', userId)
            .maybeSingle();

        if (error) throw new Error(`Error loading balance settings: ${error.message}`);
        if (!data) return null;
        return mapSettings(data as SettingsRow);
    }

    async setDefaultMode(userId: UUID, mode: BalanceMode): Promise<BalanceSettings> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_settings')
            .upsert(
                { owner_user_id: userId, default_mode: mode, updated_at: new Date().toISOString() },
                { onConflict: 'owner_user_id' },
            )
            .select()
            .single();

        if (error) throw new Error(`Error saving balance settings: ${error.message}`);
        return mapSettings(data as SettingsRow);
    }

    /**
     * El upsert solo manda su propia columna, así que un usuario que nunca
     * eligió modo conserva el que la tabla pone por defecto en vez de que este
     * guardado se lo fije.
     */
    async setShowRunningBalance(userId: UUID, show: boolean): Promise<BalanceSettings> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_settings')
            .upsert(
                { owner_user_id: userId, show_running_balance: show, updated_at: new Date().toISOString() },
                { onConflict: 'owner_user_id' },
            )
            .select()
            .single();

        if (error) throw new Error(`Error saving balance settings: ${error.message}`);
        return mapSettings(data as SettingsRow);
    }

    async getRules(userId: UUID): Promise<BalanceScopeRule[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_scope_rules')
            .select('*')
            .eq('owner_user_id', userId);

        if (error) throw new Error(`Error loading balance scope rules: ${error.message}`);
        return (data ?? []).map(mapRule);
    }

    async setRule(
        userId: UUID,
        targetType: BalanceScopeTargetType,
        targetId: UUID,
        included: boolean,
    ): Promise<BalanceScopeRule> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_scope_rules')
            .upsert(
                {
                    owner_user_id: userId,
                    target_type: targetType,
                    target_id: targetId,
                    included,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'owner_user_id,target_type,target_id' },
            )
            .select()
            .single();

        if (error) throw new Error(`Error saving balance scope rule: ${error.message}`);
        return mapRule(data);
    }

    async clearRulesForTargets(userId: UUID, targetIds: readonly UUID[]): Promise<void> {
        if (targetIds.length === 0) return;
        const supabase = await createClient();
        const { error } = await supabase
            .from('financial_balance_scope_rules')
            .delete()
            .eq('owner_user_id', userId)
            .in('target_id', targetIds as string[]);

        if (error) throw new Error(`Error clearing balance scope rules: ${error.message}`);
    }

    async clearRules(userId: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from('financial_balance_scope_rules')
            .delete()
            .eq('owner_user_id', userId);

        if (error) throw new Error(`Error clearing balance scope rules: ${error.message}`);
    }
}

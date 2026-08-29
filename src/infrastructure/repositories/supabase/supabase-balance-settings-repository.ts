import type { IBalanceSettingsRepository } from "@/domain/repositories/balance";
import type {
    BalanceMode, BalanceScopeRule, BalanceScopeTargetType, BalanceSettings,
} from "@/domain/entities/balance";
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
        return { ownerUserId: data.owner_user_id, defaultMode: data.default_mode as BalanceMode };
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
        return { ownerUserId: data.owner_user_id, defaultMode: data.default_mode as BalanceMode };
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

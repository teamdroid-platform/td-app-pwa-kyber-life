import type { IPeriodSettingsRepository } from "@/domain/repositories/period";
import type { PeriodScope, PeriodSettings } from "@/domain/entities/period";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

interface PeriodSettingsRow {
    owner_user_id: string;
    scope: PeriodScope;
    cycle_start_day: number;
    created_at: string;
    updated_at: string;
}

function mapRow(row: PeriodSettingsRow): PeriodSettings {
    return {
        ownerUserId: row.owner_user_id,
        scope: row.scope,
        cycleStartDay: row.cycle_start_day,
    };
}

export class SupabasePeriodSettingsRepository implements IPeriodSettingsRepository {
    async findByOwner(ownerUserId: UUID, scope: PeriodScope): Promise<PeriodSettings | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('user_period_settings')
            .select('*')
            .eq('owner_user_id', ownerUserId)
            .eq('scope', scope)
            .maybeSingle();

        if (error) throw new Error(`Error loading period settings: ${error.message}`);
        if (!data) return null;
        return mapRow(data);
    }

    async findAllByOwner(ownerUserId: UUID): Promise<PeriodSettings[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('user_period_settings')
            .select('*')
            .eq('owner_user_id', ownerUserId);

        if (error) throw new Error(`Error loading period settings: ${error.message}`);
        return (data ?? []).map(mapRow);
    }

    async upsert(
        ownerUserId: UUID,
        scope: PeriodScope,
        cycleStartDay: number,
    ): Promise<PeriodSettings> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('user_period_settings')
            .upsert(
                {
                    owner_user_id: ownerUserId,
                    scope,
                    cycle_start_day: cycleStartDay,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'owner_user_id,scope' },
            )
            .select()
            .single();

        if (error) throw new Error(`Error saving period settings: ${error.message}`);
        return mapRow(data);
    }
}

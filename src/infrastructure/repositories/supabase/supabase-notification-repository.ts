import type { Notification } from "@/domain/entities/notification";
import type { INotificationRepository, NotificationQueryOptions } from "@/domain/repositories/notification";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

export class SupabaseNotificationRepository implements INotificationRepository {
    private tableName = 'notifications';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mapToEntity(data: any): Notification {
        return {
            id: data.id,
            ownerUserId: data.owner_user_id,
            type: data.type,
            title: data.title,
            message: data.message,
            entityType: data.entity_type,
            entityId: data.entity_id,
            isRead: data.is_read,
            readAt: data.read_at,
            isDeleted: false,
            createdAt: data.created_at,
            updatedAt: data.created_at,
        };
    }

    async findById(id: UUID): Promise<Notification | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return null;
        return this.mapToEntity(data);
    }

    async findAll(): Promise<Notification[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !data) return [];
        return data.map((row) => this.mapToEntity(row));
    }

    async create(): Promise<Notification> {
        // Notifications are only ever created by the DB trigger
        // (notify_on_scanner_execution_change) — there is no app-level
        // write path, and RLS has no INSERT policy for regular users.
        throw new Error('Notifications cannot be created from the application layer');
    }

    async update(): Promise<Notification> {
        throw new Error('Use markAsRead/markAllAsRead to update notifications');
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase.from(this.tableName).delete().eq('id', id);
        if (error) throw error;
    }

    async findByOwnerId(userId: UUID, limit = 20, options?: NotificationQueryOptions): Promise<Notification[]> {
        const supabase = await createClient();
        let query = supabase
            .from(this.tableName)
            .select('*')
            .eq('owner_user_id', userId);

        // Read notifications are dismissed for good — the bell only lists pending ones.
        if (options?.unreadOnly) query = query.eq('is_read', false);

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error(`Error finding ${this.tableName} by user:`, error);
            return [];
        }
        return (data || []).map((row) => this.mapToEntity(row));
    }

    async countUnread(userId: UUID): Promise<number> {
        const supabase = await createClient();
        const { count, error } = await supabase
            .from(this.tableName)
            .select('*', { count: 'exact', head: true })
            .eq('owner_user_id', userId)
            .eq('is_read', false);

        if (error) {
            console.error(`Error counting unread ${this.tableName}:`, error);
            return 0;
        }
        return count || 0;
    }

    async markAsRead(id: UUID, userId: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from(this.tableName)
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', id)
            .eq('owner_user_id', userId);

        if (error) throw error;
    }

    async markAllAsRead(userId: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from(this.tableName)
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('owner_user_id', userId)
            .eq('is_read', false);

        if (error) throw error;
    }
}

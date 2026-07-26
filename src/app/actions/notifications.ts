"use server";

import { notificationService } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import { listNotificationsSchema, markNotificationReadSchema } from "@/lib/validators/notification-schemas";
import { z } from "zod";

function formatZodError(error: z.ZodError): string {
    return error.issues.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; ");
}

export async function listNotificationsAction(limit?: number, unreadOnly?: boolean) {
    try {
        const validated = listNotificationsSchema.parse({ limit, unreadOnly });
        const userId = await requireUserId();
        const data = validated.unreadOnly
            ? await notificationService.listUnread(userId, validated.limit)
            : await notificationService.listRecent(userId, validated.limit);
        return { success: true, data };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, error: `Validation failed: ${formatZodError(error)}` };
        }
        console.error("Error listing notifications:", error);
        return { success: false, error: (error as Error).message };
    }
}

export async function getUnreadNotificationCountAction() {
    try {
        const userId = await requireUserId();
        const data = await notificationService.unreadCount(userId);
        return { success: true, data };
    } catch (error) {
        console.error("Error counting unread notifications:", error);
        return { success: false, error: (error as Error).message };
    }
}

export async function markNotificationReadAction(id: string) {
    try {
        const validated = markNotificationReadSchema.parse({ id });
        const userId = await requireUserId();
        await notificationService.markAsRead(validated.id, userId);
        return { success: true, data: null };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, error: `Validation failed: ${formatZodError(error)}` };
        }
        console.error("Error marking notification as read:", error);
        return { success: false, error: (error as Error).message };
    }
}

export async function markAllNotificationsReadAction() {
    try {
        const userId = await requireUserId();
        await notificationService.markAllAsRead(userId);
        return { success: true, data: null };
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        return { success: false, error: (error as Error).message };
    }
}

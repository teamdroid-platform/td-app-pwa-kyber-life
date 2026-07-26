import { z } from "zod";

export const listNotificationsSchema = z.object({
    limit: z.number().int().positive().max(100).optional(),
    unreadOnly: z.boolean().optional(),
});

export const markNotificationReadSchema = z.object({
    id: z.string().uuid("Invalid notification ID"),
});

export const subscribeToPushSchema = z.object({
    endpoint: z.string().url("Invalid push endpoint"),
    keys: z.object({
        p256dh: z.string().min(1, "Missing p256dh key"),
        auth: z.string().min(1, "Missing auth key"),
    }),
    userAgent: z.string().max(500).optional(),
});

export const unsubscribeFromPushSchema = z.object({
    endpoint: z.string().url("Invalid push endpoint"),
});

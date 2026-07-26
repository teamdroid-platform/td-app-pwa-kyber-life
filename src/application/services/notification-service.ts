import { INotificationRepository } from "@/domain/repositories/notification";
import { Notification } from "@/domain/entities/notification";
import { UUID } from "@/domain/core";

export class NotificationService {
    constructor(private notificationRepo: INotificationRepository) { }

    async listRecent(userId: UUID, limit = 20): Promise<Notification[]> {
        return this.notificationRepo.findByOwnerId(userId, limit);
    }

    /**
     * Pending notifications only. Once a notification is read (tapped, swiped
     * away or marked read in bulk) it is dismissed for good and never listed
     * again — this is what the bell shows.
     */
    async listUnread(userId: UUID, limit = 20): Promise<Notification[]> {
        return this.notificationRepo.findByOwnerId(userId, limit, { unreadOnly: true });
    }

    async unreadCount(userId: UUID): Promise<number> {
        return this.notificationRepo.countUnread(userId);
    }

    async markAsRead(id: UUID, userId: UUID): Promise<void> {
        return this.notificationRepo.markAsRead(id, userId);
    }

    async markAllAsRead(userId: UUID): Promise<void> {
        return this.notificationRepo.markAllAsRead(userId);
    }
}

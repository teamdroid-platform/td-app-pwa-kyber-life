import { UUID } from "../core";
import { IRepository } from "./index";
import { Notification, PushSubscription } from "../entities/notification";

export interface NotificationQueryOptions {
    /** When true, only notifications that haven't been read yet are returned. */
    unreadOnly?: boolean;
}

export interface INotificationRepository extends IRepository<Notification> {
    findByOwnerId(userId: UUID, limit?: number, options?: NotificationQueryOptions): Promise<Notification[]>;
    countUnread(userId: UUID): Promise<number>;
    markAsRead(id: UUID, userId: UUID): Promise<void>;
    markAllAsRead(userId: UUID): Promise<void>;
}

export interface IPushSubscriptionRepository extends IRepository<PushSubscription> {
    findByOwnerId(userId: UUID): Promise<PushSubscription[]>;
    findByEndpoint(endpoint: string): Promise<PushSubscription | null>;
    deleteByEndpoint(endpoint: string, userId: UUID): Promise<void>;
}

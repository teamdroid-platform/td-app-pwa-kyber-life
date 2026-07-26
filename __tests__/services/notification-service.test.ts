import { NotificationService } from "@/application/services/notification-service";
import { Notification } from "@/domain/entities/notification";
import { v4 as uuidv4 } from "uuid";

describe("NotificationService", () => {
    let notificationRepoMock: any;
    let service: NotificationService;

    const mockUserId = uuidv4();

    const buildNotification = (overrides: Partial<Notification> = {}): Notification => ({
        id: uuidv4(),
        ownerUserId: mockUserId,
        type: "SCAN_COMPLETED",
        title: "Nuevo escaneo completado",
        message: "Se detectaron 2 transacción(es) nueva(s)",
        entityType: "scan_execution",
        entityId: uuidv4(),
        isRead: false,
        readAt: null,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    });

    beforeEach(() => {
        notificationRepoMock = {
            findByOwnerId: jest.fn(),
            countUnread: jest.fn(),
            markAsRead: jest.fn(),
            markAllAsRead: jest.fn(),
        };
        service = new NotificationService(notificationRepoMock);
    });

    describe("listRecent", () => {
        it("delegates to the repository with the given limit", async () => {
            const notifications = [buildNotification(), buildNotification()];
            notificationRepoMock.findByOwnerId.mockResolvedValue(notifications);

            const result = await service.listRecent(mockUserId, 10);

            expect(notificationRepoMock.findByOwnerId).toHaveBeenCalledWith(mockUserId, 10);
            expect(result).toEqual(notifications);
        });

        it("defaults to a limit of 20 when not provided", async () => {
            notificationRepoMock.findByOwnerId.mockResolvedValue([]);

            await service.listRecent(mockUserId);

            expect(notificationRepoMock.findByOwnerId).toHaveBeenCalledWith(mockUserId, 20);
        });
    });

    describe("listUnread", () => {
        it("asks the repository for unread notifications only", async () => {
            const pending = [buildNotification()];
            notificationRepoMock.findByOwnerId.mockResolvedValue(pending);

            const result = await service.listUnread(mockUserId, 10);

            expect(notificationRepoMock.findByOwnerId).toHaveBeenCalledWith(mockUserId, 10, { unreadOnly: true });
            expect(result).toEqual(pending);
        });

        it("defaults to a limit of 20 when not provided", async () => {
            notificationRepoMock.findByOwnerId.mockResolvedValue([]);

            await service.listUnread(mockUserId);

            expect(notificationRepoMock.findByOwnerId).toHaveBeenCalledWith(mockUserId, 20, { unreadOnly: true });
        });
    });

    describe("unreadCount", () => {
        it("returns the repository's unread count", async () => {
            notificationRepoMock.countUnread.mockResolvedValue(3);

            const result = await service.unreadCount(mockUserId);

            expect(result).toBe(3);
            expect(notificationRepoMock.countUnread).toHaveBeenCalledWith(mockUserId);
        });
    });

    describe("markAsRead", () => {
        it("delegates to the repository with id and owner", async () => {
            const notification = buildNotification();

            await service.markAsRead(notification.id, mockUserId);

            expect(notificationRepoMock.markAsRead).toHaveBeenCalledWith(notification.id, mockUserId);
        });
    });

    describe("markAllAsRead", () => {
        it("delegates to the repository with the owner", async () => {
            await service.markAllAsRead(mockUserId);

            expect(notificationRepoMock.markAllAsRead).toHaveBeenCalledWith(mockUserId);
        });
    });
});

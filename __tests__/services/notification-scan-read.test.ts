import { NotificationService } from "@/application/services/notification-service";
import { InMemoryNotificationRepository } from "@/infrastructure/repositories/implementations";
import type { Notification, NotificationType } from "@/domain/entities/notification";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function notice(id: string, type: NotificationType, ownerUserId = USER): Notification {
    return {
        id, ownerUserId, type, title: type, message: "", isRead: false,
        createdAt: "2026-10-05T10:00:00Z", updatedAt: "2026-10-05T10:00:00Z", isDeleted: false,
    };
}

describe("markScanResultsAsRead", () => {
    async function build() {
        const repo = new InMemoryNotificationRepository();
        await repo.create(notice("ok-1", "SCAN_COMPLETED"));
        await repo.create(notice("ok-2", "SCAN_COMPLETED"));
        await repo.create(notice("fail", "SCAN_FAILED"));
        await repo.create(notice("ajena", "SCAN_COMPLETED", OTHER));
        return { repo, service: new NotificationService(repo) };
    }

    it("marca como leídos los escaneos completados", async () => {
        const { repo, service } = await build();
        await service.markScanResultsAsRead(USER);

        expect((await repo.findById("ok-1"))?.isRead).toBe(true);
        expect((await repo.findById("ok-2"))?.readAt).toBeTruthy();
    });

    it("deja sin leer los escaneos fallidos: avisan de un problema", async () => {
        const { repo, service } = await build();
        await service.markScanResultsAsRead(USER);

        expect((await repo.findById("fail"))?.isRead).toBe(false);
        expect(await service.unreadCount(USER)).toBe(1);
    });

    it("no toca las notificaciones de otro usuario", async () => {
        const { repo, service } = await build();
        await service.markScanResultsAsRead(USER);

        expect((await repo.findById("ajena"))?.isRead).toBe(false);
    });
});

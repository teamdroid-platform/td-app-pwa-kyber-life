import { InMemoryNotificationRepository } from "@/infrastructure/repositories/implementations";
import { Notification } from "@/domain/entities/notification";

const USER = "user-1";
const OTHER_USER = "user-2";

function build(over: Partial<Notification> & { id: string }): Notification {
    return {
        ownerUserId: USER,
        type: "SCAN_COMPLETED",
        title: "Escaneo completado",
        message: "Se detectaron 2 transacción(es)",
        entityType: "scan_execution",
        entityId: "exec-1",
        isRead: false,
        readAt: null,
        isDeleted: false,
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z",
        ...over,
    } as Notification;
}

async function setup() {
    const repo = new InMemoryNotificationRepository();
    await repo.create(build({ id: "n1", createdAt: "2026-07-01T10:00:00.000Z" }));
    await repo.create(build({ id: "n2", isRead: true, readAt: "2026-07-02T10:00:00.000Z", createdAt: "2026-07-02T10:00:00.000Z" }));
    await repo.create(build({ id: "n3", createdAt: "2026-07-03T10:00:00.000Z" }));
    await repo.create(build({ id: "n4", ownerUserId: OTHER_USER }));
    return repo;
}

describe("InMemoryNotificationRepository.findByOwnerId", () => {
    it("returns every notification of the user by default (read included)", async () => {
        const repo = await setup();
        const all = await repo.findByOwnerId(USER);
        expect(all.map(n => n.id)).toEqual(["n3", "n2", "n1"]); // newest first
    });

    it("returns only unread ones when unreadOnly is set", async () => {
        const repo = await setup();
        const pending = await repo.findByOwnerId(USER, 20, { unreadOnly: true });
        expect(pending.map(n => n.id)).toEqual(["n3", "n1"]);
        expect(pending.every(n => !n.isRead)).toBe(true);
    });

    it("drops a notification from the unread list once it is marked as read", async () => {
        const repo = await setup();
        await repo.markAsRead("n3", USER);

        const pending = await repo.findByOwnerId(USER, 20, { unreadOnly: true });
        expect(pending.map(n => n.id)).toEqual(["n1"]);
        expect(await repo.countUnread(USER)).toBe(1);
    });

    it("never leaks another user's notifications", async () => {
        const repo = await setup();
        const pending = await repo.findByOwnerId(USER, 20, { unreadOnly: true });
        expect(pending.some(n => n.ownerUserId === OTHER_USER)).toBe(false);
    });
});

import { render, waitFor } from "@testing-library/react";
import { MarkScanNotificationsRead } from "@/presentation/components/notifications/MarkScanNotificationsRead";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/presentation/components/notifications/useNotificationsRealtime";

jest.mock("@/app/actions/notifications", () => ({
    markScanNotificationsReadAction: jest.fn(),
}));
jest.mock("@/infrastructure/supabase/client", () => ({ createClient: jest.fn() }));

const { markScanNotificationsReadAction } = jest.requireMock("@/app/actions/notifications");

describe("MarkScanNotificationsRead", () => {
    beforeEach(() => markScanNotificationsReadAction.mockReset());

    it("al entrar marca los escaneos como leídos y avisa a la campana", async () => {
        markScanNotificationsReadAction.mockResolvedValue({ success: true, data: null });
        const listener = jest.fn();
        window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);

        render(<MarkScanNotificationsRead />);

        await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
        expect(markScanNotificationsReadAction).toHaveBeenCalledTimes(1);
        window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
    });

    it("si falla no avisa a la campana", async () => {
        markScanNotificationsReadAction.mockResolvedValue({ success: false, error: "x" });
        const listener = jest.fn();
        window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);

        render(<MarkScanNotificationsRead />);

        await waitFor(() => expect(markScanNotificationsReadAction).toHaveBeenCalled());
        await Promise.resolve();
        expect(listener).not.toHaveBeenCalled();
        window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
    });
});

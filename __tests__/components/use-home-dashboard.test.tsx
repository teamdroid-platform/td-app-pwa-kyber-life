import { renderHook, waitFor } from "@testing-library/react";
import { useMarketOverview } from "@/presentation/components/dashboard/hooks/useHomeDashboard";
import { getMarketOverviewAction } from "@/app/actions/analytics";

jest.mock("@/app/actions/analytics", () => ({
    getMarketOverviewAction: jest.fn(),
}));

const DAILY = [{ date: "2026-07-01", total: 12 }];
const TOP = [{ id: "p-1", name: "Leche", value: 8 }];

beforeEach(() => {
    jest.clearAllMocks();
    (getMarketOverviewAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { daily: DAILY, topProducts: TOP },
    });
});

/**
 * This hook runs while the user is staring at the loading robot on a cold
 * launch, so what it costs in requests is the thing worth pinning.
 */
describe("useMarketOverview", () => {
    it("fills both market blocks with a single request", async () => {
        const { result } = renderHook(() => useMarketOverview("2026-07-01", "2026-07-31"));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.data.daily).toEqual(DAILY);
        expect(result.current.data.topProducts).toEqual(TOP);
        // Two actions meant two round-trips, each resolving the session again.
        expect(getMarketOverviewAction).toHaveBeenCalledTimes(1);
        expect(getMarketOverviewAction).toHaveBeenCalledWith("2026-07-01", "2026-07-31", 100);
    });

    it("leaves the blocks empty instead of breaking when the request fails", async () => {
        (getMarketOverviewAction as jest.Mock).mockResolvedValue({ success: false, error: "boom" });

        const { result } = renderHook(() => useMarketOverview());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data).toEqual({ daily: [], topProducts: [] });
    });
});

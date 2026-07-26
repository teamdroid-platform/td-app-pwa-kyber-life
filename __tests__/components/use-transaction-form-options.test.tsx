import { renderHook, waitFor } from "@testing-library/react";
import { useTransactionFormOptions } from "@/presentation/financial/hooks/useTransactionFormOptions";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import type { FinancialCategory } from "@/domain/entities/financial";

jest.mock("@/app/actions/financial-settings", () => ({
    getTransactionFormOptionsAction: jest.fn(),
}));

const now = new Date().toISOString();

const CATEGORIES: FinancialCategory[] = [
    {
        id: "cat-1",
        ownerUserId: null,
        name: "Alimentación",
        color: "#64748b",
        icon: null,
        parentId: null,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
    },
];

const OK = {
    success: true,
    data: { institutions: [], accounts: [], categories: CATEGORIES, institutionTypes: [] },
};

const mockAction = getTransactionFormOptionsAction as jest.Mock;

describe("useTransactionFormOptions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("loads the pickers' options in a single call", async () => {
        mockAction.mockResolvedValue(OK);

        const { result } = renderHook(() => useTransactionFormOptions());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockAction).toHaveBeenCalledTimes(1);
        expect(result.current.categories).toEqual(CATEGORIES);
        expect(result.current.error).toBeNull();
    });

    it("retries once when the first attempt fails, so a transient error doesn't blank the pickers", async () => {
        mockAction
            .mockResolvedValueOnce({ success: false, error: "Unauthorized" })
            .mockResolvedValueOnce(OK);

        const { result } = renderHook(() => useTransactionFormOptions());

        await waitFor(() => expect(result.current.categories).toEqual(CATEGORIES), { timeout: 3000 });
        expect(mockAction).toHaveBeenCalledTimes(2);
        expect(result.current.error).toBeNull();
    });

    it("reports an error instead of silently showing an empty list when it keeps failing", async () => {
        mockAction.mockResolvedValue({ success: false, error: "Unauthorized" });

        const { result } = renderHook(() => useTransactionFormOptions());

        await waitFor(() => expect(result.current.error).toBe("Unauthorized"), { timeout: 3000 });
        expect(mockAction).toHaveBeenCalledTimes(2);
        expect(result.current.categories).toEqual([]);
        expect(result.current.loading).toBe(false);
    });

    it("notifies the caller with the loaded options", async () => {
        mockAction.mockResolvedValue(OK);
        const onLoaded = jest.fn();

        renderHook(() => useTransactionFormOptions(onLoaded));

        await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
        expect(onLoaded).toHaveBeenCalledWith(OK.data);
    });
});

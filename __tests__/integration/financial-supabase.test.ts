import { SupabaseFinancialTransactionRepository } from "@/infrastructure/repositories/supabase/supabase-financial-transaction-repository";
import { FinancialTransaction } from "@/domain/entities/financial";
import * as serverSupabase from "@/infrastructure/supabase/server";

jest.mock("@/infrastructure/supabase/server", () => ({
    createClient: jest.fn(),
}));

describe("SupabaseFinancialTransactionRepository", () => {
    let mockSupabaseClient: any;
    let repository: SupabaseFinancialTransactionRepository;

    const mockUserId = "user-123";

    beforeEach(() => {
        // Create a chainable mock for Supabase
        mockSupabaseClient = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            range: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            overlaps: jest.fn().mockReturnThis(),
            contains: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
        };

        (serverSupabase.createClient as jest.Mock).mockResolvedValue(mockSupabaseClient);
        repository = new SupabaseFinancialTransactionRepository();
    });

    describe("findById", () => {
        it("should fetch a transaction by id and return it", async () => {
            const mockTx = { id: "tx-1", amount: 100 };
            mockSupabaseClient.single.mockResolvedValue({ data: mockTx, error: null });

            const result = await repository.findById("tx-1");

            expect(mockSupabaseClient.from).toHaveBeenCalledWith("financial_transactions");
            expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "tx-1");
            expect(result).toMatchObject({ id: mockTx.id, amount: mockTx.amount });
        });

        it("should return null if the transaction is not found", async () => {
            mockSupabaseClient.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

            const result = await repository.findById("tx-1");

            expect(result).toBeNull();
        });
    });

    describe("findPaginated", () => {
        it("should correctly build a paginated query with filters", async () => {
            const mockData = [{ id: "tx-1" }, { id: "tx-2" }];
            const mockCount = 2;
            
            mockSupabaseClient.range.mockResolvedValue({ data: mockData, error: null, count: mockCount });
            mockSupabaseClient.count = mockCount;
            mockSupabaseClient.error = null;

            const filters = {
                query: "test",
                categoryId: "cat-1",
                institutionId: "inst-1",
                amountMin: 10,
                amountMax: 100,
                dateFrom: "2026-05-01",
                dateTo: "2026-05-31",
                tags: ["food"],
            };

            const result = await repository.findPaginated(mockUserId, filters, { page: 1, pageSize: 10 });

            // Assert core query chain
            expect(mockSupabaseClient.from).toHaveBeenCalledWith("financial_transactions");
            expect(mockSupabaseClient.select).toHaveBeenCalledWith("*", { count: "exact", head: true });
            
            // Assert filters were applied
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith("owner_user_id", mockUserId);
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith("category_id", "cat-1");
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith("institution_id", "inst-1");
            
            expect(mockSupabaseClient.gte).toHaveBeenCalledWith("amount", 10);
            expect(mockSupabaseClient.lte).toHaveBeenCalledWith("amount", 100);
            expect(mockSupabaseClient.gte).toHaveBeenCalledWith("date", "2026-05-01");
            expect(mockSupabaseClient.lte).toHaveBeenCalledWith("date", "2026-05-31");
            expect(mockSupabaseClient.overlaps).toHaveBeenCalledWith("tags", ["food"]);

            // Assert pagination range (page 1, size 10 means indices 0 to 9)
            expect(mockSupabaseClient.range).toHaveBeenCalledWith(0, 9);
            expect(mockSupabaseClient.order).toHaveBeenCalledWith("date", { ascending: false });

            // Assert result shape
            expect(result.pagination).toEqual({
                totalItems: mockCount,
                page: 1,
                pageSize: 10,
                totalPages: 1,
                hasNextPage: false,
                hasPreviousPage: false,
            });
            expect(result.data).toHaveLength(2);
            expect(result.data[0].id).toBe("tx-1");
            expect(result.data[1].id).toBe("tx-2");
        });

        it("should handle second page of pagination correctly", async () => {
            mockSupabaseClient.range.mockResolvedValue({ data: [], error: null, count: 50 });
            mockSupabaseClient.count = 50;
            mockSupabaseClient.error = null;

            await repository.findPaginated(mockUserId, {}, { page: 2, pageSize: 20 });

            // Assert pagination range for page 2, size 20 (indices 20 to 39)
            expect(mockSupabaseClient.range).toHaveBeenCalledWith(20, 39);
        });
    });

    describe("create", () => {
        it("should map JS fields to DB fields and insert", async () => {
            const newTx: FinancialTransaction = {
                id: "tx-1",
                ownerUserId: mockUserId,
                amount: 100,
                currency: "USD",
                type: "EXPENSE",
                status: "CONFIRMED",
                date: "2026-05-15T10:00:00Z",
                createdAt: "2026-05-15T10:00:00Z",
                updatedAt: "2026-05-15T10:00:00Z",
                tags: [],
                possibleDuplicate: false,
                isDeleted: false,
                categoryId: null,
                institutionId: null,
                merchant: null,
                description: "Test description",
                notes: null,
                originStats: null,
            };

            mockSupabaseClient.single.mockResolvedValue({ data: { ...newTx, owner_user_id: mockUserId }, error: null });

            await repository.create(newTx);

            expect(mockSupabaseClient.insert).toHaveBeenCalled();
            // Verify snake_case mapping was passed to insert
            const insertArgs = mockSupabaseClient.insert.mock.calls[0][0];
            expect(insertArgs.owner_user_id).toBe(mockUserId);
            expect(insertArgs.possible_duplicate).toBe(false);
        });
    });
});


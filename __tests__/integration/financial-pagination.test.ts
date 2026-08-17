import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { FinancialTransaction } from "@/domain/entities/financial";

describe("InMemoryFinancialTransactionRepository - Pagination", () => {
    let repository: InMemoryFinancialTransactionRepository;

    const mockUserId = "user-123";

    beforeEach(async () => {
        repository = new InMemoryFinancialTransactionRepository();
        
        // Seed some data
        const transactions: FinancialTransaction[] = [];
        // 25 transactions for user-123
        for (let i = 1; i <= 25; i++) {
            transactions.push({
                id: `tx-${i}`,
                ownerUserId: mockUserId,
                amount: i * 10, // 10 to 250
                currency: "USD",
                type: i % 2 === 0 ? "INCOME" : "EXPENSE",
                status: "CONFIRMED",
                date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
                createdAt: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
                updatedAt: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
                categoryId: i % 3 === 0 ? "cat-1" : "cat-2",
                institutionId: null,
                merchant: `Merchant ${i}`,
                notes: null,
                tags: i % 5 === 0 ? ["food"] : [],
                possibleDuplicate: false,
                isDeleted: false,
                description: `Description ${i}`,
                originStats: null,
            });
        }
        
        // Add one for another user
        transactions.push({
            id: `tx-other`,
            ownerUserId: "user-456",
            amount: 50,
            currency: "USD",
            type: "EXPENSE",
            status: "CONFIRMED",
            date: `2026-05-15T10:00:00Z`,
            createdAt: `2026-05-15T10:00:00Z`,
            updatedAt: `2026-05-15T10:00:00Z`,
            categoryId: "cat-1",
            institutionId: null,
            merchant: "Other",
            notes: null,
            tags: [],
            possibleDuplicate: false,
            isDeleted: false,
            description: "Other description",
            originStats: null,
        });

        // Use a backdoor to populate the mock repo
        // Since InMemoryFinancialTransactionRepository typically stores an internal array, 
        // we simulate adding them via create
        await Promise.all(transactions.map(tx => repository.create(tx)));
    });

    describe("findPaginated", () => {
        it("should return the first page of results with correct total count", async () => {
            const result = await repository.findPaginated(mockUserId, {}, { page: 1, pageSize: 10 });

            expect(result.data).toHaveLength(10);
            expect(result.pagination.totalItems).toBe(25);
            expect(result.pagination.page).toBe(1);
            expect(result.pagination.pageSize).toBe(10);
            expect(result.pagination.totalPages).toBe(3); // 25 / 10 = 2.5 -> 3 pages
            
            // Check order (should be descending by date generally, though in-memory might sort by date if implemented)
            // Assuming the repo implements descending sort by date
        });

        it("should return the second page of results correctly", async () => {
            const result = await repository.findPaginated(mockUserId, {}, { page: 2, pageSize: 10 });

            expect(result.data).toHaveLength(10);
            expect(result.pagination.page).toBe(2);
        });

        it("should return the last partial page correctly", async () => {
            const result = await repository.findPaginated(mockUserId, {}, { page: 3, pageSize: 10 });

            expect(result.data).toHaveLength(5);
            expect(result.pagination.page).toBe(3);
        });

        it("should apply amount range filters correctly", async () => {
            const result = await repository.findPaginated(mockUserId, { 
                amountMin: 50,
                amountMax: 100
            }, { page: 1, pageSize: 10 });

            // Amounts are i * 10, so 50, 60, 70, 80, 90, 100 => 6 items
            expect(result.data).toHaveLength(6);
            expect(result.pagination.totalItems).toBe(6);
            result.data.forEach(tx => {
                expect(tx.amount).toBeGreaterThanOrEqual(50);
                expect(tx.amount).toBeLessThanOrEqual(100);
            });
        });

        it("should apply category filters correctly", async () => {
            const result = await repository.findPaginated(mockUserId, { 
                categoryId: "cat-1"
            }, { page: 1, pageSize: 50 });

            // i % 3 === 0 out of 25 -> 8 items (3, 6, 9, 12, 15, 18, 21, 24)
            expect(result.data).toHaveLength(8);
            result.data.forEach(tx => {
                expect(tx.categoryId).toBe("cat-1");
            });
        });

        it("should apply array tags filters correctly", async () => {
            const result = await repository.findPaginated(mockUserId, { 
                tags: ["food"]
            }, { page: 1, pageSize: 50 });

            // i % 5 === 0 out of 25 -> 5 items (5, 10, 15, 20, 25)
            expect(result.data).toHaveLength(5);
            result.data.forEach(tx => {
                expect(tx.tags).toContain("food");
            });
        });

        it("should combine multiple filters correctly", async () => {
            const result = await repository.findPaginated(mockUserId, { 
                categoryId: "cat-1",
                amountMin: 100 // tx 12, 15, 18, 21, 24
            }, { page: 1, pageSize: 50 });

            expect(result.data).toHaveLength(5);
        });
    });
});


import { generateTransactionFingerprint, findDuplicates } from "@/domain/services/financial-deduplication";
import { FinancialTransaction } from "@/domain/entities/financial";

describe("financial-deduplication", () => {
    describe("generateTransactionFingerprint", () => {
        it("should generate a consistent fingerprint for identical inputs", () => {
            const tx1 = {
                ownerUserId: "user1",
                amount: 100.55,
                date: "2026-05-18T10:00:00Z",
                merchant: " Amazon ",
                type: "EXPENSE" as const,
            };
            
            const tx2 = {
                ownerUserId: "user1",
                amount: 100.55,
                date: "2026-05-18T15:30:00Z",
                merchant: "AMAZON",
                type: "EXPENSE" as const,
            };

            expect(generateTransactionFingerprint(tx1)).toBe(generateTransactionFingerprint(tx2));
        });

        it("should differentiate by ownerUserId", () => {
            const tx1 = { ownerUserId: "user1", amount: 100, date: "2026-05-18T10:00:00Z", merchant: "Store", type: "EXPENSE" as const };
            const tx2 = { ...tx1, ownerUserId: "user2" };
            expect(generateTransactionFingerprint(tx1)).not.toBe(generateTransactionFingerprint(tx2));
        });

        it("should differentiate by amount", () => {
            const tx1 = { ownerUserId: "user1", amount: 100, date: "2026-05-18T10:00:00Z", merchant: "Store", type: "EXPENSE" as const };
            const tx2 = { ...tx1, amount: 100.01 };
            expect(generateTransactionFingerprint(tx1)).not.toBe(generateTransactionFingerprint(tx2));
        });

        it("should handle missing merchant gracefully", () => {
            const tx1 = { ownerUserId: "user1", amount: 100, date: "2026-05-18T10:00:00Z", merchant: undefined as any, type: "EXPENSE" as const };
            expect(generateTransactionFingerprint(tx1)).toContain("unknown");
        });
    });

    describe("findDuplicates", () => {
        const candidate = {
            ownerUserId: "user1",
            amount: 50.00,
            date: "2026-05-18T10:00:00Z",
            merchant: "Starbucks",
            type: "EXPENSE" as const,
        };

        it("should return an empty array if no duplicates exist", () => {
            const existing: FinancialTransaction[] = [
                { id: "1", ownerUserId: "user1", amount: 60.00, date: "2026-05-18T10:00:00Z", merchant: "Starbucks", type: "EXPENSE", status: "CONFIRMED", currency: "USD", originalAmount: null, categoryId: null, institutionId: null, tags: [], notes: null, createdAt: "2026-05-18T10:00:00Z", updatedAt: "2026-05-18T10:00:00Z", possibleDuplicate: false, isDeleted: false, description: "Test", originStats: null }
            ];
            expect(findDuplicates(candidate, existing)).toEqual([]);
        });

        it("should return ids of matching duplicates", () => {
            const existing: FinancialTransaction[] = [
                { id: "1", ownerUserId: "user1", amount: 50.00, date: "2026-05-18T11:00:00Z", merchant: "starbucks", type: "EXPENSE", status: "DETECTED", currency: "USD", originalAmount: null, categoryId: null, institutionId: null, tags: [], notes: null, createdAt: "2026-05-18T10:00:00Z", updatedAt: "2026-05-18T10:00:00Z", possibleDuplicate: false, isDeleted: false, description: "Test", originStats: null },
                { id: "2", ownerUserId: "user1", amount: 50.00, date: "2026-05-18T12:00:00Z", merchant: "STARBUCKS", type: "EXPENSE", status: "CONFIRMED", currency: "USD", originalAmount: null, categoryId: null, institutionId: null, tags: [], notes: null, createdAt: "2026-05-18T10:00:00Z", updatedAt: "2026-05-18T10:00:00Z", possibleDuplicate: false, isDeleted: false, description: "Test", originStats: null }
            ];
            expect(findDuplicates(candidate, existing)).toEqual(["1", "2"]);
        });

        it("should ignore DELETED, REJECTED and DUPLICATE statuses", () => {
            const existing: FinancialTransaction[] = [
                { id: "1", ownerUserId: "user1", amount: 50.00, date: "2026-05-18T11:00:00Z", merchant: "starbucks", type: "EXPENSE", status: "DELETED", currency: "USD", originalAmount: null, categoryId: null, institutionId: null, tags: [], notes: null, createdAt: "2026-05-18T10:00:00Z", updatedAt: "2026-05-18T10:00:00Z", possibleDuplicate: false, isDeleted: false, description: "Test", originStats: null },
                { id: "2", ownerUserId: "user1", amount: 50.00, date: "2026-05-18T12:00:00Z", merchant: "STARBUCKS", type: "EXPENSE", status: "REJECTED", currency: "USD", originalAmount: null, categoryId: null, institutionId: null, tags: [], notes: null, createdAt: "2026-05-18T10:00:00Z", updatedAt: "2026-05-18T10:00:00Z", possibleDuplicate: false, isDeleted: false, description: "Test", originStats: null },
                { id: "3", ownerUserId: "user1", amount: 50.00, date: "2026-05-18T12:00:00Z", merchant: "STARBUCKS", type: "EXPENSE", status: "DUPLICATE", currency: "USD", originalAmount: null, categoryId: null, institutionId: null, tags: [], notes: null, createdAt: "2026-05-18T10:00:00Z", updatedAt: "2026-05-18T10:00:00Z", possibleDuplicate: false, isDeleted: false, description: "Test", originStats: null }
            ];
            expect(findDuplicates(candidate, existing)).toEqual([]);
        });
    });
});


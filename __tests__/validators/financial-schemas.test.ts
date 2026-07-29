import { 
    createTransactionSchema, 
    updateTransactionSchema, 
    paginatedSearchSchema,
    markDuplicateSchema,
    transactionTypeSchema,
    transactionStatusSchema
} from "@/lib/validators/financial-schemas";
import { v4 as uuidv4 } from "uuid";

describe("financial-schemas", () => {
    describe("transactionTypeSchema", () => {
        it("should validate valid types", () => {
            expect(transactionTypeSchema.safeParse("EXPENSE").success).toBe(true);
            expect(transactionTypeSchema.safeParse("INCOME").success).toBe(true);
        });

        it("should reject invalid types", () => {
            expect(transactionTypeSchema.safeParse("INVALID").success).toBe(false);
            expect(transactionTypeSchema.safeParse("").success).toBe(false);
        });
    });

    describe("transactionStatusSchema", () => {
        it("should validate valid statuses", () => {
            expect(transactionStatusSchema.safeParse("DETECTED").success).toBe(true);
            expect(transactionStatusSchema.safeParse("CONFIRMED").success).toBe(true);
        });

        it("should reject invalid statuses", () => {
            expect(transactionStatusSchema.safeParse("PENDING").success).toBe(false);
            expect(transactionStatusSchema.safeParse("").success).toBe(false);
        });
    });

    describe("createTransactionSchema", () => {
        const validPayload = {
            type: "EXPENSE",
            amount: 100.50,
            currency: "USD",
            date: new Date().toISOString(),
            merchant: "Test Merchant",
            categoryId: uuidv4(),
            description: "Test transaction description",
        };

        it("should validate a completely valid payload", () => {
            const result = createTransactionSchema.safeParse(validPayload);
            expect(result.success).toBe(true);
        });

        it("should require a description — it is the transaction's title", () => {
            const { description: _omitted, ...withoutDescription } = validPayload;
            expect(createTransactionSchema.safeParse(withoutDescription).success).toBe(false);
            expect(createTransactionSchema.safeParse({ ...validPayload, description: "" }).success).toBe(false);
            expect(createTransactionSchema.safeParse({ ...validPayload, description: "   " }).success).toBe(false);
        });

        it("should reject a negative amount", () => {
            const result = createTransactionSchema.safeParse({
                ...validPayload,
                amount: -10
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Amount must be positive");
            }
        });

        it("should reject an invalid currency code", () => {
            const result = createTransactionSchema.safeParse({
                ...validPayload,
                currency: "US"
            });
            expect(result.success).toBe(false);

            const result2 = createTransactionSchema.safeParse({
                ...validPayload,
                currency: "USDD"
            });
            expect(result2.success).toBe(false);
        });

        it("should reject an invalid date format", () => {
            const result = createTransactionSchema.safeParse({
                ...validPayload,
                date: "not-a-date"
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Invalid date format. Use ISO 8601");
            }
        });

        it("should reject an invalid UUID for categoryId", () => {
            const result = createTransactionSchema.safeParse({
                ...validPayload,
                categoryId: "invalid-uuid"
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Invalid category ID");
            }
        });
        
        it("should reject if tags are more than 20 items", () => {
            const result = createTransactionSchema.safeParse({
                ...validPayload,
                tags: Array(21).fill("tag")
            });
            expect(result.success).toBe(false);
        });
    });

    describe("updateTransactionSchema", () => {
        it("should require an id", () => {
            const result = updateTransactionSchema.safeParse({
                amount: 100
            });
            expect(result.success).toBe(false);
        });

        it("should validate a valid partial update payload with id", () => {
            const result = updateTransactionSchema.safeParse({
                id: uuidv4(),
                amount: 150
            });
            expect(result.success).toBe(true);
        });

        // The update stays partial — a change that only touches the category must
        // keep validating — but a description that IS sent cannot be blank.
        it("should stay partial while rejecting a blank description", () => {
            const id = uuidv4();
            expect(updateTransactionSchema.safeParse({ id, categoryName: "Alimentación" }).success).toBe(true);
            expect(updateTransactionSchema.safeParse({ id, description: "Compra semanal" }).success).toBe(true);
            expect(updateTransactionSchema.safeParse({ id, description: "" }).success).toBe(false);
            expect(updateTransactionSchema.safeParse({ id, description: "   " }).success).toBe(false);
        });
    });

    describe("paginatedSearchSchema", () => {
        it("should apply default values for page and pageSize", () => {
            const result = paginatedSearchSchema.safeParse({});
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(1);
                expect(result.data.pageSize).toBe(20);
            }
        });

        it("should reject negative amount parameters", () => {
            const result = paginatedSearchSchema.safeParse({
                amountMin: -10,
            });
            expect(result.success).toBe(false);
        });

        it("should reject page less than 1", () => {
            const result = paginatedSearchSchema.safeParse({
                page: 0
            });
            expect(result.success).toBe(false);
        });

        it("should reject pageSize greater than 100", () => {
            const result = paginatedSearchSchema.safeParse({
                pageSize: 101
            });
            expect(result.success).toBe(false);
        });
    });

    describe("markDuplicateSchema", () => {
        it("should require both transactionId and duplicateOfId to be valid UUIDs", () => {
            const result = markDuplicateSchema.safeParse({
                transactionId: uuidv4(),
                duplicateOfId: uuidv4()
            });
            expect(result.success).toBe(true);
        });

        it("should reject if any of the ids is invalid", () => {
            const result = markDuplicateSchema.safeParse({
                transactionId: "invalid",
                duplicateOfId: uuidv4()
            });
            expect(result.success).toBe(false);
        });
    });
});


import { FinancialTransactionService, CreateFinancialTransactionDTO } from "@/application/services/financial-transaction-service";
import { FinancialTransaction } from "@/domain/entities/financial";
import { v4 as uuidv4 } from "uuid";

describe("FinancialTransactionService", () => {
    let transactionRepoMock: any;
    let auditLogRepoMock: any;
    let service: FinancialTransactionService;

    const mockUserId = uuidv4();
    const mockTransactionId = uuidv4();

    beforeEach(() => {
        // We need to mock crypto.randomUUID
        if (!global.crypto) {
            (global as any).crypto = {
                randomUUID: () => uuidv4()
            };
        }

        transactionRepoMock = {
            findByOwnerId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            delete: jest.fn(),
            getUniqueTags: jest.fn(),
            getFrequentDescriptions: jest.fn(),
            findPaginated: jest.fn(),
            search: jest.fn(),
        };

        auditLogRepoMock = {
            create: jest.fn(),
            findByTransactionId: jest.fn(),
        };

        service = new FinancialTransactionService(transactionRepoMock, auditLogRepoMock);
    });

    describe("createTransaction", () => {
        it("should create a new transaction and write an audit log", async () => {
            transactionRepoMock.findByOwnerId.mockResolvedValue([]);
            transactionRepoMock.create.mockImplementation(async (tx: any) => tx);
            auditLogRepoMock.create.mockResolvedValue({} as any);

            const dto: CreateFinancialTransactionDTO = {
                ownerUserId: mockUserId,
                type: "EXPENSE",
                amount: 100,
                currency: "USD",
                date: "2026-05-18T10:00:00Z",
                merchant: "Test",
                description: "Test description",
            };

            const result = await service.createTransaction(dto);

            expect(result).toBeDefined();
            expect(result.ownerUserId).toBe(mockUserId);
            expect(result.possibleDuplicate).toBe(false);
            expect(transactionRepoMock.create).toHaveBeenCalled();
            expect(auditLogRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: "CREATED",
                    changedByUserId: mockUserId
                })
            );
        });

        it("should default merchant to the institution name when no merchant is provided", async () => {
            transactionRepoMock.findByOwnerId.mockResolvedValue([]);
            transactionRepoMock.create.mockImplementation(async (tx: any) => tx);
            auditLogRepoMock.create.mockResolvedValue({} as any);

            const dto: CreateFinancialTransactionDTO = {
                ownerUserId: mockUserId,
                type: "EXPENSE",
                amount: 4.49,
                currency: "USD",
                date: "2026-06-17T10:00:00Z",
                institutionName: "El Asadero Medio Ejido",
                description: "Compra de merienda",
            };

            const result = await service.createTransaction(dto);

            expect(result.merchant).toBe("El Asadero Medio Ejido");
        });

        it("should keep an explicit merchant over the institution name", async () => {
            transactionRepoMock.findByOwnerId.mockResolvedValue([]);
            transactionRepoMock.create.mockImplementation(async (tx: any) => tx);
            auditLogRepoMock.create.mockResolvedValue({} as any);

            const dto: CreateFinancialTransactionDTO = {
                ownerUserId: mockUserId,
                type: "EXPENSE",
                amount: 10,
                currency: "USD",
                date: "2026-06-17T10:00:00Z",
                merchant: "Amazon",
                institutionName: "Visa",
                description: "Compra",
            };

            const result = await service.createTransaction(dto);

            expect(result.merchant).toBe("Amazon");
        });

        it("should mark as possible duplicate if a matching transaction exists", async () => {
            const existingTx = {
                id: uuidv4(),
                ownerUserId: mockUserId,
                type: "EXPENSE",
                status: "DETECTED",
                amount: 100,
                currency: "USD",
                date: "2026-05-18T12:00:00Z", // Same day
                merchant: "test", // Case insensitive match
            };
            transactionRepoMock.findByOwnerId.mockResolvedValue([existingTx]);
            transactionRepoMock.create.mockImplementation(async (tx: any) => tx);
            auditLogRepoMock.create.mockResolvedValue({} as any);

            const dto: CreateFinancialTransactionDTO = {
                ownerUserId: mockUserId,
                type: "EXPENSE",
                amount: 100, // Same amount
                currency: "USD",
                date: "2026-05-18T10:00:00Z", // Same day
                merchant: "Test", 
                description: "Test description",
            };

            const result = await service.createTransaction(dto);

            expect(result.possibleDuplicate).toBe(true);
            expect(auditLogRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: "CREATED_WITH_DUPLICATE_FLAG"
                })
            );
        });

        it("should implicitly create institution and category if they don't exist", async () => {
            const institutionRepoMock = { findByOwnerId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: "new-inst" }) };
            const categoryRepoMock = { findAllBaseAndUser: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: "new-cat" }) };
            
            const serviceWithRepos = new FinancialTransactionService(
                transactionRepoMock, auditLogRepoMock, institutionRepoMock as any, categoryRepoMock as any
            );

            transactionRepoMock.findByOwnerId.mockResolvedValue([]);
            transactionRepoMock.create.mockImplementation(async (tx: any) => tx);
            auditLogRepoMock.create.mockResolvedValue({} as any);

            const dto: CreateFinancialTransactionDTO = {
                ownerUserId: mockUserId, type: "EXPENSE", amount: 100, currency: "USD", date: "2026-05-18T10:00:00Z",
                institutionName: "New Institution", categoryName: "New Category", description: "Test"
            };

            const result = await serviceWithRepos.createTransaction(dto);

            expect(result.institutionId).toBe("new-inst");
            expect(result.categoryId).toBe("new-cat");
            expect(institutionRepoMock.create).toHaveBeenCalled();
            expect(categoryRepoMock.create).toHaveBeenCalled();
        });

        it("should use existing institution and category if they exist by name", async () => {
            const institutionRepoMock = { findByOwnerId: jest.fn().mockResolvedValue([{ id: "exist-inst", name: "Existing Inst" }]), create: jest.fn() };
            const categoryRepoMock = { findAllBaseAndUser: jest.fn().mockResolvedValue([{ id: "exist-cat", name: "Existing Cat" }]), create: jest.fn() };
            
            const serviceWithRepos = new FinancialTransactionService(
                transactionRepoMock, auditLogRepoMock, institutionRepoMock as any, categoryRepoMock as any
            );

            transactionRepoMock.findByOwnerId.mockResolvedValue([]);
            transactionRepoMock.create.mockImplementation(async (tx: any) => tx);
            auditLogRepoMock.create.mockResolvedValue({} as any);

            const dto: CreateFinancialTransactionDTO = {
                ownerUserId: mockUserId, type: "EXPENSE", amount: 100, currency: "USD", date: "2026-05-18T10:00:00Z",
                institutionName: "existing inst", categoryName: "Existing Cat", description: "Test"
            };

            const result = await serviceWithRepos.createTransaction(dto);

            expect(result.institutionId).toBe("exist-inst");
            expect(result.categoryId).toBe("exist-cat");
            expect(institutionRepoMock.create).not.toHaveBeenCalled();
            expect(categoryRepoMock.create).not.toHaveBeenCalled();
        });
    });

    describe("institution enrichment", () => {
        it("resolves institutionName from institutionId, prioritised over the stored merchant", async () => {
            const institutionRepoMock = {
                findByOwnerId: jest.fn().mockResolvedValue([
                    { id: "inst-1", ownerUserId: mockUserId, name: "El Asadero Medio Ejido", isDeleted: false },
                ]),
            };
            const categoryRepoMock = {
                findAllBaseAndUser: jest.fn().mockResolvedValue([]),
            };
            const enrichingService = new FinancialTransactionService(
                transactionRepoMock,
                auditLogRepoMock,
                institutionRepoMock as any,
                categoryRepoMock as any,
            );

            transactionRepoMock.findById.mockResolvedValue({
                id: mockTransactionId,
                ownerUserId: mockUserId,
                type: "EXPENSE",
                status: "MANUAL",
                amount: 4.49,
                currency: "USD",
                date: "2026-06-17T10:00:00Z",
                merchant: "stale-merchant",
                institutionId: "inst-1",
                categoryId: null,
            });

            const result = await enrichingService.getTransactionById(mockTransactionId);

            expect(result?.institutionName).toBe("El Asadero Medio Ejido");
        });
    });

    describe("updateTransaction", () => {
        it("should update a transaction and log it", async () => {
            const existingTx = {
                id: mockTransactionId,
                ownerUserId: mockUserId,
                type: "EXPENSE",
                amount: 100,
            };
            transactionRepoMock.findById.mockResolvedValue(existingTx);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);

            const result = await service.updateTransaction(mockTransactionId, mockUserId, { amount: 200 });

            expect(result.amount).toBe(200);
            expect(transactionRepoMock.update).toHaveBeenCalled();
            expect(auditLogRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: "UPDATED"
                })
            );
        });

        // `??` no distinguía «déjalo» de «quítalo», así que una cuenta quitada
        // volvía a aparecer en la siguiente lectura.
        it("clears a bank link when the caller sends null for it", async () => {
            const existingTx = {
                id: mockTransactionId, ownerUserId: mockUserId, type: "INCOME", amount: 500,
                bankDestinationAccountId: "acc-1",
            };
            transactionRepoMock.findById.mockResolvedValue(existingTx);
            transactionRepoMock.update.mockImplementation(async (tx: FinancialTransaction) => tx);

            const result = await service.updateTransaction(mockTransactionId, mockUserId, {
                bankDestinationAccountId: null,
            });

            expect(result.bankDestinationAccountId).toBeNull();
        });

        it("keeps a bank link the caller never mentioned", async () => {
            const existingTx = {
                id: mockTransactionId, ownerUserId: mockUserId, type: "INCOME", amount: 500,
                bankDestinationAccountId: "acc-1",
            };
            transactionRepoMock.findById.mockResolvedValue(existingTx);
            transactionRepoMock.update.mockImplementation(async (tx: FinancialTransaction) => tx);

            const result = await service.updateTransaction(mockTransactionId, mockUserId, { amount: 600 });

            expect(result.bankDestinationAccountId).toBe("acc-1");
        });

        it("should throw if the transaction does not exist or doesn't belong to the user", async () => {
            transactionRepoMock.findById.mockResolvedValue(null);

            await expect(service.updateTransaction(mockTransactionId, mockUserId, { amount: 200 }))
                .rejects.toThrow("Transaction not found or unauthorized");
        });
        it("should implicitly create institution and category if they don't exist on update", async () => {
            const institutionRepoMock = { findByOwnerId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: "new-inst" }) };
            const categoryRepoMock = { findAllBaseAndUser: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: "new-cat" }) };
            
            const serviceWithRepos = new FinancialTransactionService(
                transactionRepoMock, auditLogRepoMock, institutionRepoMock as any, categoryRepoMock as any
            );

            const existingTx = { id: mockTransactionId, ownerUserId: mockUserId, type: "EXPENSE", amount: 100 };
            transactionRepoMock.findById.mockResolvedValue(existingTx);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
            auditLogRepoMock.create.mockResolvedValue({} as any);

            const result = await serviceWithRepos.updateTransaction(mockTransactionId, mockUserId, {
                institutionName: "New Institution", categoryName: "New Category"
            });

            expect(result.institutionId).toBe("new-inst");
            expect(result.categoryId).toBe("new-cat");
        });
    });

    describe("workflow transitions", () => {
        const createTxInState = (status: string) => ({
            id: mockTransactionId,
            ownerUserId: mockUserId,
            status,
            type: "EXPENSE",
        });

        beforeEach(() => {
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
        });

        it("should review a transaction", async () => {
            transactionRepoMock.findById.mockResolvedValue(createTxInState("DETECTED"));
            const result = await service.reviewTransaction(mockTransactionId, mockUserId);
            expect(result.status).toBe("REVIEWED");
        });

        it("should throw an error on invalid transition", async () => {
            // DELETED cannot go to REVIEWED
            transactionRepoMock.findById.mockResolvedValue(createTxInState("DELETED"));
            await expect(service.reviewTransaction(mockTransactionId, mockUserId))
                .rejects.toThrow(/Invalid transition/);
        });

        it("should skip update if already in target state", async () => {
            transactionRepoMock.findById.mockResolvedValue(createTxInState("REVIEWED"));
            const result = await service.reviewTransaction(mockTransactionId, mockUserId);
            expect(result.status).toBe("REVIEWED");
            expect(transactionRepoMock.update).not.toHaveBeenCalled();
        });
    });

    describe("bulk operations", () => {
        it("should bulk confirm transactions", async () => {
            const tx1 = { id: uuidv4(), ownerUserId: mockUserId, status: "DETECTED" };
            const tx2 = { id: uuidv4(), ownerUserId: mockUserId, status: "REVIEWED" };
            
            transactionRepoMock.findById.mockImplementation((id: string) => {
                if (id === tx1.id) return Promise.resolve(tx1);
                if (id === tx2.id) return Promise.resolve(tx2);
                return Promise.resolve(null);
            });
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);

            const result = await service.bulkConfirmTransactions([tx1.id, tx2.id], mockUserId);
            
            expect(result.length).toBe(2);
            expect(result[0].status).toBe("CONFIRMED");
            expect(result[1].status).toBe("CONFIRMED");
            expect(transactionRepoMock.update).toHaveBeenCalledTimes(2);
        });

        it("should bulk reject transactions", async () => {
            const tx1 = { id: uuidv4(), ownerUserId: mockUserId, status: "DETECTED" };
            transactionRepoMock.findById.mockResolvedValue(tx1);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
            const result = await service.bulkRejectTransactions([tx1.id], mockUserId);
            expect(result[0].status).toBe("REJECTED");
        });

        it("should bulk archive transactions", async () => {
            const tx1 = { id: uuidv4(), ownerUserId: mockUserId, status: "CONFIRMED" };
            transactionRepoMock.findById.mockResolvedValue(tx1);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
            const result = await service.bulkArchiveTransactions([tx1.id], mockUserId);
            expect(result[0].status).toBe("ARCHIVED");
        });

        it("should bulk delete transactions", async () => {
            const tx1 = { id: uuidv4(), ownerUserId: mockUserId, status: "DETECTED" };
            transactionRepoMock.findById.mockResolvedValue(tx1);
            transactionRepoMock.delete.mockResolvedValue(undefined);
            const result = await service.bulkDeleteTransactions([tx1.id], mockUserId);
            expect(result[0].status).toBe("DELETED");
            expect(transactionRepoMock.delete).toHaveBeenCalled();
        });

        it("should bulk categorize transactions", async () => {
            const tx1 = { id: mockTransactionId, ownerUserId: mockUserId, type: "EXPENSE", categoryId: null };
            transactionRepoMock.findById.mockResolvedValue(tx1);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
            const newCatId = uuidv4();
            const result = await service.bulkCategorizeTransactions([tx1.id], newCatId, mockUserId);
            expect(result[0].categoryId).toBe(newCatId);
        });
    });

    describe("duplicate operations", () => {
        it("should mark a transaction as duplicate", async () => {
            const tx = { id: mockTransactionId, ownerUserId: mockUserId, status: "DETECTED" };
            transactionRepoMock.findById.mockResolvedValue(tx);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
            
            const duplicateOfId = uuidv4();
            const result = await service.markAsDuplicate(mockTransactionId, duplicateOfId, mockUserId);
            
            expect(result.status).toBe("DUPLICATE");
            expect(result.possibleDuplicate).toBe(true);
            expect(auditLogRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({ action: "MARKED_DUPLICATE" })
            );
        });

        it("should resolve a duplicate transaction", async () => {
            const tx = { id: mockTransactionId, ownerUserId: mockUserId, status: "DUPLICATE", possibleDuplicate: true };
            transactionRepoMock.findById.mockResolvedValue(tx);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
            
            const result = await service.resolveDuplicate(mockTransactionId, mockUserId);
            
            expect(result.status).toBe("CONFIRMED");
            expect(result.possibleDuplicate).toBe(false);
            expect(auditLogRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({ action: "DUPLICATE_RESOLVED" })
            );
        });
    });

    describe("queries and searching", () => {
        it("should get transactions by user with enrichment", async () => {
            const tx = { id: mockTransactionId, ownerUserId: mockUserId };
            transactionRepoMock.findByOwnerId.mockResolvedValue([tx]);
            
            const result = await service.getTransactionsByUser(mockUserId);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(mockTransactionId);
        });

        it("should return unique tags", async () => {
            transactionRepoMock.getUniqueTags.mockResolvedValue(["tag1", "tag2"]);
            const result = await service.getUniqueTags(mockUserId);
            expect(result).toEqual(["tag1", "tag2"]);
        });

        it("should search paginated results", async () => {
            const tx = { id: mockTransactionId, ownerUserId: mockUserId };
            transactionRepoMock.findPaginated.mockResolvedValue({
                data: [tx],
                total: 1,
                page: 1,
                pageSize: 20
            });
            const filters = { query: "test" };
            
            const result = await service.searchPaginated(mockUserId, filters, { page: 1, pageSize: 20 });
            expect(result.data).toHaveLength(1);
            expect(result.total).toBe(1);
            expect(transactionRepoMock.findPaginated).toHaveBeenCalled();
        });

        it("should search all filtered", async () => {
            const tx = { id: mockTransactionId, ownerUserId: mockUserId };
            transactionRepoMock.search.mockResolvedValue([tx]);
            const filters = { query: "test query" };
            
            const categoryRepoMock = { findAllBaseAndUser: jest.fn().mockResolvedValue([{ id: "cat1", name: "test cat" }]) };
            const institutionRepoMock = { findByOwnerId: jest.fn().mockResolvedValue([{ id: "inst1", name: "query inst" }]) };
            
            const serviceWithRepos = new FinancialTransactionService(
                transactionRepoMock, auditLogRepoMock, institutionRepoMock as any, categoryRepoMock as any
            );
            
            const result = await serviceWithRepos.searchAllFiltered(mockUserId, filters);
            expect(result).toHaveLength(1);
            expect(transactionRepoMock.search).toHaveBeenCalled();
            // It modifies filters object with wordCategoryIds and wordInstitutionIds implicitly
            expect((filters as any).words).toEqual(["test", "query"]);
        });
    });

    describe("additional workflow transitions", () => {
        it("should reject a transaction", async () => {
            const tx = { id: mockTransactionId, ownerUserId: mockUserId, status: "DETECTED" };
            transactionRepoMock.findById.mockResolvedValue(tx);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
            const result = await service.rejectTransaction(mockTransactionId, mockUserId);
            expect(result.status).toBe("REJECTED");
        });

        it("should archive a transaction", async () => {
            const tx = { id: mockTransactionId, ownerUserId: mockUserId, status: "CONFIRMED" };
            transactionRepoMock.findById.mockResolvedValue(tx);
            transactionRepoMock.update.mockImplementation(async (tx: any) => tx);
            const result = await service.archiveTransaction(mockTransactionId, mockUserId);
            expect(result.status).toBe("ARCHIVED");
        });
    });

    describe("frequent descriptions", () => {
        it("delegates to the repository, which aggregates them in the store", async () => {
            transactionRepoMock.getFrequentDescriptions.mockResolvedValue({
                EXPENSE: ["Compra semanal", "Almuerzo"],
            });

            const result = await service.getFrequentDescriptions(mockUserId);

            expect(transactionRepoMock.getFrequentDescriptions).toHaveBeenCalledWith(mockUserId, 5);
            expect(result).toEqual({ EXPENSE: ["Compra semanal", "Almuerzo"] });
        });

        it("degrades to no suggestions when the repository can't provide them", async () => {
            const withoutSupport = { ...transactionRepoMock, getFrequentDescriptions: undefined };
            const limited = new FinancialTransactionService(withoutSupport as any, auditLogRepoMock as any);

            await expect(limited.getFrequentDescriptions(mockUserId)).resolves.toEqual({});
        });
    });

});


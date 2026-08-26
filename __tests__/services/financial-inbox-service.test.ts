import { FinancialInboxService, MapScannerTransactionDTO } from "@/application/services/financial-inbox-service";
import { FinancialScannerTransaction, FinancialInstitution } from "@/domain/entities/financial";
import { IFinancialScannerTransactionRepository, IFinancialTransactionRepository, IFinancialTransactionAuditLogRepository, IFinancialInstitutionRepository } from "@/domain/repositories/financial";

describe("FinancialInboxService", () => {
    let scannerRepo: jest.Mocked<IFinancialScannerTransactionRepository>;
    let transactionRepo: jest.Mocked<IFinancialTransactionRepository>;
    let auditLogRepo: jest.Mocked<IFinancialTransactionAuditLogRepository>;
    let institutionRepo: jest.Mocked<IFinancialInstitutionRepository>;
    let service: FinancialInboxService;

    const mockUserId = "user-123";
    const mockScannerTxId = "scan-123";

    const baseScannerTx: FinancialScannerTransaction = {
        id: mockScannerTxId,
        executionId: "exec-123",
        ownerUserId: mockUserId,
        status: "DETECTED",
        description: "Test Scan",
        amount: 500,
        currency: "USD",
        merchant: "Amazon",
        date: "2026-05-15T10:00:00Z",
        type: "EXPENSE",
        originStats: {},
        createdAt: "2026-05-15T10:00:00Z",
        updatedAt: "2026-05-15T10:00:00Z",
        isDeleted: false,
    };

    beforeEach(() => {
        scannerRepo = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findById: jest.fn(),
            findByOwnerId: jest.fn(),
            findUnprocessedByOwnerId: jest.fn(),
            findByExecutionId: jest.fn(),
            findRecent: jest.fn(),
        } as any;

        transactionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findById: jest.fn(),
            findByOwnerId: jest.fn(),
            findByFingerprint: jest.fn(),
            findRecent: jest.fn(),
            findPaginated: jest.fn(),
        } as any;

        auditLogRepo = {
            create: jest.fn(),
        } as any;

        institutionRepo = {
            findByOwnerId: jest.fn(),
            create: jest.fn(),
        } as any;

        service = new FinancialInboxService(scannerRepo, transactionRepo, auditLogRepo, institutionRepo);
    });

    describe("getUnprocessedTransactions", () => {
        it("should return unprocessed transactions for a user", async () => {
            scannerRepo.findUnprocessedByOwnerId.mockResolvedValue([{ ...baseScannerTx }]);
            const results = await service.getUnprocessedTransactions(mockUserId);
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe(mockScannerTxId);
            expect(scannerRepo.findUnprocessedByOwnerId).toHaveBeenCalledWith(mockUserId);
        });
    });

    describe("getScannerTransactionById", () => {
        it("should return the transaction if it belongs to the user", async () => {
            scannerRepo.findById.mockResolvedValue({ ...baseScannerTx });
            const result = await service.getScannerTransactionById(mockScannerTxId, mockUserId);
            expect(result).toBeDefined();
            expect(result!.id).toBe(mockScannerTxId);
        });

        it("should return null if the transaction belongs to another user", async () => {
            scannerRepo.findById.mockResolvedValue({ ...baseScannerTx, ownerUserId: "other-user" });
            const result = await service.getScannerTransactionById(mockScannerTxId, mockUserId);
            expect(result).toBeNull();
        });

        it("should return null if the transaction is not found", async () => {
            scannerRepo.findById.mockResolvedValue(null);
            const result = await service.getScannerTransactionById(mockScannerTxId, mockUserId);
            expect(result).toBeNull();
        });
    });

    describe("dismissTransaction", () => {
        it("should mark a transaction as rejected", async () => {
            scannerRepo.findById.mockResolvedValue({ ...baseScannerTx });
            await service.dismissTransaction(mockScannerTxId, mockUserId);
            
            expect(scannerRepo.update).toHaveBeenCalled();
            const updatedTx = scannerRepo.update.mock.calls[0][0];
            expect(updatedTx.status).toBe("REJECTED");
            expect(updatedTx.description).toContain("Dismissed by user");
        });

        it("should throw an error if the transaction is not found or unauthorized", async () => {
            scannerRepo.findById.mockResolvedValue({ ...baseScannerTx, ownerUserId: "other-user" });
            await expect(service.dismissTransaction(mockScannerTxId, mockUserId)).rejects.toThrow("Scanner transaction not found or unauthorized");
        });
    });

    describe("mapAndConfirmTransaction", () => {
        const dto: MapScannerTransactionDTO = {
            scannerTransactionId: mockScannerTxId,
            userId: mockUserId,
            amount: 600,
            merchant: "Amazon Fixed",
            type: "EXPENSE",
        };

        it("should map and confirm a transaction, updating its status", async () => {
            scannerRepo.findById.mockResolvedValue({ ...baseScannerTx });
            transactionRepo.create.mockImplementation(async (tx) => tx as any);

            const result = await service.mapAndConfirmTransaction(dto);

            expect(result).toBeDefined();
            expect(result.amount).toBe(600);
            expect(result.merchant).toBe("Amazon Fixed");
            expect(result.type).toBe("EXPENSE");
            expect(result.status).toBe("CONFIRMED");

            // Verify scanner transaction was updated
            expect(scannerRepo.update).toHaveBeenCalled();
            const updatedScannerTx = scannerRepo.update.mock.calls[0][0];
            expect(updatedScannerTx.status).toBe("APPROVED");

            // Verify audit log was created
            expect(auditLogRepo.create).toHaveBeenCalled();
            const auditLog = auditLogRepo.create.mock.calls[0][0];
            expect(auditLog.action).toBe("MAPPED_FROM_INBOX");
        });

        it("should throw an error if transaction has already been processed", async () => {
            scannerRepo.findById.mockResolvedValue({ ...baseScannerTx, status: "APPROVED" });
            await expect(service.mapAndConfirmTransaction(dto)).rejects.toThrow("This scanner transaction has already been processed");
        });

        it("should auto-create a new institution if institutionName is provided and does not exist", async () => {
            scannerRepo.findById.mockResolvedValue({ ...baseScannerTx });
            institutionRepo.findByOwnerId.mockResolvedValue([]);
            institutionRepo.create.mockImplementation(async (inst) => ({ ...inst, id: "new-inst-id" } as any));
            transactionRepo.create.mockImplementation(async (tx) => tx as any);

            const result = await service.mapAndConfirmTransaction({ ...dto, institutionName: "New Bank" });

            expect(institutionRepo.create).toHaveBeenCalled();
            expect(result.institutionId).toBe("new-inst-id");
        });

        // The bank link is resolved *after* the text heuristic, so the flag has to
        // be decided again once the card is known — otherwise the row lands with a
        // CREDIT card and `paidWithCredit: false`, and its expense wrongly counts
        // as cash out on both screens.
        describe("credit flag vs. the resolved card", () => {
            const cardRepo = { findByOwnerId: jest.fn() } as any;
            const CREDIT_CARD_ID = "card-credit";
            const DEBIT_CARD_ID = "card-debit";

            function serviceLinkingCard(cardId: string | null) {
                const bankService = {
                    syncTransactionBankLinks: jest.fn().mockResolvedValue({
                        bankSourceAccountId: null,
                        bankDestinationAccountId: null,
                        bankCardId: cardId,
                        bankInstitutionId: null,
                        bankCounterpartyObservationId: null,
                    }),
                } as any;
                cardRepo.findByOwnerId.mockResolvedValue([
                    { id: CREDIT_CARD_ID, cardType: "CREDIT" },
                    { id: DEBIT_CARD_ID, cardType: "DEBIT" },
                ]);
                return new FinancialInboxService(
                    scannerRepo, transactionRepo, auditLogRepo, institutionRepo, undefined, bankService, cardRepo,
                );
            }

            it("marks the transaction as credit when the scan resolves to a CREDIT card", async () => {
                scannerRepo.findById.mockResolvedValue({ ...baseScannerTx });
                transactionRepo.create.mockImplementation(async (tx) => tx as any);

                const result = await serviceLinkingCard(CREDIT_CARD_ID).mapAndConfirmTransaction(dto);

                expect(result.bankCardId).toBe(CREDIT_CARD_ID);
                expect(result.paidWithCredit).toBe(true);
            });

            it("leaves it as cash when the scan resolves to a DEBIT card, whatever the text said", async () => {
                scannerRepo.findById.mockResolvedValue({
                    ...baseScannerTx,
                    summary: "Consumo con tarjeta de crédito en Amazon",
                });
                transactionRepo.create.mockImplementation(async (tx) => tx as any);

                const result = await serviceLinkingCard(DEBIT_CARD_ID).mapAndConfirmTransaction(dto);

                expect(result.bankCardId).toBe(DEBIT_CARD_ID);
                expect(result.paidWithCredit).toBe(false);
            });

            it("keeps what the user chose by hand over the card's type", async () => {
                scannerRepo.findById.mockResolvedValue({ ...baseScannerTx });
                transactionRepo.create.mockImplementation(async (tx) => tx as any);

                const result = await serviceLinkingCard(CREDIT_CARD_ID)
                    .mapAndConfirmTransaction({ ...dto, paidWithCredit: false });

                expect(result.paidWithCredit).toBe(false);
            });
        });

        it("should reuse an existing institution if institutionName is provided and matches", async () => {
            scannerRepo.findById.mockResolvedValue({ ...baseScannerTx });
            institutionRepo.findByOwnerId.mockResolvedValue([
                { id: "existing-inst-id", name: "Existing Bank", ownerUserId: mockUserId, status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: false } as FinancialInstitution
            ]);
            transactionRepo.create.mockImplementation(async (tx) => tx as any);

            const result = await service.mapAndConfirmTransaction({ ...dto, institutionName: "Existing Bank" });

            expect(institutionRepo.create).not.toHaveBeenCalled();
            expect(result.institutionId).toBe("existing-inst-id");
        });
    });
});

import { normalizeForMatch } from "@/application/services/financial-inbox-service";

describe("FinancialInboxService - normalizeForMatch", () => {
    it("should return empty string for null or undefined", () => {
        expect(normalizeForMatch(null as any)).toBe('');
        expect(normalizeForMatch(undefined as any)).toBe('');
    });

    it("should uppercase the string", () => {
        expect(normalizeForMatch('banco pichincha')).toBe('BANCOPICHINCHA');
    });

    it("should remove diacritics (accents)", () => {
        expect(normalizeForMatch('Estación de Servicio')).toBe('ESTACIONDESERVICIO');
        expect(normalizeForMatch('áéíóú ÁÉÍÓÚ')).toBe('AEIOUAEIOU');
    });

    it("should remove special characters and spaces", () => {
        expect(normalizeForMatch('Banco-Pichincha (SA)')).toBe('BANCOPICHINCHASA');
        expect(normalizeForMatch('Mi_Cuenta 123!')).toBe('MICUENTA123');
        expect(normalizeForMatch('  Sodexo   ')).toBe('SODEXO');
    });

    it("should treat very similar inputs equally", () => {
        const input1 = normalizeForMatch('BANCO_PICHINCHA');
        const input2 = normalizeForMatch('Banco Pichincha');
        const input3 = normalizeForMatch('banco pichincha ');
        const input4 = normalizeForMatch('banco-pichincha');
        
        expect(input1).toBe(input2);
        expect(input2).toBe(input3);
        expect(input3).toBe(input4);
    });
});


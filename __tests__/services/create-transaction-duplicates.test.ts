import { FinancialTransactionService } from "@/application/services/financial-transaction-service";
import {
    InMemoryFinancialTransactionRepository, InMemoryFinancialTransactionAuditLogRepository,
} from "@/infrastructure/repositories/implementations";
import type { CreateFinancialTransactionDTO } from "@/domain/entities/financial";

const USER = "11111111-1111-1111-1111-111111111111";

function build() {
    const transactions = new InMemoryFinancialTransactionRepository();
    const audit = new InMemoryFinancialTransactionAuditLogRepository();
    const service = new FinancialTransactionService(transactions, audit);
    return { service, transactions };
}

const captura: CreateFinancialTransactionDTO = {
    ownerUserId: USER, type: "INCOME", status: "MANUAL", amount: 3731.58, currency: "USD",
    date: "2026-10-22T06:00:00.000Z", description: "Salario del mes",
    // Una captura por voz o texto no trae merchant: solo la institución.
    institutionName: "Banco Pichincha",
};

describe("crear una transacción · duplicados", () => {
    it("una captura sin merchant repetida se marca como posible duplicado", async () => {
        const { service } = build();
        await service.createTransaction(captura);

        const repetida = await service.createTransaction({ ...captura, date: "2026-10-22T14:20:00.000Z" });

        expect(repetida.possibleDuplicate).toBe(true);
    });

    it("otro día u otro monto no es duplicado", async () => {
        const { service } = build();
        await service.createTransaction(captura);

        expect((await service.createTransaction({ ...captura, date: "2026-10-23T06:00:00.000Z" })).possibleDuplicate).toBe(false);
        expect((await service.createTransaction({ ...captura, amount: 3731.59 })).possibleDuplicate).toBe(false);
    });

    it("no lee el historial completo para buscarlos", async () => {
        const { service, transactions } = build();
        const spy = jest.spyOn(transactions, "findByOwnerId");
        const narrow = jest.spyOn(transactions, "findDuplicateCandidates");

        await service.createTransaction(captura);

        expect(narrow).toHaveBeenCalledWith(USER, { type: "INCOME", amount: 3731.58, day: "2026-10-22" });
        // El repositorio en memoria usa findByOwnerId por dentro; lo que importa
        // es que el servicio ya no lo pida por su cuenta.
        expect(spy.mock.calls.length).toBe(narrow.mock.calls.length);
    });
});

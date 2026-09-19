import { BalanceService } from "@/application/services/balance-service";
import type { FinancialTransaction } from "@/domain/entities/financial";

describe("BalanceService", () => {
    const userId = "user-1";

    const baseTx: Omit<FinancialTransaction, "id"> = {
        ownerUserId: userId,
        amount: 0,
        currency: "USD",
        date: "2026-08-23T10:00:00Z",
        type: "EXPENSE",
        status: "CONFIRMED",
        categoryId: null,
        institutionId: null,
        merchant: "Test",
        description: "Test",
        notes: null,
        possibleDuplicate: false,
        isDeleted: false,
        tags: [],
        createdAt: "2026-08-23T10:00:00Z",
        updatedAt: "2026-08-23T10:00:00Z",
    };

    const transactions: FinancialTransaction[] = [
        { ...baseTx, id: "1", type: "INCOME", amount: 5000, bankDestinationAccountId: "acc-in" },
        { ...baseTx, id: "2", amount: 200, bankSourceAccountId: "acc-in" },
        { ...baseTx, id: "3", amount: 100, bankSourceAccountId: "acc-out" },
        { ...baseTx, id: "4", amount: 50, paidWithCredit: true, bankCardId: "card-in" },
    ];

    // Sin `institutionName`: findByOwnerId mapea filas crudas, no lo decora
    // (eso lo hace BankService.namedByInstitution). El fixture refleja lo que
    // el repositorio realmente devuelve, para que el nombre resuelto por
    // accountLabel() sea el mismo que produce la ruta de producción.
    const accounts = [
        { id: "acc-in", institutionId: "inst-in", accountType: "SAVINGS", lastFour: "1111", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "" },
        { id: "acc-out", institutionId: "inst-out", accountType: "SAVINGS", lastFour: "2222", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "" },
    ];

    const cards = [
        { id: "card-in", institutionId: "inst-in", cardType: "CREDIT", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "" },
    ];

    function buildService(rules: unknown[] = [], txs: FinancialTransaction[] = transactions) {
        const transactionRepo = {
            findForDashboard: jest.fn().mockResolvedValue(txs),
        } as any;
        const accountRepo = { findByOwnerId: jest.fn().mockResolvedValue(accounts) } as any;
        const cardRepo = { findByOwnerId: jest.fn().mockResolvedValue(cards) } as any;
        const movementRepo = { findAllForOwner: jest.fn().mockResolvedValue([]) } as any;
        const snapshotRepo = {
            findLatestForAccount: jest.fn().mockImplementation(async (accountId: string) =>
                accountId === "acc-in"
                    ? { id: "s1", accountId, balance: 1200, asOf: "2026-08-01T00:00:00Z" }
                    : null),
        } as any;
        const categoryRepo = { findAllBaseAndUser: jest.fn().mockResolvedValue([]) } as any;
        const settingsRepo = {
            getSettings: jest.fn().mockResolvedValue(null),
            getRules: jest.fn().mockResolvedValue(rules),
        } as any;

        return new BalanceService(
            transactionRepo, accountRepo, cardRepo, movementRepo, snapshotRepo, categoryRepo, settingsRepo,
        );
    }

    it("devuelve los tres balances sin configuración", async () => {
        const set = await buildService().getBalanceSet(userId, {});

        // 5000 − 200 − 100; el consumo con tarjeta queda diferido.
        expect(set.period.value).toBe(4700);
        expect(set.withCredit.value).toBe(4650);
        expect(set.withCredit.creditDeferred).toBe(50);
        expect(set.defaultMode).toBe("PERIOD");
    });

    it("mantiene la identidad entre expenses (bruto) y value (neto de crédito)", async () => {
        const set = await buildService().getBalanceSet(userId, {});

        // expenses es gasto bruto (incluye lo pagado con tarjeta); value lo difiere
        // exactamente en withCredit.creditDeferred. La relación documentada en
        // BalanceSet.period debe sostenerse siempre, no solo en este fixture.
        const { income, expenses, savings, funding, crossScope, value } = set.period;
        expect(income - expenses + set.withCredit.creditDeferred - savings + funding + crossScope).toBe(value);
    });

    describe("transferencias que cruzan el borde de la configuración", () => {
        const excludeOut = [{
            id: "r1", ownerUserId: userId, targetType: "INSTITUTION", targetId: "inst-out",
            included: false, createdAt: "", updatedAt: "", isDeleted: false,
        }];

        /** Solo la transferencia, para leer su aporte sin ruido alrededor. */
        function onlyTransfer(from: string | null, to: string | null): FinancialTransaction[] {
            return [{
                ...baseTx, id: "t1", type: "TRANSFER", amount: 32000,
                bankSourceAccountId: from, bankDestinationAccountId: to,
            }];
        }

        // El caso real que inflaba el balance en +$32.000: un anticipo que
        // salió de una cuenta excluida hacia un tercero sin registrar.
        it("una salida hacia un destino desconocido no aporta nada", async () => {
            const set = await buildService(excludeOut, onlyTransfer("acc-out", null))
                .getBalanceSet(userId, {});

            expect(set.period.crossScope).toBe(0);
            expect(set.period.value).toBe(0);
        });

        it("entre dos cuentas conocidas sí aporta, y el renglón lo explica", async () => {
            const set = await buildService(excludeOut, onlyTransfer("acc-out", "acc-in"))
                .getBalanceSet(userId, {});

            expect(set.period.crossScope).toBe(32000);
            expect(set.period.value).toBe(32000);
        });

        it("la identidad se sostiene con un cruce de por medio", async () => {
            const set = await buildService(excludeOut, [
                ...transactions,
                {
                    ...baseTx, id: "t1", type: "TRANSFER", amount: 900,
                    bankSourceAccountId: "acc-in", bankDestinationAccountId: "acc-out",
                },
            ]).getBalanceSet(userId, {});

            const { income, expenses, savings, funding, crossScope, value } = set.period;
            expect(crossScope).toBe(-900);
            expect(income - expenses + set.withCredit.creditDeferred - savings + funding + crossScope).toBe(value);
        });
    });

    it("mantiene la identidad con scope activo, incluyendo un gasto con tarjeta sin bankCardId excluido por su cuenta origen", async () => {
        // Reproduce el caso que rompía sumCreditExpenses: paidWithCredit=true,
        // sin bankCardId, pero con bankSourceAccountId apuntando a un banco
        // excluido. Debe quedar fuera tanto de period (buildPeriod ya lo hacía)
        // como de creditDeferred (sumCreditExpenses ahora usa el mismo predicado).
        const scopedTransactions: FinancialTransaction[] = [
            ...transactions,
            {
                ...baseTx, id: "5", amount: 75, paidWithCredit: true,
                bankSourceAccountId: "acc-out", bankCardId: null,
            },
        ];

        const rules = [{
            id: "r1", ownerUserId: userId, targetType: "INSTITUTION", targetId: "inst-out",
            included: false, createdAt: "", updatedAt: "", isDeleted: false,
        }];

        const set = await buildService(rules, scopedTransactions).getBalanceSet(userId, {});

        const { income, expenses, savings, funding, value } = set.period;
        expect(income - expenses + set.withCredit.creditDeferred - savings + funding).toBe(value);
        // El gasto con tarjeta de la cuenta excluida no debe restar de withCredit.value.
        expect(set.withCredit.creditDeferred).toBe(50);
    });

    describe("con transacciones ya filtradas por quien llama", () => {
        it("las usa en vez de leer del repositorio", async () => {
            const service = buildService();
            const repo = (service as any).transactionRepo;

            // Solo el ingreso y un gasto: lo que devolvería una lista filtrada
            // por categoría, por ejemplo.
            const set = await service.getBalanceSet(userId, {
                transactions: [transactions[0], transactions[1]],
            });

            expect(repo.findForDashboard).not.toHaveBeenCalled();
            expect(set.period.value).toBe(4800);
        });

        it("descarta las que no son dinero real, aunque vengan en la lista", async () => {
            // `search` no filtra por estado: devuelve todo salvo DELETED y
            // ARCHIVED, así que una detección pendiente o un rechazo llegan
            // aquí y no deben mover el balance.
            const service = buildService();

            const set = await service.getBalanceSet(userId, {
                transactions: [
                    transactions[0],
                    { ...baseTx, id: "pending", amount: 900, status: "DETECTED" },
                    { ...baseTx, id: "rejected", amount: 700, status: "REJECTED" },
                ],
            });

            expect(set.period.value).toBe(5000);
        });

        it("el total no depende de esa lista: sigue siendo el saldo de las cuentas", async () => {
            const set = await buildService().getBalanceSet(userId, { transactions: [] });

            expect(set.total.value).toBe(1200);
        });
    });

    it("el total solo suma cuentas con saldo declarado y reporta las demás", async () => {
        const set = await buildService().getBalanceSet(userId, {});

        expect(set.total.value).toBe(1200);
        expect(set.total.accountsCounted).toBe(1);
        // "Ahorros XXXX2222": accountLabel() de tipo + número enmascarado, no la
        // institución — el repositorio no la enriquece.
        expect(set.total.accountsWithoutSnapshot).toEqual([{ id: "acc-out", name: "Ahorros XXXX2222" }]);
    });

    it("el scope filtra los balances de periodo pero no el total", async () => {
        const rules = [{
            id: "r1", ownerUserId: userId, targetType: "INSTITUTION", targetId: "inst-out",
            included: false, createdAt: "", updatedAt: "", isDeleted: false,
        }];

        const set = await buildService(rules).getBalanceSet(userId, {});

        // El gasto de 100 en el banco excluido ya no resta.
        expect(set.period.value).toBe(4800);
        // El total sigue mirando todas las cuentas.
        expect(set.total.value).toBe(1200);
        expect(set.period.excludedCount).toBe(1);
    });

    it("respeta el modo por defecto guardado", async () => {
        const service = buildService();
        (service as any).settingsRepo.getSettings.mockResolvedValue({
            ownerUserId: userId, defaultMode: "TOTAL", showRunningBalance: false,
        });

        expect((await service.getBalanceSet(userId, {})).defaultMode).toBe("TOTAL");
    });

    describe("saldo corriente", () => {
        /** El mismo servicio, con el interruptor del libro diario encendido. */
        function withRunningOn(rules: unknown[] = [], txs?: FinancialTransaction[]) {
            const service = buildService(rules, txs);
            (service as any).settingsRepo.getSettings.mockResolvedValue({
                ownerUserId: userId, defaultMode: "PERIOD", showRunningBalance: true,
            });
            return service;
        }

        it("no viene si el usuario no lo encendió", async () => {
            const set = await buildService().getBalanceSet(userId, { transactions });

            expect(set.showRunningBalance).toBe(false);
            expect(set.running).toBeUndefined();
        });

        it("tampoco viene sin una lista que recorrer", async () => {
            const set = await withRunningOn().getBalanceSet(userId, {});

            expect(set.showRunningBalance).toBe(true);
            expect(set.running).toBeUndefined();
        });

        it("el saldo de la última fila es el balance que muestra la cabecera", async () => {
            const set = await withRunningOn().getBalanceSet(userId, { transactions });

            // transactions viene ordenada de la más antigua a la más reciente y
            // todas comparten fecha, así que desempata el id: la última es "4".
            expect(set.running!.period["4"].balance).toBe(set.period.value);
            expect(set.running!.withCredit["4"].balance).toBe(set.withCredit.value);
        });

        it("el consumo con tarjeta solo mueve el saldo en el modo con tarjetas", async () => {
            const set = await withRunningOn().getBalanceSet(userId, { transactions });

            expect(set.running!.period["4"].moved).toBe(false);
            expect(set.running!.withCredit["4"].moved).toBe(true);
        });

        it("una fila fuera de la configuración no mueve el saldo", async () => {
            const rules = [{
                id: "r1", ownerUserId: userId, targetType: "INSTITUTION", targetId: "inst-out",
                included: false, createdAt: "", updatedAt: "", isDeleted: false,
            }];

            const set = await withRunningOn(rules).getBalanceSet(userId, { transactions });

            // "3" es el gasto de la cuenta del banco excluido.
            expect(set.running!.period["3"].moved).toBe(false);
            expect(set.running!.period["3"].balance).toBe(set.running!.period["2"].balance);
        });

        it("las filas que no son dinero real aparecen igual, repitiendo el saldo", async () => {
            const pending: FinancialTransaction = {
                ...baseTx, id: "pending", amount: 900, status: "DETECTED",
                date: "2026-08-23T23:00:00Z",
            };

            const set = await withRunningOn().getBalanceSet(userId, {
                transactions: [...transactions, pending],
            });

            expect(set.running!.period["pending"]).toEqual({
                balance: set.period.value, moved: false,
            });
        });
    });
});

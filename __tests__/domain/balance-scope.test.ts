import { resolveScope } from "@/domain/services/balance-scope";
import type { BalanceScopeRule } from "@/domain/entities/balance";

describe("resolveScope", () => {
    const targets = {
        accounts: [
            { id: "acc-pichincha-1", institutionId: "inst-pichincha" },
            { id: "acc-pichincha-2", institutionId: "inst-pichincha" },
            { id: "acc-austro-1", institutionId: "inst-austro" },
            { id: "acc-cash", institutionId: null },
        ],
        cards: [
            { id: "card-pichincha", institutionId: "inst-pichincha" },
            { id: "card-austro", institutionId: "inst-austro" },
        ],
    };

    function rule(
        targetType: BalanceScopeRule["targetType"],
        targetId: string,
        included: boolean,
    ): BalanceScopeRule {
        return {
            id: `rule-${targetType}-${targetId}`,
            ownerUserId: "user-1",
            targetType,
            targetId,
            included,
            createdAt: "2026-08-27T00:00:00Z",
            updatedAt: "2026-08-27T00:00:00Z",
            isDeleted: false,
        };
    }

    it("incluye todo cuando no hay reglas", () => {
        const scope = resolveScope([], targets);

        expect(scope.isUnrestricted).toBe(true);
        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(true);
        expect(scope.isCardIncluded("card-austro")).toBe(true);
    });

    it("excluir un banco saca sus cuentas y sus tarjetas", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);

        expect(scope.isUnrestricted).toBe(false);
        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(false);
        expect(scope.isAccountIncluded("acc-pichincha-2")).toBe(false);
        expect(scope.isCardIncluded("card-pichincha")).toBe(false);
        expect(scope.isAccountIncluded("acc-austro-1")).toBe(true);
    });

    it("una cuenta nueva del banco excluido también queda fuera", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], {
            ...targets,
            accounts: [...targets.accounts, { id: "acc-nueva", institutionId: "inst-pichincha" }],
        });

        expect(scope.isAccountIncluded("acc-nueva")).toBe(false);
    });

    it("una regla de cuenta rescata una cuenta de un banco excluido", () => {
        const scope = resolveScope(
            [rule("INSTITUTION", "inst-pichincha", false), rule("ACCOUNT", "acc-pichincha-1", true)],
            targets,
        );

        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(true);
        expect(scope.isAccountIncluded("acc-pichincha-2")).toBe(false);
    });

    it("una regla de cuenta saca una cuenta de un banco incluido", () => {
        const scope = resolveScope([rule("ACCOUNT", "acc-austro-1", false)], targets);

        expect(scope.isAccountIncluded("acc-austro-1")).toBe(false);
        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(true);
    });

    it("ignora reglas que apuntan a algo que ya no existe", () => {
        const scope = resolveScope([rule("ACCOUNT", "acc-borrada", false)], targets);

        expect(scope.isUnrestricted).toBe(true);
        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(true);
    });

    it("una transacción sin ninguna cuenta ligada siempre entra", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);

        expect(scope.isTransactionIncluded({ type: "EXPENSE" })).toBe(true);
        expect(scope.isTransactionIncluded({
            type: "EXPENSE",
            bankSourceAccountId: null,
            bankCardId: null,
        })).toBe(true);
    });

    it("una transacción ligada a algo excluido queda fuera", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);

        expect(scope.isTransactionIncluded({
            type: "EXPENSE",
            bankSourceAccountId: "acc-pichincha-1",
        })).toBe(false);
        expect(scope.isTransactionIncluded({
            type: "EXPENSE",
            bankCardId: "card-pichincha",
        })).toBe(false);
        expect(scope.isTransactionIncluded({
            type: "INCOME",
            bankDestinationAccountId: "acc-pichincha-2",
        })).toBe(false);
    });

    it("las transferencias nunca se descartan: su signo lo decide computeNetBalance", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);

        expect(scope.isTransactionIncluded({
            type: "TRANSFER",
            bankSourceAccountId: "acc-austro-1",
            bankDestinationAccountId: "acc-pichincha-1",
        })).toBe(true);
    });

    it("una cuenta sin banco (efectivo) solo se excluye con su propia regla", () => {
        const porBanco = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);
        expect(porBanco.isAccountIncluded("acc-cash")).toBe(true);

        const propia = resolveScope([rule("ACCOUNT", "acc-cash", false)], targets);
        expect(propia.isAccountIncluded("acc-cash")).toBe(false);
    });
});

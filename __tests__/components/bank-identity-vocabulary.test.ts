import {
    ACCOUNT_TYPE_ACRONYM, CARD_TYPE_ACRONYM, THIRD_PARTY_ACRONYM, UNKNOWN_TYPE_ACRONYM,
    acronymTone, identityAcronym,
} from "@/lib/bank-identity-label";
import { formatIdentityNumber, identityNumberFromDisplay } from "@/lib/format-bank-number";
import type { BankAccount, BankCard } from "@/domain/entities/bank";

/**
 * El acrónimo va delante del número porque es lo que primero hace falta saber:
 * «••••0814» a secas no distingue unos ahorros de una tarjeta de crédito, y de
 * eso depende si el gasto pesa hoy o cuando se pague la tarjeta.
 */
describe("acrónimos de identidad bancaria", () => {
    it("todos miden tres letras, para que la columna no baile", () => {
        const todos = [
            ...Object.values(ACCOUNT_TYPE_ACRONYM),
            ...Object.values(CARD_TYPE_ACRONYM),
            THIRD_PARTY_ACRONYM,
            UNKNOWN_TYPE_ACRONYM,
        ];

        expect(todos.length).toBeGreaterThan(0);
        for (const acronym of todos) {
            expect(acronym).toMatch(/^[A-Z]{3}$/);
        }
    });

    it("no repite acrónimo entre dos cosas distintas", () => {
        const todos = [
            ...Object.values(ACCOUNT_TYPE_ACRONYM),
            ...Object.values(CARD_TYPE_ACRONYM),
            THIRD_PARTY_ACRONYM,
            UNKNOWN_TYPE_ACRONYM,
        ];

        expect(new Set(todos).size).toBe(todos.length);
    });

    it("distingue las tarjetas por su tipo, no solo de las cuentas", () => {
        expect(CARD_TYPE_ACRONYM.CREDIT).toBe("TCR");
        expect(CARD_TYPE_ACRONYM.DEBIT).toBe("TDE");
        expect(ACCOUNT_TYPE_ACRONYM.SAVINGS).toBe("AHO");
        expect(ACCOUNT_TYPE_ACRONYM.CHECKING).toBe("CTE");
    });

    it("lo saca de la entidad según sea cuenta o tarjeta", () => {
        const cuenta = { accountType: "SAVINGS" } as BankAccount;
        const tarjeta = { cardType: "CREDIT" } as BankCard;

        expect(identityAcronym(cuenta, "ACCOUNT")).toBe("AHO");
        expect(identityAcronym(tarjeta, "CARD")).toBe("TCR");
    });

    it("colorea por familia, para reconocerlo sin llegar a leerlo", () => {
        expect(acronymTone("AHO")).toBe("savings");
        expect(acronymTone("TCR")).toBe("credit");
        expect(acronymTone("TDE")).toBe("debit");
        // Lo que no se sabe no se disfraza de una cuenta cualquiera.
        expect(acronymTone(UNKNOWN_TYPE_ACRONYM)).toBe("muted");
        expect(acronymTone(THIRD_PARTY_ACRONYM)).toBe("muted");
    });
});

describe("el número se muestra con largo fijo", () => {
    it("un prefijo de seis no cabe con el sufijo: cede el principio", () => {
        expect(formatIdentityNumber({ lastFour: "0814", prefixDigits: "493176" })).toBe("XXXX0814");
    });

    it("no muestra nada cuando no hay cola que mostrar", () => {
        expect(formatIdentityNumber({ lastFour: null, prefixDigits: "493176" })).toBe("");
    });

    it("normaliza un número ya enmascarado, venga como venga del banco", () => {
        expect(identityNumberFromDisplay("493176XXXX2780")).toBe("XXXX2780");
        expect(identityNumberFromDisplay("••••0814")).toBe("XXXX0814");
        expect(identityNumberFromDisplay("XXXX8361")).toBe("XXXX8361");
    });

    it("no inventa dígitos que el banco nunca escribió", () => {
        // En «25••••10» el «25» es prefijo y la cola conocida son dos dígitos.
        // Se muestran los dos y el prefijo, que cabe: nunca un «2510» falso.
        expect(identityNumberFromDisplay("25••••10")).toBe("25XXXX10");
        expect(identityNumberFromDisplay("25••••10")).not.toContain("2510");
    });
});

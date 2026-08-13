import { z } from "zod";

const uuid = z.string().uuid();
const digits = z.string().regex(/^[0-9]{1,6}$/, "Solo dígitos");

export const createInstitutionSchema = z.object({
    name: z.string().min(1, "El nombre es requerido").max(120),
    shortName: z.string().max(40).optional().nullable(),
    kind: z.enum(["BANK", "COOPERATIVE", "WALLET", "OTHER"]).default("BANK"),
    logoUrl: z.string().url().optional().nullable(),
    color: z.string().max(32).optional().nullable(),
    country: z.string().length(2).optional().nullable(),
    financialInstitutionId: uuid.optional().nullable(),
});

const accountBase = z.object({
    institutionId: uuid.optional().nullable(),
    name: z.string().min(1, "El nombre es requerido").max(120),
    accountType: z.enum(["CHECKING", "SAVINGS", "CASH", "INVESTMENT"]),
    lastFour: digits.optional().nullable(),
    prefixDigits: digits.optional().nullable(),
    currency: z.string().length(3).default("USD"),
});

export const createAccountSchema = accountBase.refine(
    // Espeja el CHECK de la base: el efectivo no tiene emisor, todo lo demás sí.
    d => (d.accountType === "CASH") === (d.institutionId == null),
    { message: "Solo la cuenta de efectivo va sin institución", path: ["institutionId"] },
);

const cardBase = z.object({
    institutionId: uuid,
    accountId: uuid.optional().nullable(),
    name: z.string().min(1, "El nombre es requerido").max(120),
    cardType: z.enum(["DEBIT", "CREDIT"]),
    brand: z.string().max(40).optional().nullable(),
    bin: digits.optional().nullable(),
    lastFour: digits.optional().nullable(),
    prefixDigits: digits.optional().nullable(),
    currency: z.string().length(3).default("USD"),
    creditLimit: z.number().positive().optional().nullable(),
    statementDay: z.number().int().min(1).max(31).optional().nullable(),
    dueDay: z.number().int().min(1).max(31).optional().nullable(),
});

// Los tres CHECK de bank_cards, repetidos aquí para que el error llegue al
// formulario en vez de volver como una violación de constraint de Postgres.
export const createCardSchema = cardBase
    .refine(d => d.cardType !== "DEBIT" || d.accountId != null, {
        message: "Una tarjeta de débito debe estar atada a una cuenta",
        path: ["accountId"],
    })
    .refine(d => d.cardType !== "CREDIT" || d.accountId == null, {
        message: "Una tarjeta de crédito no se ata a una cuenta",
        path: ["accountId"],
    })
    .refine(
        d => d.cardType !== "DEBIT" ||
            (d.creditLimit == null && d.statementDay == null && d.dueDay == null),
        { message: "Una tarjeta de débito no tiene cupo ni ciclo", path: ["creditLimit"] },
    );

export const balanceSnapshotSchema = z.object({
    accountId: uuid,
    balance: z.number(),
    asOf: z.string().datetime(),
    note: z.string().max(280).optional().nullable(),
});

export const statementTotalSchema = z.object({
    statementId: uuid,
    totalAmount: z.number().nonnegative(),
});

export const payStatementSchema = z.object({
    statementId: uuid,
    sourceAccountId: uuid,
    amount: z.number().positive("El monto debe ser mayor que cero"),
    date: z.string().datetime(),
});

// Las de update parten de la base sin refinar: un parcial no puede validar
// invariantes entre campos que quizá no vengan en el payload.
export const updateInstitutionSchema = createInstitutionSchema.partial();
export const updateAccountSchema = accountBase.partial();
export const updateCardSchema = cardBase.partial();

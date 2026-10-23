import { render, screen } from "@testing-library/react";
import { SummaryStep } from "@/presentation/financial/components/transaction-wizard/steps/SummaryStep";
import type { WizardValues } from "@/presentation/financial/hooks/useTransactionWizard";
import type { ScannedAccountView } from "@/application/services/bank-service";
import type { BankAccount } from "@/domain/entities/bank";

const STAMPS = { createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", isDeleted: false };

const cuenta9558 = {
    id: "acc-9558", ownerUserId: "u1", accountType: "SAVINGS", currency: "USD", lastFour: "9558",
    status: "ACTIVE", isUnconfirmed: false, institutionName: "Banco Pichincha", ...STAMPS,
} as unknown as BankAccount;

const values: WizardValues = {
    type: "INCOME", amount: "3731.58", description: "Salario del mes",
    institutionName: "Banco Pichincha", categoryName: "Salario", paidWithCredit: false,
    bankDestinationAccountId: "acc-9558", date: "2026-10-22T06:00", notes: "", tags: [],
} as WizardValues;

const origenSinRegistrar: ScannedAccountView = {
    role: "SOURCE", raw: "Origen detectado", display: "Sin registrar", kind: "ACCOUNT",
    resolution: "PENDING", match: null, institutionHint: null, ownership: null, decision: null,
};

function renderSummary(bankAccounts: ScannedAccountView[]) {
    return render(
        <SummaryStep
            values={values} initialValues={values} changed={[]} missing={[]} currency="USD"
            mode="confirm" onEdit={() => {}} onNotesChange={() => {}} onTagsChange={() => {}}
            tagSuggestions={[]} notesOrigin="auto"
            accounts={[cuenta9558]} cards={[]} bankAccounts={bankAccounts}
        />,
    );
}

describe("Resumen · Forma de pago", () => {
    it("muestra la cuenta elegida aunque haya otra lectura detectada", () => {
        renderSummary([origenSinRegistrar]);
        // La ••9558 elegida como destino tiene que verse en la fila.
        expect(screen.getByText(/9558/)).toBeInTheDocument();
    });

    it("sin lecturas detectadas muestra la cuenta elegida", () => {
        renderSummary([]);
        expect(screen.getByText(/9558/)).toBeInTheDocument();
    });

    it("una lectura sin registrar del lado ya elegido no aparece", () => {
        renderSummary([{ ...origenSinRegistrar, role: "DESTINATION" }]);
        expect(screen.queryByText(/Sin registrar/)).toBeNull();
        expect(screen.getByText(/9558/)).toBeInTheDocument();
    });
});

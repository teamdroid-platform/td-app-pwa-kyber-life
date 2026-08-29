import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { BalanceModeSwitch } from "@/presentation/financial/components/BalanceModeSwitch";
import type { BalanceSet } from "@/application/services/balance-service";
import type { BalanceMode } from "@/domain/entities/balance";

const balances: BalanceSet = {
    defaultMode: "PERIOD",
    currency: "USD",
    total: { value: 4812.3, accountsCounted: 6, accountsWithoutSnapshot: [{ id: "a", name: "Austro" }], creditDebt: 371.26 },
    period: { value: 4709.46, income: 5000, expenses: 290.54, savings: 0, funding: 0, crossScope: 0, excludedCount: 0 },
    withCredit: { value: 4510.77, creditDeferred: 198.69 },
};

function Harness({ initial = "PERIOD" as BalanceMode }) {
    const [mode, setMode] = useState<BalanceMode>(initial);
    return (
        <BalanceModeSwitch
            balances={balances}
            mode={mode}
            onModeChange={setMode}
            rangeLabel="22 ago – 21 sep"
        />
    );
}

// Radix abre y cierra sus triggers (DropdownMenuTrigger incluido) escuchando
// `pointerdown`, no `click` — ver el polyfill de PointerEvent en
// jest.setup.js. fireEvent.click() por sí solo nunca abre el panel.
function openPanel() {
    fireEvent.pointerDown(screen.getByRole("button", { name: /balance del periodo/i }), { button: 0 });
}

describe("BalanceModeSwitch", () => {
    it("muestra la etiqueta del modo activo", () => {
        render(<Harness />);

        expect(screen.getByRole("button", { name: /balance del periodo/i })).toBeInTheDocument();
    });

    it("al abrirlo lista los tres balances con su valor", () => {
        render(<Harness />);
        openPanel();

        expect(screen.getByText("$4.812,30")).toBeInTheDocument();
        expect(screen.getByText("$4.709,46")).toBeInTheDocument();
        expect(screen.getByText("$4.510,77")).toBeInTheDocument();
    });

    it("explica cada cálculo", () => {
        render(<Harness />);
        openPanel();

        expect(screen.getByText(/6 cuentas con saldo declarado/i)).toBeInTheDocument();
        // El rango aparece en dos explicaciones (periodo y con tarjetas), así
        // que getAllByText en vez de getByText — ambas son coincidencias válidas.
        expect(screen.getAllByText(/22 ago – 21 sep/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/\$198,69/)).toBeInTheDocument();
    });

    it("elegir otro modo lo comunica y cierra el panel", () => {
        render(<Harness />);
        openPanel();
        fireEvent.click(screen.getByRole("menuitemradio", { name: /con tarjetas/i }));

        expect(screen.getByRole("button", { name: /balance con tarjetas/i })).toBeInTheDocument();
    });

    it("en modo total avisa de las cuentas sin saldo declarado", () => {
        render(<Harness initial="TOTAL" />);

        expect(screen.getByText(/1 cuenta sin saldo declarado/i)).toBeInTheDocument();
    });

    it("usa el singular cuando solo hay una cuenta con saldo declarado", () => {
        const singleAccount: BalanceSet = {
            ...balances,
            total: { ...balances.total, accountsCounted: 1 },
        };
        render(
            <BalanceModeSwitch
                balances={singleAccount}
                mode="TOTAL"
                onModeChange={() => {}}
                rangeLabel="22 ago – 21 sep"
            />
        );
        fireEvent.pointerDown(screen.getByRole("button", { name: /balance total/i }), { button: 0 });

        expect(screen.getByText(/Suma de los saldos de tus 1 cuenta con saldo declarado/i)).toBeInTheDocument();
    });

    // El aviso ámbar de transacciones excluidas se retiró: repetía en cada
    // carga algo que el usuario ya configuró, y no había nada que hacer con él.
    it("no anuncia las transacciones que la configuración dejó fuera", () => {
        const withExclusions: BalanceSet = {
            ...balances,
            period: { ...balances.period, excludedCount: 3 },
        };
        render(
            <BalanceModeSwitch
                balances={withExclusions}
                mode="PERIOD"
                onModeChange={() => {}}
                rangeLabel="22 ago – 21 sep"
            />
        );

        expect(screen.queryByText(/fuera de tu configuración de balances/i)).not.toBeInTheDocument();
    });
});

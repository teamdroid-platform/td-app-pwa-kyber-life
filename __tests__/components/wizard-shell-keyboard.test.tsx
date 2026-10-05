import { render, screen, fireEvent, act } from "@testing-library/react";
import { WizardShell } from "@/presentation/financial/components/transaction-wizard/WizardShell";

function renderShell() {
    return render(
        <WizardShell title="Editar categoría" screen="category" focus onBack={() => {}} footer={<button>Guardar cambio</button>}>
            <input aria-label="Buscar categoría" />
            <input type="checkbox" aria-label="Marcar" />
        </WizardShell>,
    );
}

describe("WizardShell — teclado abierto", () => {
    afterEach(() => jest.useRealTimers());

    it("el pie flota mientras nadie escribe", () => {
        renderShell();
        expect(screen.getByTestId("wizard-footer")).toHaveAttribute("data-floating", "true");
    });

    it("deja de flotar al escribir, para no tapar el buscador ni la lista", () => {
        renderShell();
        fireEvent.focus(screen.getByLabelText("Buscar categoría"));
        expect(screen.getByTestId("wizard-footer")).toHaveAttribute("data-floating", "false");
    });

    it("vuelve a flotar al cerrar el teclado", () => {
        jest.useFakeTimers();
        renderShell();
        const input = screen.getByLabelText("Buscar categoría");
        input.focus();
        input.blur();
        act(() => { jest.advanceTimersByTime(250); });
        expect(screen.getByTestId("wizard-footer")).toHaveAttribute("data-floating", "true");
    });

    it("una casilla no abre teclado, así que el pie sigue flotando", () => {
        renderShell();
        fireEvent.focus(screen.getByLabelText("Marcar"));
        expect(screen.getByTestId("wizard-footer")).toHaveAttribute("data-floating", "true");
    });
});

describe("WizardShell — editando un solo dato", () => {
    it("no muestra flecha atrás, solo una X que cancela la edición", () => {
        const onBack = jest.fn();
        const onCancelFocus = jest.fn();
        render(
            <WizardShell title="Editar monto y descripción" screen="amount" focus
                onBack={onBack} onCancelFocus={onCancelFocus} footer={null}>
                <p>paso</p>
            </WizardShell>,
        );

        expect(screen.queryByRole("button", { name: "Volver" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Cerrar edición" }));
        expect(onCancelFocus).toHaveBeenCalled();
        expect(onBack).not.toHaveBeenCalled();
    });

    it("se marca para que la página oculte su propia cabecera", () => {
        const { container } = render(
            <WizardShell title="Editar categoría" screen="category" focus onBack={() => {}} footer={null}>
                <p>paso</p>
            </WizardShell>,
        );
        expect(container.querySelector('[data-wizard-focus="true"]')).not.toBeNull();
    });

    it("recorriendo los pasos conserva la flecha atrás y no oculta nada", () => {
        const { container } = render(
            <WizardShell title="Nueva transacción" screen="category" focus={false} onBack={() => {}} footer={null}>
                <p>paso</p>
            </WizardShell>,
        );
        expect(screen.getByRole("button", { name: "Volver" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Cerrar edición" })).toBeNull();
        expect(container.querySelector('[data-wizard-focus="true"]')).toBeNull();
    });
});

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
    collectMissing,
    diffValues,
    useTransactionWizard,
    type WizardMode,
    type WizardValues,
} from "@/presentation/financial/hooks/useTransactionWizard";

const BASE: WizardValues = {
    type: "EXPENSE",
    amount: "47.90",
    description: "Compra semanal",
    institutionName: "Supermaxi",
    accountName: "Visa Oro",
    categoryName: "Supermercado",
    paidWithCredit: true,
    date: "2026-07-28T19:40",
    notes: "Registro de gasto",
    tags: ["MERCADO"],
};

const values = (overrides: Partial<WizardValues> = {}): WizardValues => ({ ...BASE, ...overrides });

/** Minimal host that surfaces the parts of the API the tests drive. */
function Host({ mode, initial }: { mode: WizardMode; initial: WizardValues }) {
    const w = useTransactionWizard({ mode, initialValues: initial });
    return (
        <div>
            <span data-testid="screen">{w.screen}</span>
            <span data-testid="focus">{String(w.focus)}</span>
            <span data-testid="can-advance">{String(w.canAdvance)}</span>
            <span data-testid="missing">{w.missing.map((m) => m.field).join(",")}</span>
            <span data-testid="changed">{w.changed.join(",")}</span>
            <span data-testid="description">{w.values.description}</span>
            <button onClick={w.next}>next</button>
            <button onClick={w.back}>back</button>
            <button onClick={() => w.goTo("summary")}>to-summary</button>
            <button onClick={() => w.openFocus("category")}>focus-category</button>
            <button onClick={w.commitFocus}>commit</button>
            <button onClick={w.cancelFocus}>cancel</button>
            <button onClick={w.reset}>reset</button>
            <button onClick={() => w.setValue("description", "Otra cosa")}>edit-description</button>
            <button onClick={() => w.setValue("categoryName", "Alimentación")}>edit-category</button>
        </div>
    );
}

const screenId = () => screen.getByTestId("screen").textContent;
const click = (label: string) => fireEvent.click(screen.getByText(label));

describe("collectMissing", () => {
    it("accepts a complete transaction", () => {
        expect(collectMissing(values())).toEqual([]);
    });

    it("requires a positive amount", () => {
        expect(collectMissing(values({ amount: "0" })).map((m) => m.field)).toEqual(["amount"]);
        expect(collectMissing(values({ amount: "" })).map((m) => m.field)).toEqual(["amount"]);
    });

    it("requires the description — it is the transaction's title", () => {
        expect(collectMissing(values({ description: "   " })).map((m) => m.field)).toEqual(["description"]);
    });

    it("requires an institution and a date", () => {
        expect(collectMissing(values({ institutionName: "", date: "" })).map((m) => m.field))
            .toEqual(["institutionName", "date"]);
    });

    it("does not require a category or an account", () => {
        expect(collectMissing(values({ categoryName: "", accountName: "" }))).toEqual([]);
    });
});

describe("diffValues", () => {
    it("reports nothing when nothing moved", () => {
        expect(diffValues(BASE, values())).toEqual([]);
    });

    it("reports each changed field", () => {
        expect(diffValues(BASE, values({ amount: "52.10", categoryName: "Alimentación" })))
            .toEqual(["amount", "categoryName"]);
    });

    it("compares tags by content, not by reference", () => {
        expect(diffValues(BASE, values({ tags: ["MERCADO"] }))).toEqual([]);
        expect(diffValues(BASE, values({ tags: ["MERCADO", "QUINCENA"] }))).toEqual(["tags"]);
    });
});

describe("useTransactionWizard — navigation", () => {
    it("walks the five steps and lands on the summary", () => {
        render(<Host mode="create" initial={values()} />);
        expect(screenId()).toBe("amount");

        ["institution", "category", "payment", "date", "summary"].forEach((expected) => {
            click("next");
            expect(screenId()).toBe(expected);
        });
    });

    it("goes back one step at a time and never past the first", () => {
        render(<Host mode="create" initial={values()} />);
        click("next");
        click("back");
        expect(screenId()).toBe("amount");
        click("back");
        expect(screenId()).toBe("amount");
    });

    it("reaches the summary from any step and comes back to the last one", () => {
        render(<Host mode="create" initial={values()} />);
        click("to-summary");
        expect(screenId()).toBe("summary");
        click("back");
        expect(screenId()).toBe("date");
    });

    it("starts on the summary when editing", () => {
        render(<Host mode="edit" initial={values()} />);
        expect(screenId()).toBe("summary");
    });

    it("starts on the summary when confirming a scan — the values already exist", () => {
        render(<Host mode="confirm" initial={values()} />);
        expect(screenId()).toBe("summary");
    });

    it("still lets a confirmation walk back into the steps", () => {
        render(<Host mode="confirm" initial={values()} />);
        click("back");
        expect(screenId()).toBe("date");
    });
});

describe("useTransactionWizard — step validation", () => {
    it("blocks the amount step without a description", () => {
        render(<Host mode="create" initial={values({ description: "" })} />);
        expect(screen.getByTestId("can-advance").textContent).toBe("false");
        click("edit-description");
        expect(screen.getByTestId("can-advance").textContent).toBe("true");
    });

    it("blocks the amount step without an amount", () => {
        render(<Host mode="create" initial={values({ amount: "" })} />);
        expect(screen.getByTestId("can-advance").textContent).toBe("false");
    });

    it("does not let a missing institution block the amount step", () => {
        render(<Host mode="create" initial={values({ institutionName: "" })} />);
        expect(screen.getByTestId("can-advance").textContent).toBe("true");
        expect(screen.getByTestId("missing").textContent).toBe("institutionName");
    });

    it("blocks the summary while anything required is missing", () => {
        render(<Host mode="edit" initial={values({ institutionName: "" })} />);
        expect(screenId()).toBe("summary");
        expect(screen.getByTestId("can-advance").textContent).toBe("false");
    });
});

describe("useTransactionWizard — focus mode", () => {
    it("opens one step and returns to the summary when the change is kept", () => {
        render(<Host mode="edit" initial={values()} />);
        click("focus-category");
        expect(screenId()).toBe("category");
        expect(screen.getByTestId("focus").textContent).toBe("true");

        click("edit-category");
        click("commit");
        expect(screenId()).toBe("summary");
        expect(screen.getByTestId("focus").textContent).toBe("false");
        expect(screen.getByTestId("changed").textContent).toBe("categoryName");
    });

    it("restores the previous value when the focused edit is cancelled", () => {
        render(<Host mode="edit" initial={values()} />);
        click("focus-category");
        click("edit-category");
        click("cancel");

        expect(screenId()).toBe("summary");
        expect(screen.getByTestId("changed").textContent).toBe("");
    });

    it("treats the back gesture as cancelling out of focus mode", () => {
        render(<Host mode="edit" initial={values()} />);
        click("focus-category");
        click("back");
        expect(screenId()).toBe("summary");
        expect(screen.getByTestId("focus").textContent).toBe("false");
    });
});

describe("useTransactionWizard — undo", () => {
    it("drops every pending change", () => {
        render(<Host mode="edit" initial={values()} />);
        click("edit-description");
        expect(screen.getByTestId("changed").textContent).toBe("description");

        act(() => {
            click("reset");
        });
        expect(screen.getByTestId("changed").textContent).toBe("");
        expect(screen.getByTestId("description").textContent).toBe("Compra semanal");
    });
});

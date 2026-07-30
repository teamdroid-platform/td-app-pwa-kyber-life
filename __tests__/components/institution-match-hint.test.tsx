import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { InstitutionMatchHint } from "@/presentation/financial/components/InstitutionMatchBadge";

describe("InstitutionMatchHint — high confidence", () => {
    /**
     * A match that asks nothing of the user costs one line, so the institution
     * grid keeps the screen. The full explanation stays a tap away.
     */
    it("fits in one line and keeps the detail behind a tap", () => {
        render(
            <InstitutionMatchHint
                info={{ level: "verified", score: 0.94, matchedName: "Banco Pichincha" }}
                merchant="BANCO PICHINCHA*QUITO"
            />,
        );

        expect(screen.getByText("Identificada")).toBeInTheDocument();
        expect(screen.getByText(/94% desde «BANCO PICHINCHA\*QUITO»/)).toBeInTheDocument();

        // The block's wording is not on screen until asked for.
        expect(screen.queryByText("Institución identificada")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button"));

        expect(screen.getByText("Institución identificada")).toBeInTheDocument();
        expect(screen.getByText(/El escaneo leyó/)).toBeInTheDocument();
    });

    it("names the match in its accessible label, even when the text is clipped", () => {
        render(
            <InstitutionMatchHint
                info={{ level: "verified", score: 1, matchedName: "Rochester Hotel Concept" }}
                merchant="ROCHESTER HOTEL CONCEPT"
            />,
        );

        expect(screen.getByRole("button", { name: /Institución identificada: 100% desde ROCHESTER HOTEL CONCEPT/ }))
            .toBeInTheDocument();
    });
});

describe("InstitutionMatchHint — worth stopping at", () => {
    /** Partial and absent matches are the cases to look at, so they stay expanded. */
    it("spells out a partial match and asks for confirmation", () => {
        render(
            <InstitutionMatchHint
                info={{ level: "warning", score: 0.63, matchedName: "Banco del Austro" }}
                merchant="BCO AUSTRO"
            />,
        );

        expect(screen.getByText("Coincidencia parcial")).toBeInTheDocument();
        expect(screen.getByText(/El escaneo leyó «BCO AUSTRO»/)).toBeInTheDocument();
        expect(screen.getByText(/Coincide un 63% con «Banco del Austro»/)).toBeInTheDocument();
        expect(screen.getByText(/Confirma que sea la correcta/)).toBeInTheDocument();
    });

    it("says what to do when nothing matched", () => {
        render(<InstitutionMatchHint info={{ level: "none", score: 0.1, matchedName: null }} merchant="PAYU*AR*UBER" />);

        expect(screen.getByText("Sin coincidencia")).toBeInTheDocument();
        expect(screen.getByText(/no se parece a ninguna institución guardada/)).toBeInTheDocument();
        expect(screen.getByText(/Elige la correcta o crea una nueva/)).toBeInTheDocument();
    });

    it("still reads sensibly without a merchant", () => {
        render(<InstitutionMatchHint info={{ level: "none", score: 0, matchedName: null }} />);

        expect(screen.getByText(/No se identificó ninguna institución/)).toBeInTheDocument();
    });
});

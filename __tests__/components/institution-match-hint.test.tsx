import React from "react";
import { render, screen } from "@testing-library/react";
import { InstitutionMatchHint } from "@/presentation/financial/components/InstitutionMatchBadge";

describe("InstitutionMatchHint", () => {
    it("states the confidence and the institution it matched", () => {
        render(
            <InstitutionMatchHint
                info={{ level: "verified", score: 0.94, matchedName: "Banco Pichincha" }}
                merchant="BANCO PICHINCHA*QUITO"
            />,
        );

        expect(screen.getByText("Institución identificada")).toBeInTheDocument();
        expect(screen.getByText(/El escaneo leyó «BANCO PICHINCHA\*QUITO»/)).toBeInTheDocument();
        expect(screen.getByText(/Coincide un 94% con «Banco Pichincha»/)).toBeInTheDocument();
    });

    it("asks for confirmation on a partial match", () => {
        render(<InstitutionMatchHint info={{ level: "warning", score: 0.63, matchedName: "Banco del Austro" }} />);

        expect(screen.getByText("Coincidencia parcial")).toBeInTheDocument();
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

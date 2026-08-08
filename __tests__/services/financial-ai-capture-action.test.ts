/**
 * The two extraction actions, exercised against a stubbed webhook.
 *
 * What matters here is not the happy path — that is the schema's job — but the
 * boundary: the user id must come from the session and never from the caller,
 * and every failure mode must reach the client as a sentence instead of an
 * exception.
 */

const requireUserId = jest.fn<Promise<string>, []>();

jest.mock("@/infrastructure/supabase/auth-user", () => ({
    requireUserId: () => requireUserId(),
}));

import {
    extractTransactionFromAudioAction,
    extractTransactionFromTextAction,
} from "@/app/actions/financial-ai-capture";

const SESSION_USER_ID = "4aba0e45-4814-402f-b37f-b3149cb58433";

const PAYLOAD = {
    type: "expense",
    title: "Gasto por servicios de IA",
    amount: 12.5,
    currency: "USD",
    institution_name: "Anthropic",
    date: "2026-08-06T19:42:47.335Z",
};

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        statusText: "OK",
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    requireUserId.mockResolvedValue(SESSION_USER_ID);
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.N8N_EXTRACT_TEXT_WEBHOOK_URL = "http://n8n.test/webhook/extract/text";
    process.env.N8N_EXTRACT_AUDIO_WEBHOOK_URL = "http://n8n.test/webhook/extract/audio";
});

describe("extractTransactionFromTextAction", () => {
    it("posts the sentence with the id from the session, not from the caller", async () => {
        fetchMock.mockResolvedValue(jsonResponse(PAYLOAD));

        const result = await extractTransactionFromTextAction({
            text: "Gasté 12,50 en Anthropic",
            // A caller trying to extract for somebody else.
            userId: "00000000-0000-0000-0000-000000000000",
        } as { text: string });

        expect(result.success).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("http://n8n.test/webhook/extract/text");
        expect(JSON.parse(init.body)).toEqual({ text: "Gasté 12,50 en Anthropic", userId: SESSION_USER_ID });
    });

    it("returns the extracted fields on success", async () => {
        fetchMock.mockResolvedValue(jsonResponse(PAYLOAD));
        const result = await extractTransactionFromTextAction({ text: "Gasté 12,50 en Anthropic" });
        expect(result).toEqual({ success: true, data: expect.objectContaining({ institution_name: "Anthropic" }) });
    });

    it("rejects text too short to describe a movement, without calling the webhook", async () => {
        const result = await extractTransactionFromTextAction({ text: "ab" });
        expect(result.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports a missing webhook configuration instead of fetching undefined", async () => {
        delete process.env.N8N_EXTRACT_TEXT_WEBHOOK_URL;
        const result = await extractTransactionFromTextAction({ text: "Gasté 12,50" });
        expect(result).toEqual({ success: false, error: expect.stringContaining("Configuración de sistema") });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("unwraps the success/data envelope the workflow returns", async () => {
        fetchMock.mockResolvedValue(jsonResponse([{ success: true, data: PAYLOAD }]));
        const result = await extractTransactionFromTextAction({ text: "Almuerzo 12,50 con débito" });
        expect(result).toEqual({ success: true, data: expect.objectContaining({ title: "Gasto por servicios de IA" }) });
    });

    it("reports a failure the workflow returned with a 200", async () => {
        fetchMock.mockResolvedValue(jsonResponse([{ success: false, error: "modelo no disponible" }]));
        const result = await extractTransactionFromTextAction({ text: "Almuerzo 12,50" });
        expect(result).toEqual({ success: false, error: "modelo no disponible" });
    });

    it("refuses an answer that carried no usable field", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ meta: { runId: 7 } }));
        const result = await extractTransactionFromTextAction({ text: "Almuerzo 12,50" });
        expect(result).toEqual({ success: false, error: expect.stringContaining("No se pudo interpretar") });
    });

    it("turns a non-2xx answer into a message instead of throwing", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ message: "boom" }, { ok: false, status: 500 }));
        const result = await extractTransactionFromTextAction({ text: "Gasté 12,50" });
        expect(result).toEqual({ success: false, error: expect.stringContaining("500") });
    });

    it("turns an unreachable service into an actionable message", async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
        const result = await extractTransactionFromTextAction({ text: "Gasté 12,50" });
        expect(result).toEqual({ success: false, error: expect.stringContaining("No se pudo conectar") });
    });

    it("names the timeout when the workflow never answers", async () => {
        fetchMock.mockRejectedValue(new DOMException("The operation was aborted", "TimeoutError"));
        const result = await extractTransactionFromTextAction({ text: "Gasté 12,50" });
        expect(result).toEqual({ success: false, error: expect.stringContaining("tardó demasiado") });
    });

    it("does not reach the webhook when there is no session", async () => {
        requireUserId.mockRejectedValue(new Error("Unauthorized"));
        const result = await extractTransactionFromTextAction({ text: "Gasté 12,50" });
        expect(result.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("extractTransactionFromAudioAction", () => {
    function audioForm(file: File | null) {
        const formData = new FormData();
        if (file) formData.append("audio", file, file.name);
        return formData;
    }

    it("forwards the recording as multipart with the session's user id", async () => {
        fetchMock.mockResolvedValue(jsonResponse(PAYLOAD));
        const file = new File([new Uint8Array([1, 2, 3])], "captura.webm", { type: "audio/webm;codecs=opus" });

        const result = await extractTransactionFromAudioAction(audioForm(file));

        expect(result.success).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("http://n8n.test/webhook/extract/audio");
        expect(init.body).toBeInstanceOf(FormData);
        expect((init.body as FormData).get("userId")).toBe(SESSION_USER_ID);
        expect((init.body as FormData).get("audio")).toBeInstanceOf(File);
    });

    it("refuses an empty submission", async () => {
        const result = await extractTransactionFromAudioAction(audioForm(null));
        expect(result).toEqual({ success: false, error: expect.stringContaining("No se recibió") });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a recording past the size cap", async () => {
        const big = new File([new Uint8Array(9 * 1024 * 1024)], "captura.webm", { type: "audio/webm" });
        const result = await extractTransactionFromAudioAction(audioForm(big));
        expect(result).toEqual({ success: false, error: expect.stringContaining("demasiado larga") });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a file that is not audio", async () => {
        const wrong = new File([new Uint8Array([1])], "recibo.pdf", { type: "application/pdf" });
        const result = await extractTransactionFromAudioAction(audioForm(wrong));
        expect(result).toEqual({ success: false, error: expect.stringContaining("no soportado") });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

export class LlmError extends Error {
    status: number;
    constructor(message: string, status = 502) {
        super(message);
        this.status = status;
    }
}

// tried in order when GEMINI_MODEL is not set
const FALLBACK = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash",
    "gemini-flash-latest",
];

// GEMINI_MODEL can be one name or a comma-separated list
function modelList() {
    const fromEnv = (process.env.GEMINI_MODEL ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^models\//, ""))
        .filter(Boolean);
    return fromEnv.length ? fromEnv : FALLBACK;
}

type Result = { ok: true; text: string } | { ok: false; status: number; body: string };

async function callModel(model: string, key: string, system: string, prompt: string): Promise<Result> {
    let res: Response;
    try {
        res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: system }] },
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
                }),
                signal: AbortSignal.timeout(40_000),
            }
        );
    } catch {
        throw new LlmError("Could not reach the AI service (timeout or network). Try again.", 504);
    }

    if (!res.ok) return { ok: false, status: res.status, body: await res.text() };

    const data: any = await res.json();
    const text: string =
        data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    return { ok: true, text };
}

// Ask the model for JSON. Tries each model until one works.
export async function generateJson(system: string, prompt: string): Promise<unknown> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
        throw new LlmError("AI is not configured. Add GEMINI_API_KEY to server/.env and restart.", 503);
    }

    let lastStatus = 0;
    for (const model of modelList()) {
        const r = await callModel(model, key, system, prompt);

        if (r.ok) {
            console.log("AI answered with model:", model);
            const clean = r.text.replace(/```json|```/g, "").trim();
            try {
                return JSON.parse(clean);
            } catch {
                throw new LlmError("The AI returned an unreadable answer. Try again.", 502);
            }
        }

        lastStatus = r.status;
        console.error(`AI model "${model}" failed with status ${r.status}`);

        // a bad key will fail on every model, so stop right away
        if (r.status === 401 || /API key/i.test(r.body)) {
            throw new LlmError("The AI key was rejected. Check GEMINI_API_KEY in server/.env.", 502);
        }
        // 404, 429, 403, 5xx or 400: try the next model
    }

    if (lastStatus === 429) {
        throw new LlmError("The free AI limit was reached. Wait a minute and try again.", 429);
    }
    throw new LlmError(
        "No AI model worked. Look at the server window for the status codes, then try again later.",
        502
    );
}
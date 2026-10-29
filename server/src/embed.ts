import { db } from "./db";
import { LlmError } from "./llm";

const DIMS = 768;

// turn texts into vectors (numbers that capture meaning)
export async function embed(texts: string[], kind: "doc" | "query"): Promise<number[][]> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
        throw new LlmError("AI is not configured. Add GEMINI_API_KEY to server/.env and restart.", 503);
    }
    const model = (process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001")
        .trim()
        .replace(/^models\//, "");

    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 50) {
        const batch = texts.slice(i, i + 50);

        let res: Response;
        try {
            res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                    body: JSON.stringify({
                        requests: batch.map((t) => ({
                            model: `models/${model}`,
                            content: { parts: [{ text: t.slice(0, 6000) }] },
                            taskType: kind === "doc" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
                            outputDimensionality: DIMS,
                        })),
                    }),
                    signal: AbortSignal.timeout(30_000),
                }
            );
        } catch {
            throw new LlmError("Could not reach the AI service (timeout or network). Try again.", 504);
        }

        if (res.status === 429) {
            throw new LlmError("The free AI limit was reached. Wait a minute and try again.", 429);
        }
        if (!res.ok) {
            console.error("Embedding error:", res.status, await res.text());
            throw new LlmError(
                res.status === 404
                    ? `Embedding model "${model}" not found. Set GEMINI_EMBED_MODEL in server/.env.`
                    : "Embedding failed. Try again.",
                502
            );
        }

        const data: any = await res.json();
        for (const e of data.embeddings ?? []) out.push(e.values);
    }

    if (out.length !== texts.length || out.some((v) => v.length !== DIMS)) {
        throw new LlmError("Unexpected embedding response. Try again.", 502);
    }
    return out;
}

// pgvector wants "[0.1,0.2,...]"
export const toVector = (v: number[]) => "[" + v.join(",") + "]";

// embed anything new or edited in this workspace (lazy indexing, max 50 per kind)
export async function indexMissing(workspaceId: number) {
    const tasks = await db.query(
        `SELECT id, title, description FROM tasks
     WHERE workspace_id = $1 AND embedding IS NULL ORDER BY id LIMIT 50`,
        [workspaceId]
    );
    if (tasks.rows.length > 0) {
        const vecs = await embed(
            tasks.rows.map((t) => `${t.title}. ${t.description ?? ""}`),
            "doc"
        );
        for (let i = 0; i < tasks.rows.length; i++) {
            await db.query("UPDATE tasks SET embedding = $1::vector WHERE id = $2 AND workspace_id = $3", [
                toVector(vecs[i]),
                tasks.rows[i].id,
                workspaceId,
            ]);
        }
    }

    const meetings = await db.query(
        `SELECT id, title, summary, decisions FROM meetings
     WHERE workspace_id = $1 AND embedding IS NULL ORDER BY id LIMIT 50`,
        [workspaceId]
    );
    if (meetings.rows.length > 0) {
        const vecs = await embed(
            meetings.rows.map((m) => `${m.title}. ${m.summary}. ${(m.decisions as string[]).join(". ")}`),
            "doc"
        );
        for (let i = 0; i < meetings.rows.length; i++) {
            await db.query(
                "UPDATE meetings SET embedding = $1::vector WHERE id = $2 AND workspace_id = $3",
                [toVector(vecs[i]), meetings.rows[i].id, workspaceId]
            );
        }
    }
}
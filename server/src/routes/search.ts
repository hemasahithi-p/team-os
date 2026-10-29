import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";
import { embed, toVector, indexMissing } from "../embed";
import { LlmError } from "../llm";

const router = Router({ mergeParams: true });

router.use(requireAuth);

// results below this similarity are hidden (lower it if you get too few results)
const MIN_SIMILARITY = 0.45;

// protect the free quota: 30 searches per user per minute
const hits = new Map<number, number[]>();
function allowed(userId: number) {
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 30) {
        hits.set(userId, recent);
        return false;
    }
    recent.push(now);
    hits.set(userId, recent);
    return true;
}

// remember recent query vectors so repeated searches cost nothing
const cache = new Map<string, number[]>();

router.get("/", requireMember(), async (req: WsRequest, res) => {
    const q = z.object({ q: z.string().trim().min(2).max(200) }).safeParse(req.query);
    if (!q.success) {
        return res.status(400).json({ error: "Type at least 2 characters" });
    }
    if (!allowed(req.userId!)) {
        return res.status(429).json({ error: "Too many searches. Wait a moment." });
    }

    try {
        await indexMissing(req.workspaceId!);

        const key = q.data.q.toLowerCase();
        let vec = cache.get(key);
        if (!vec) {
            vec = (await embed([q.data.q], "query"))[0];
            cache.set(key, vec);
            if (cache.size > 200) cache.delete(cache.keys().next().value!);
        }

        // cosine distance (<=>): smaller = closer in meaning. score = 1 - distance.
        // workspace_id is ALWAYS in the filter, so tenants never see each other's data.
        const r = await db.query(
            `SELECT * FROM (
         SELECT 'task'::text AS kind, t.id, t.title, t.status AS extra, t.project_id,
                1 - (t.embedding <=> $1::vector) AS score
         FROM tasks t
         WHERE t.workspace_id = $2 AND t.embedding IS NOT NULL
         UNION ALL
         SELECT 'meeting', m.id, m.title, left(m.summary, 140), NULL::int,
                1 - (m.embedding <=> $1::vector)
         FROM meetings m
         WHERE m.workspace_id = $2 AND m.embedding IS NOT NULL
       ) x
       WHERE score >= $3
       ORDER BY score DESC
       LIMIT 8`,
            [toVector(vec), req.workspaceId, MIN_SIMILARITY]
        );
        res.json({ results: r.rows.map((row) => ({ ...row, score: Number(row.score) })) });
    } catch (e) {
        if (e instanceof LlmError) return res.status(e.status).json({ error: e.message });
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
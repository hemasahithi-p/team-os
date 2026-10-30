import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get("/", requireMember("admin"), async (req: WsRequest, res) => {
    const q = z
        .object({
            actor: z.enum(["human", "agent"]).optional(),
            before: z.coerce.number().int().optional(),
            limit: z.coerce.number().int().min(1).max(200).default(100),
        })
        .safeParse(req.query);
    if (!q.success) {
        return res.status(400).json({ error: "Invalid filter" });
    }

    const params: any[] = [req.workspaceId];
    const where = ["a.workspace_id = $1"];
    if (q.data.actor) {
        params.push(q.data.actor);
        where.push(`a.actor_type = $${params.length}`);
    }
    if (q.data.before) {
        params.push(q.data.before);
        where.push(`a.id < $${params.length}`);
    }
    params.push(q.data.limit);

    const r = await db.query(
        `SELECT a.id, a.actor_type, a.actor_id, u.name AS actor_name, a.action,
            a.payload, a.approved, a.created_at
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE ${where.join(" AND ")}
     ORDER BY a.id DESC
     LIMIT $${params.length}`,
        params
    );
    res.json(r.rows);
});

export default router;
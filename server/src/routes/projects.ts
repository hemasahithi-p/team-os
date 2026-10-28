import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";

// mergeParams lets this file see :workspaceId from the parent path
const router = Router({ mergeParams: true });

router.use(requireAuth);

const createSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
});

// create project (member or admin)
router.post("/", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const { name, description } = parsed.data;

    const result = await db.query(
        `INSERT INTO projects (workspace_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, name, description, created_at`,
        [req.workspaceId, name, description ?? null]
    );
    res.status(201).json(result.rows[0]);
});

// list projects (any member, including viewers)
router.get("/", requireMember(), async (req: WsRequest, res) => {
    const result = await db.query(
        `SELECT id, name, description, created_at
     FROM projects
     WHERE workspace_id = $1
     ORDER BY id`,
        [req.workspaceId]
    );
    res.json(result.rows);
});

export default router;
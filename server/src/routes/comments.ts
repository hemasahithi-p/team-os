import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";
import { broadcast } from "../realtime";

// mergeParams lets this file see :workspaceId and :taskId from the path
const router = Router({ mergeParams: true });

router.use(requireAuth);

const createSchema = z.object({ body: z.string().trim().min(1).max(2000) });

// check the task belongs to this workspace; returns the task id or null
async function findTask(taskId: number, workspaceId?: number) {
    if (!Number.isInteger(taskId)) return null;
    const r = await db.query(
        "SELECT id FROM tasks WHERE id = $1 AND workspace_id = $2",
        [taskId, workspaceId]
    );
    return r.rows[0]?.id ?? null;
}

// list comments, oldest first (any member, including viewers)
router.get("/", requireMember(), async (req: WsRequest, res) => {
    const taskId = Number(req.params.taskId);
    if (!(await findTask(taskId, req.workspaceId))) {
        return res.status(404).json({ error: "Task not found in this workspace" });
    }

    const result = await db.query(
        `SELECT c.id, c.task_id, c.body, c.created_at,
            c.user_id, u.name AS user_name
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1 AND c.workspace_id = $2
     ORDER BY c.id`,
        [taskId, req.workspaceId]
    );
    res.json(result.rows);
});

// add a comment (member or admin)
router.post("/", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const taskId = Number(req.params.taskId);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Comment must be 1 to 2000 characters" });
    }
    if (!(await findTask(taskId, req.workspaceId))) {
        return res.status(404).json({ error: "Task not found in this workspace" });
    }

    const result = await db.query(
        `WITH new_comment AS (
       INSERT INTO comments (workspace_id, task_id, user_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, task_id, body, created_at, user_id
     )
     SELECT n.id, n.task_id, n.body, n.created_at, n.user_id, u.name AS user_name
     FROM new_comment n JOIN users u ON u.id = n.user_id`,
        [req.workspaceId, taskId, req.userId, parsed.data.body]
    );
    broadcast(req.workspaceId!, {
        type: "comment.created",
        taskId,
        comment: result.rows[0],
        actorId: req.userId,
    });
    res.status(201).json(result.rows[0]);
});

export default router;
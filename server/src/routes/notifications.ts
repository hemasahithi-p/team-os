import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";

const router = Router({ mergeParams: true });

router.use(requireAuth);

// my latest notifications in this workspace
router.get("/", requireMember(), async (req: WsRequest, res) => {
    const items = await db.query(
        `SELECT id, task_id, type, message, is_read, created_at
     FROM notifications
     WHERE workspace_id = $1 AND user_id = $2
     ORDER BY id DESC
     LIMIT 30`,
        [req.workspaceId, req.userId]
    );
    const unread = await db.query(
        `SELECT count(*)::int AS n FROM notifications
     WHERE workspace_id = $1 AND user_id = $2 AND is_read = false`,
        [req.workspaceId, req.userId]
    );
    res.json({ unread: unread.rows[0].n, items: items.rows });
});

// mark all as read (declared before "/:id/read" so it is matched first)
router.post("/read-all", requireMember(), async (req: WsRequest, res) => {
    await db.query(
        `UPDATE notifications SET is_read = true
     WHERE workspace_id = $1 AND user_id = $2 AND is_read = false`,
        [req.workspaceId, req.userId]
    );
    res.status(204).send();
});

// mark one as read (only my own)
router.post("/:id/read", requireMember(), async (req: WsRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid id" });
    }
    await db.query(
        `UPDATE notifications SET is_read = true
     WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
        [id, req.workspaceId, req.userId]
    );
    res.status(204).send();
});

export default router;
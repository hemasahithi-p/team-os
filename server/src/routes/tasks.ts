import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";

const router = Router({ mergeParams: true });

router.use(requireAuth);

const createSchema = z.object({
    projectId: z.number().int(),
    title: z.string().min(1),
    description: z.string().optional(),
    assigneeId: z.number().int().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
});

// create task (member or admin)
router.post("/", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const { projectId, title, description, assigneeId, dueDate } = parsed.data;

    // check 1: project belongs to this workspace
    const project = await db.query(
        "SELECT id FROM projects WHERE id = $1 AND workspace_id = $2",
        [projectId, req.workspaceId]
    );
    if (project.rows.length === 0) {
        return res.status(404).json({ error: "Project not found in this workspace" });
    }

    // check 2: assignee is a member of this workspace
    if (assigneeId !== undefined) {
        const member = await db.query(
            "SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2",
            [req.workspaceId, assigneeId]
        );
        if (member.rows.length === 0) {
            return res.status(400).json({ error: "Assignee is not in this workspace" });
        }
    }

    const result = await db.query(
        `INSERT INTO tasks (workspace_id, project_id, title, description, assignee_id, due_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, project_id, title, description, status, assignee_id, due_date, created_at`,
        [req.workspaceId, projectId, title, description ?? null, assigneeId ?? null, dueDate ?? null]
    );
    res.status(201).json(result.rows[0]);
});

export default router;
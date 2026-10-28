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
const listSchema = z.object({
    projectId: z.coerce.number().int().optional(),
    status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
    assigneeId: z.coerce.number().int().optional(),
});

// list tasks with optional filters (any member, including viewers)
router.get("/", requireMember(), async (req: WsRequest, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid filter" });
    }
    const { projectId, status, assigneeId } = parsed.data;

    // always start with the workspace filter
    const conditions = ["t.workspace_id = $1"];
    const params: any[] = [req.workspaceId];

    if (projectId !== undefined) {
        params.push(projectId);
        conditions.push(`t.project_id = $${params.length}`);
    }
    if (status !== undefined) {
        params.push(status);
        conditions.push(`t.status = $${params.length}`);
    }
    if (assigneeId !== undefined) {
        params.push(assigneeId);
        conditions.push(`t.assignee_id = $${params.length}`);
    }

    const result = await db.query(
        `SELECT t.id, t.project_id, t.title, t.description, t.status,
            t.assignee_id, u.name AS assignee_name, t.due_date, t.created_at
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.id`,
        params
    );
    res.json(result.rows);
});
const updateSchema = z
    .object({
        title: z.string().min(1),
        description: z.string().nullable(),
        status: z.enum(["todo", "in_progress", "blocked", "done"]),
        assigneeId: z.number().int().nullable(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    })
    .partial()
    .refine((obj) => Object.keys(obj).length > 0, "No fields to update");

// maps request field names to database column names
const columns = {
    title: "title",
    description: "description",
    status: "status",
    assigneeId: "assignee_id",
    dueDate: "due_date",
} as const;

// update a task (member or admin)
router.patch("/:taskId", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
        return res.status(400).json({ error: "Invalid task id" });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const changes = parsed.data;

    // task must belong to this workspace
    const task = await db.query(
        "SELECT id FROM tasks WHERE id = $1 AND workspace_id = $2",
        [taskId, req.workspaceId]
    );
    if (task.rows.length === 0) {
        return res.status(404).json({ error: "Task not found in this workspace" });
    }

    // new assignee must be a member of this workspace (null = unassign is fine)
    if (changes.assigneeId !== undefined && changes.assigneeId !== null) {
        const member = await db.query(
            "SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2",
            [req.workspaceId, changes.assigneeId]
        );
        if (member.rows.length === 0) {
            return res.status(400).json({ error: "Assignee is not in this workspace" });
        }
    }

    // build: SET col1 = $1, col2 = $2 ...
    const sets: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(changes)) {
        params.push(value);
        sets.push(`${columns[key as keyof typeof columns]} = $${params.length}`);
    }
    params.push(taskId, req.workspaceId);

    const result = await db.query(
        `UPDATE tasks SET ${sets.join(", ")}
     WHERE id = $${params.length - 1} AND workspace_id = $${params.length}
     RETURNING id, project_id, title, description, status, assignee_id, due_date`,
        params
    );

    // audit trail: who changed what
    await db.query(
        `INSERT INTO audit_log (workspace_id, actor_type, actor_id, action, payload)
     VALUES ($1, 'human', $2, 'task.update', $3)`,
        [req.workspaceId, req.userId, JSON.stringify({ taskId, changes })]
    );

    res.json(result.rows[0]);
});
export default router;
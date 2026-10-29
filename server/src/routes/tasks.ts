import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";
import { broadcast } from "../realtime";
import { notify, userName } from "../notify";
import { downstreamOf } from "../risk";

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
    if (assigneeId !== undefined && assigneeId !== req.userId) {
        await notify(
            req.workspaceId!,
            assigneeId,
            "task.assigned",
            `${await userName(req.userId)} assigned you "${title}"`,
            result.rows[0].id
        );
    }
    broadcast(req.workspaceId!, { type: "tasks.changed", projectId, actorId: req.userId });
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
        "SELECT id, assignee_id FROM tasks WHERE id = $1 AND workspace_id = $2",
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
    if (changes.status === "blocked") {
        const down = await downstreamOf(req.workspaceId!, taskId);
        const perUser = new Map<number, number>();
        for (const d of down) {
            if (d.assignee_id && d.assignee_id !== req.userId) {
                perUser.set(d.assignee_id, (perUser.get(d.assignee_id) ?? 0) + 1);
            }
        }
        for (const [uid, n] of perUser) {
            await notify(
                req.workspaceId!,
                uid,
                "risk.blocked",
                `"${result.rows[0].title}" is blocked and may delay ${n} of your task${n > 1 ? "s" : ""}`,
                taskId
            );
        }
    }
    const oldAssignee = task.rows[0].assignee_id;
    if (changes.assigneeId && changes.assigneeId !== oldAssignee && changes.assigneeId !== req.userId) {
        await notify(
            req.workspaceId!,
            changes.assigneeId,
            "task.assigned",
            `${await userName(req.userId)} assigned you "${result.rows[0].title}"`,
            taskId
        );
    }
    broadcast(req.workspaceId!, {
        type: "tasks.changed",
        projectId: result.rows[0].project_id,
        actorId: req.userId,
    });

    res.json(result.rows[0]);
});
const depSchema = z.object({ dependsOnId: z.number().int() });

// add dependency: "this task depends on dependsOnId" (member or admin)
router.post("/:taskId/dependencies", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const taskId = Number(req.params.taskId);
    const parsed = depSchema.safeParse(req.body);
    if (!Number.isInteger(taskId) || !parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const { dependsOnId } = parsed.data;

    // check 1: not itself
    if (taskId === dependsOnId) {
        return res.status(400).json({ error: "A task cannot depend on itself" });
    }

    // check 2: both tasks are in this workspace
    const found = await db.query(
        "SELECT id FROM tasks WHERE workspace_id = $1 AND id = ANY($2::int[])",
        [req.workspaceId, [taskId, dependsOnId]]
    );
    if (found.rows.length !== 2) {
        return res.status(404).json({ error: "Task not found in this workspace" });
    }

    // check 3: no cycle. Does dependsOnId already (directly or indirectly) depend on taskId?
    const cycle = await db.query(
        `WITH RECURSIVE chain AS (
       SELECT depends_on_id FROM task_dependencies WHERE task_id = $1
       UNION
       SELECT d.depends_on_id FROM task_dependencies d
       JOIN chain c ON d.task_id = c.depends_on_id
     )
     SELECT 1 FROM chain WHERE depends_on_id = $2`,
        [dependsOnId, taskId]
    );
    if (cycle.rows.length > 0) {
        return res.status(409).json({ error: "This would create a circular dependency" });
    }

    try {
        await db.query(
            "INSERT INTO task_dependencies (task_id, depends_on_id) VALUES ($1, $2)",
            [taskId, dependsOnId]
        );
    } catch (e: any) {
        if (e.code === "23505") {
            return res.status(409).json({ error: "Dependency already exists" });
        }
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }

    await db.query(
        `INSERT INTO audit_log (workspace_id, actor_type, actor_id, action, payload)
     VALUES ($1, 'human', $2, 'task.dependency.add', $3)`,
        [req.workspaceId, req.userId, JSON.stringify({ taskId, dependsOnId })]
    );
    broadcast(req.workspaceId!, { type: "tasks.changed", projectId: null, actorId: req.userId });
    res.status(201).json({ taskId, dependsOnId });
});

// see a task's dependencies (any member)
router.get("/:taskId/dependencies", requireMember(), async (req: WsRequest, res) => {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
        return res.status(400).json({ error: "Invalid task id" });
    }

    const task = await db.query(
        "SELECT id FROM tasks WHERE id = $1 AND workspace_id = $2",
        [taskId, req.workspaceId]
    );
    if (task.rows.length === 0) {
        return res.status(404).json({ error: "Task not found in this workspace" });
    }

    // tasks this one is waiting on
    const waitingOn = await db.query(
        `SELECT t.id, t.title, t.status
     FROM task_dependencies d JOIN tasks t ON t.id = d.depends_on_id
     WHERE d.task_id = $1 AND t.workspace_id = $2`,
        [taskId, req.workspaceId]
    );
    // tasks waiting on this one
    const blocks = await db.query(
        `SELECT t.id, t.title, t.status
     FROM task_dependencies d JOIN tasks t ON t.id = d.task_id
     WHERE d.depends_on_id = $1 AND t.workspace_id = $2`,
        [taskId, req.workspaceId]
    );
    res.json({ waitingOn: waitingOn.rows, blocks: blocks.rows });
});

// remove a dependency (member or admin)
router.delete("/:taskId/dependencies/:dependsOnId", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const taskId = Number(req.params.taskId);
    const dependsOnId = Number(req.params.dependsOnId);
    if (!Number.isInteger(taskId) || !Number.isInteger(dependsOnId)) {
        return res.status(400).json({ error: "Invalid id" });
    }

    const result = await db.query(
        `DELETE FROM task_dependencies
     WHERE task_id = $1 AND depends_on_id = $2
       AND task_id IN (SELECT id FROM tasks WHERE workspace_id = $3)`,
        [taskId, dependsOnId, req.workspaceId]
    );
    if (result.rowCount === 0) {
        return res.status(404).json({ error: "Dependency not found" });
    }

    await db.query(
        `INSERT INTO audit_log (workspace_id, actor_type, actor_id, action, payload)
     VALUES ($1, 'human', $2, 'task.dependency.remove', $3)`,
        [req.workspaceId, req.userId, JSON.stringify({ taskId, dependsOnId })]
    );
    broadcast(req.workspaceId!, { type: "tasks.changed", projectId: null, actorId: req.userId });
    res.status(204).send();
});
export default router;
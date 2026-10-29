import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";
import { broadcast } from "../realtime";
import { notify, userName } from "../notify";

const router = Router({ mergeParams: true });

router.use(requireAuth);

// list meetings (any member, including viewers)
router.get("/", requireMember(), async (req: WsRequest, res) => {
    const r = await db.query(
        `SELECT m.id, m.title, left(m.summary, 200) AS summary, m.created_at,
            u.name AS creator_name, p.name AS project_name,
            (SELECT count(*)::int FROM tasks t WHERE t.meeting_id = m.id) AS task_count
     FROM meetings m
     JOIN users u ON u.id = m.created_by
     LEFT JOIN projects p ON p.id = m.project_id
     WHERE m.workspace_id = $1
     ORDER BY m.id DESC
     LIMIT 50`,
        [req.workspaceId]
    );
    res.json(r.rows);
});

// one meeting with its tasks
router.get("/:meetingId", requireMember(), async (req: WsRequest, res) => {
    const id = Number(req.params.meetingId);
    if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid meeting id" });
    }
    const m = await db.query(
        `SELECT m.id, m.title, m.notes, m.summary, m.decisions, m.created_at,
            u.name AS creator_name, p.name AS project_name
     FROM meetings m
     JOIN users u ON u.id = m.created_by
     LEFT JOIN projects p ON p.id = m.project_id
     WHERE m.id = $1 AND m.workspace_id = $2`,
        [id, req.workspaceId]
    );
    if (m.rows.length === 0) {
        return res.status(404).json({ error: "Meeting not found in this workspace" });
    }
    const tasks = await db.query(
        `SELECT t.id, t.title, t.status, u.name AS assignee_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.meeting_id = $1 AND t.workspace_id = $2
     ORDER BY t.id`,
        [id, req.workspaceId]
    );
    res.json({ ...m.rows[0], tasks: tasks.rows });
});

// save a reviewed meeting + its action items (the human approval step)
const saveSchema = z.object({
    title: z.string().trim().min(1).max(200),
    projectId: z.number().int(),
    notes: z.string().min(1).max(8000),
    summary: z.string().max(2000).default(""),
    decisions: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    tasks: z
        .array(
            z.object({
                title: z.string().trim().min(1).max(200),
                description: z.string().max(2000).optional(),
                dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
                assigneeId: z.number().int().nullable().optional(),
            })
        )
        .max(15)
        .default([]),
});

router.post("/", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid meeting" });
    }
    const { title, projectId, notes, summary, decisions, tasks } = parsed.data;

    const project = await db.query(
        "SELECT id FROM projects WHERE id = $1 AND workspace_id = $2",
        [projectId, req.workspaceId]
    );
    if (project.rows.length === 0) {
        return res.status(404).json({ error: "Project not found in this workspace" });
    }

    const assigneeIds = [
        ...new Set(tasks.map((t) => t.assigneeId).filter((x): x is number => typeof x === "number")),
    ];
    if (assigneeIds.length > 0) {
        const m = await db.query(
            "SELECT user_id FROM memberships WHERE workspace_id = $1 AND user_id = ANY($2::int[])",
            [req.workspaceId, assigneeIds]
        );
        if (m.rows.length !== assigneeIds.length) {
            return res.status(400).json({ error: "An assignee is not in this workspace" });
        }
    }

    const client = await db.connect();
    let meetingId = 0;
    const taskIds: number[] = [];
    try {
        await client.query("BEGIN");
        const m = await client.query(
            `INSERT INTO meetings (workspace_id, project_id, title, notes, summary, decisions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
            [req.workspaceId, projectId, title, notes, summary, JSON.stringify(decisions), req.userId]
        );
        meetingId = m.rows[0].id;

        for (const t of tasks) {
            const r = await client.query(
                `INSERT INTO tasks (workspace_id, project_id, title, description, assignee_id, due_date, meeting_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [
                    req.workspaceId,
                    projectId,
                    t.title,
                    t.description?.trim() ? t.description.trim() : null,
                    t.assigneeId ?? null,
                    t.dueDate ?? null,
                    meetingId,
                ]
            );
            taskIds.push(r.rows[0].id);
        }

        await client.query(
            `INSERT INTO audit_log (workspace_id, actor_type, actor_id, action, payload)
       VALUES ($1, 'human', $2, 'meeting.save', $3)`,
            [req.workspaceId, req.userId, JSON.stringify({ meetingId, taskIds })]
        );
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }

    broadcast(req.workspaceId!, { type: "meetings.changed", actorId: req.userId });
    if (taskIds.length > 0) {
        broadcast(req.workspaceId!, { type: "tasks.changed", projectId, actorId: req.userId });
    }

    // one notification per assignee
    const counts = new Map<number, number>();
    tasks.forEach((t) => {
        if (t.assigneeId && t.assigneeId !== req.userId) {
            counts.set(t.assigneeId, (counts.get(t.assigneeId) ?? 0) + 1);
        }
    });
    const who = await userName(req.userId);
    for (const [uid, n] of counts) {
        await notify(
            req.workspaceId!,
            uid,
            "task.assigned",
            `${who} assigned you ${n} task${n > 1 ? "s" : ""} from the meeting "${title}"`,
            null
        );
    }

    res.status(201).json({ id: meetingId, createdTasks: taskIds.length });
});

export default router;
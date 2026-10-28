import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";
import { broadcast } from "../realtime";

const router = Router({ mergeParams: true });

router.use(requireAuth);

const createSchema = z.object({
    title: z.string().trim().min(1).max(200),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    description: z.string().max(1000).optional(),
});

// list events (any member, including viewers)
router.get("/", requireMember(), async (req: WsRequest, res) => {
    const result = await db.query(
        `SELECT e.id, e.title, e.event_date, e.start_time, e.description,
            e.created_by, u.name AS creator_name
     FROM events e
     JOIN users u ON u.id = e.created_by
     WHERE e.workspace_id = $1
     ORDER BY e.event_date, e.start_time NULLS FIRST, e.id`,
        [req.workspaceId]
    );
    res.json(result.rows);
});

// create event (member or admin)
router.post("/", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const { title, eventDate, startTime, description } = parsed.data;

    const result = await db.query(
        `INSERT INTO events (workspace_id, title, event_date, start_time, description, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title, event_date, start_time, description, created_by`,
        [req.workspaceId, title, eventDate, startTime ?? null, description ?? null, req.userId]
    );
    broadcast(req.workspaceId!, { type: "events.changed", actorId: req.userId });
    res.status(201).json(result.rows[0]);
});

// delete event (the creator or an admin)
router.delete("/:eventId", requireMember("admin", "member"), async (req: WsRequest, res) => {
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId)) {
        return res.status(400).json({ error: "Invalid event id" });
    }

    const result = await db.query(
        `DELETE FROM events
     WHERE id = $1 AND workspace_id = $2
       AND ($3::text = 'admin' OR created_by = $4)
     RETURNING id`,
        [eventId, req.workspaceId, req.role, req.userId]
    );
    if (result.rowCount === 0) {
        return res.status(404).json({ error: "Event not found, or you are not allowed to delete it" });
    }
    broadcast(req.workspaceId!, { type: "events.changed", actorId: req.userId });
    res.status(204).send();
});

export default router;
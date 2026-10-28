import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";
import { broadcast, sendToUser, kickUser } from "../realtime";

const router = Router();

// every route in this file needs a logged-in user
router.use(requireAuth);

const createSchema = z.object({ name: z.string().min(1) });

// create a workspace, creator becomes admin
router.post("/", async (req: AuthRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const ws = await client.query(
            "INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name",
            [parsed.data.name]
        );
        await client.query(
            "INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')",
            [ws.rows[0].id, req.userId]
        );
        await client.query("COMMIT");
        res.status(201).json({ ...ws.rows[0], role: "admin" });
    } catch (e) {
        await client.query("ROLLBACK");
        console.error(e);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});

// list workspaces I belong to
router.get("/", async (req: AuthRequest, res) => {
    const result = await db.query(
        `SELECT w.id, w.name, m.role
     FROM workspaces w
     JOIN memberships m ON m.workspace_id = w.id
     WHERE m.user_id = $1
     ORDER BY w.id`,
        [req.userId]
    );
    res.json(result.rows);
});
// list members (any member can see)
router.get("/:workspaceId/members", requireMember(), async (req: WsRequest, res) => {
    const result = await db.query(
        `SELECT u.id, u.name, u.email, m.role
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = $1
     ORDER BY u.id`,
        [req.workspaceId]
    );
    res.json(result.rows);
});

// add a member by email (admin only)
const inviteSchema = z.object({
    email: z.string().email(),
    role: z.enum(["admin", "member", "viewer"]).default("member"),
});

router.post("/:workspaceId/members", requireMember("admin"), async (req: WsRequest, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const { email, role } = parsed.data;

    const user = await db.query("SELECT id, name, email FROM users WHERE email = $1", [
        email.toLowerCase(),
    ]);
    if (user.rows.length === 0) {
        return res.status(404).json({ error: "No user with that email. They must sign up first." });
    }

    try {
        await db.query(
            "INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)",
            [req.workspaceId, user.rows[0].id, role]
        );
        broadcast(req.workspaceId!, { type: "members.changed", actorId: req.userId });
        res.status(201).json({ ...user.rows[0], role });
    } catch (e: any) {
        if (e.code === "23505") {
            return res.status(409).json({ error: "Already a member" });
        }
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});
const roleSchema = z.object({ role: z.enum(["admin", "member", "viewer"]) });

async function adminCount(workspaceId?: number) {
    const r = await db.query(
        "SELECT count(*)::int AS n FROM memberships WHERE workspace_id = $1 AND role = 'admin'",
        [workspaceId]
    );
    return r.rows[0].n as number;
}

// change a member's role (admin only)
router.patch("/:workspaceId/members/:userId", requireMember("admin"), async (req: WsRequest, res) => {
    const targetId = Number(req.params.userId);
    const parsed = roleSchema.safeParse(req.body);
    if (!Number.isInteger(targetId) || !parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }

    const current = await db.query(
        "SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2",
        [req.workspaceId, targetId]
    );
    if (current.rows.length === 0) {
        return res.status(404).json({ error: "Member not found" });
    }
    if (
        current.rows[0].role === "admin" &&
        parsed.data.role !== "admin" &&
        (await adminCount(req.workspaceId)) <= 1
    ) {
        return res.status(409).json({ error: "A workspace needs at least one admin" });
    }

    await db.query(
        "UPDATE memberships SET role = $1 WHERE workspace_id = $2 AND user_id = $3",
        [parsed.data.role, req.workspaceId, targetId]
    );
    await db.query(
        `INSERT INTO audit_log (workspace_id, actor_type, actor_id, action, payload)
     VALUES ($1, 'human', $2, 'member.role', $3)`,
        [req.workspaceId, req.userId, JSON.stringify({ targetId, role: parsed.data.role })]
    );
    broadcast(req.workspaceId!, { type: "members.changed", actorId: req.userId });
    res.json({ userId: targetId, role: parsed.data.role });
});

// remove a member (admin only); their tasks become unassigned
router.delete("/:workspaceId/members/:userId", requireMember("admin"), async (req: WsRequest, res) => {
    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId)) {
        return res.status(400).json({ error: "Invalid user id" });
    }

    const current = await db.query(
        "SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2",
        [req.workspaceId, targetId]
    );
    if (current.rows.length === 0) {
        return res.status(404).json({ error: "Member not found" });
    }
    if (current.rows[0].role === "admin" && (await adminCount(req.workspaceId)) <= 1) {
        return res.status(409).json({ error: "A workspace needs at least one admin" });
    }

    // one statement: unassign their tasks AND delete the membership
    await db.query(
        `WITH unassign AS (
       UPDATE tasks SET assignee_id = NULL
       WHERE workspace_id = $1 AND assignee_id = $2
     )
     DELETE FROM memberships WHERE workspace_id = $1 AND user_id = $2`,
        [req.workspaceId, targetId]
    );
    await db.query(
        `INSERT INTO audit_log (workspace_id, actor_type, actor_id, action, payload)
     VALUES ($1, 'human', $2, 'member.remove', $3)`,
        [req.workspaceId, req.userId, JSON.stringify({ targetId })]
    );

    // tell the removed person, then cut their live connection
    sendToUser(req.workspaceId!, targetId, { type: "removed", workspaceId: req.workspaceId });
    kickUser(req.workspaceId!, targetId);

    broadcast(req.workspaceId!, { type: "members.changed", actorId: req.userId });
    broadcast(req.workspaceId!, { type: "tasks.changed", projectId: null, actorId: req.userId });
    res.status(204).send();
});
export default router;
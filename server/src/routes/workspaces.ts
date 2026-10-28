import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";

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
        res.status(201).json({ ...user.rows[0], role });
    } catch (e: any) {
        if (e.code === "23505") {
            return res.status(409).json({ error: "Already a member" });
        }
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});
export default router;
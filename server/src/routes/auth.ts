import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const signupSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
});

router.post("/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const { name, email, password } = parsed.data;

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await db.query(
            "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
            [name, email.toLowerCase(), hash]
        );
        res.status(201).json(result.rows[0]);
    } catch (e: any) {
        if (e.code === "23505") {
            return res.status(409).json({ error: "Email already registered" });
        }
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const { email, password } = parsed.data;

    try {
        const result = await db.query(
            "SELECT id, name, email, password_hash FROM users WHERE email = $1",
            [email.toLowerCase()]
        );
        const user = result.rows[0];

        // same message for wrong email or wrong password, so attackers can't tell which
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
            expiresIn: "7d",
        });

        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email },
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
    const result = await db.query(
        "SELECT id, name, email FROM users WHERE id = $1",
        [req.userId]
    );
    res.json(result.rows[0]);
});
export default router;
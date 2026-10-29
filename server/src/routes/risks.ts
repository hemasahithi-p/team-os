import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireMember, WsRequest } from "../middleware/workspace";
import { loadRisks, todayStr } from "../risk";

const router = Router({ mergeParams: true });

router.use(requireAuth);

// risk status of every task (any member, including viewers)
router.get("/", requireMember(), async (req: WsRequest, res) => {
    const q = z.object({ projectId: z.coerce.number().int().optional() }).safeParse(req.query);
    if (!q.success) {
        return res.status(400).json({ error: "Invalid filter" });
    }
    const data = await loadRisks(req.workspaceId!, q.data.projectId);
    res.json({ today: todayStr(), ...data });
});

export default router;
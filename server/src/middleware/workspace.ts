import { Response, NextFunction } from "express";
import { db } from "../db";
import { AuthRequest } from "./auth";

export interface WsRequest extends AuthRequest {
    workspaceId?: number;
    role?: string;
}

// usage: requireMember()  -> any member
//        requireMember("admin") -> admins only
export function requireMember(...allowed: string[]) {
    return async (req: WsRequest, res: Response, next: NextFunction) => {
        const workspaceId = Number(req.params.workspaceId);
        if (!Number.isInteger(workspaceId)) {
            return res.status(400).json({ error: "Invalid workspace id" });
        }

        const result = await db.query(
            "SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2",
            [workspaceId, req.userId]
        );
        const membership = result.rows[0];

        if (!membership) {
            return res.status(403).json({ error: "Not a member of this workspace" });
        }
        if (allowed.length > 0 && !allowed.includes(membership.role)) {
            return res.status(403).json({ error: "Insufficient role" });
        }

        req.workspaceId = workspaceId;
        req.role = membership.role;
        next();
    };
}
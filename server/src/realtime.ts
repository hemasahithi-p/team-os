import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { db } from "./db";

// workspaceId -> sockets currently listening to that workspace
const rooms = new Map<number, Set<WebSocket>>();

export function initRealtime(server: Server) {
    const wss = new WebSocketServer({ server, path: "/ws" });

    wss.on("connection", (socket, req) => {
        // 1. who is connecting? the token comes in the URL: /ws?token=...
        const url = new URL(req.url ?? "", "http://localhost");
        let userId: number;
        try {
            const payload = jwt.verify(
                url.searchParams.get("token") ?? "",
                process.env.JWT_SECRET!
            ) as { userId: number };
            userId = payload.userId;
        } catch {
            socket.close(4001, "Unauthorized");
            return;
        }

        const joined = new Set<number>();

        // 2. the client asks to join a workspace room
        socket.on("message", async (raw) => {
            let msg: any;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                return;
            }

            if (msg.type === "subscribe" && Number.isInteger(msg.workspaceId)) {
                // only members may join
                const m = await db.query(
                    "SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2",
                    [msg.workspaceId, userId]
                );
                if (m.rows.length === 0) {
                    socket.send(JSON.stringify({ type: "error", error: "Not a member" }));
                    return;
                }
                if (!rooms.has(msg.workspaceId)) rooms.set(msg.workspaceId, new Set());
                rooms.get(msg.workspaceId)!.add(socket);
                joined.add(msg.workspaceId);
                socket.send(JSON.stringify({ type: "subscribed", workspaceId: msg.workspaceId }));
            }
        });

        // 3. clean up when the tab closes
        socket.on("close", () => {
            joined.forEach((id) => rooms.get(id)?.delete(socket));
        });
    });
}

// tell everyone in a workspace that something happened
export function broadcast(workspaceId: number, event: { type: string;[key: string]: unknown }) {
    const message = JSON.stringify(event);
    rooms.get(workspaceId)?.forEach((s) => {
        if (s.readyState === WebSocket.OPEN) s.send(message);
    });
}
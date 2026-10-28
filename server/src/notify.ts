import { db } from "./db";
import { sendToUser } from "./realtime";

export async function userName(id?: number) {
    const r = await db.query("SELECT name FROM users WHERE id = $1", [id]);
    return r.rows[0]?.name ?? "Someone";
}

// save a notification, then push it live to that user
export async function notify(
    workspaceId: number,
    userId: number,
    type: string,
    message: string,
    taskId: number | null
) {
    const r = await db.query(
        `INSERT INTO notifications (workspace_id, user_id, task_id, type, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, workspace_id, task_id, type, message, is_read, created_at`,
        [workspaceId, userId, taskId, type, message]
    );
    sendToUser(workspaceId, userId, { type: "notification.created", notification: r.rows[0] });
}
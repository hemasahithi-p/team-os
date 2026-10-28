import { useEffect, useState } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";

type Notice = {
    id: number;
    task_id: number | null;
    type: string;
    message: string;
    is_read: boolean;
    created_at: string;
};

export default function Bell({ workspaceId }: { workspaceId: number | null }) {
    const [items, setItems] = useState<Notice[]>([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);

    async function load() {
        if (workspaceId === null) return;
        try {
            const d = await api<{ unread: number; items: Notice[] }>(
                `/workspaces/${workspaceId}/notifications`
            );
            setItems(d.items);
            setUnread(d.unread);
        } catch {
            /* ignore */
        }
    }

    // reload when the workspace changes
    useEffect(() => {
        setItems([]);
        setUnread(0);
        setOpen(false);
        load();
    }, [workspaceId]);

    // live: new notification pushed, or reconnect
    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "subscribed" || ev.type === "notification.created") load();
        });
    }, [workspaceId]);

    async function markRead(n: Notice) {
        if (n.is_read || workspaceId === null) return;
        setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
        setUnread((c) => Math.max(0, c - 1));
        try {
            await api(`/workspaces/${workspaceId}/notifications/${n.id}/read`, { method: "POST" });
        } catch {
            load();
        }
    }

    async function markAll() {
        if (workspaceId === null) return;
        setItems((list) => list.map((x) => ({ ...x, is_read: true })));
        setUnread(0);
        try {
            await api(`/workspaces/${workspaceId}/notifications/read-all`, { method: "POST" });
        } catch {
            load();
        }
    }

    return (
        <div className="bell-wrap">
            <button className="icon-btn bell-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
                🔔
                {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
            </button>

            {open && (
                <>
                    <div className="bell-overlay" onClick={() => setOpen(false)} />
                    <div className="bell-menu">
                        <div className="bell-head">
                            <strong>Notifications</strong>
                            {unread > 0 && (
                                <button className="link-btn" onClick={markAll}>
                                    Mark all read
                                </button>
                            )}
                        </div>

                        <div className="bell-list">
                            {items.map((n) => (
                                <div
                                    key={n.id}
                                    className={"notice" + (n.is_read ? "" : " unread")}
                                    onClick={() => markRead(n)}
                                >
                                    <div>{n.message}</div>
                                    <div className="notice-time">
                                        {new Date(n.created_at).toLocaleString([], {
                                            day: "numeric",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </div>
                                </div>
                            ))}
                            {items.length === 0 && <div className="col-empty">You're all caught up</div>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
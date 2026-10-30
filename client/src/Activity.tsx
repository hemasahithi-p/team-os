import { useEffect, useState } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";

type Entry = {
    id: number;
    actor_type: "human" | "agent";
    actor_name: string | null;
    action: string;
    payload: Record<string, unknown> | null;
    approved: boolean | null;
    created_at: string;
};

const LABEL: Record<string, string> = {
    "task.update": "Updated a task",
    "task.dependency.add": "Added a dependency",
    "task.dependency.remove": "Removed a dependency",
    "member.role": "Changed a member's role",
    "member.remove": "Removed a member",
    "ai.plan.generate": "AI drafted a plan",
    "ai.plan.apply": "Approved an AI plan",
    "ai.risk.summary": "AI wrote a risk report",
    "ai.meeting.extract": "AI read meeting notes",
    "meeting.save": "Saved a meeting",
    "agent.suggest": "Agent proposed actions",
    "agent.approve": "Approved an agent action",
    "agent.reject": "Rejected an agent action",
    "agent.stale": "Agent action went stale",
};

function details(p: Entry["payload"]) {
    if (!p) return "";
    const text = Object.entries(p)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(" · ");
    return text.length > 170 ? text.slice(0, 170) + "..." : text;
}

export default function Activity({ workspaceId }: { workspaceId: number }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [actor, setActor] = useState<"all" | "human" | "agent">("all");
    const [more, setMore] = useState(true);
    const [error, setError] = useState("");

    const base = `/workspaces/${workspaceId}/audit?limit=50${actor === "all" ? "" : "&actor=" + actor}`;

    async function load() {
        try {
            const rows = await api<Entry[]>(base);
            setEntries(rows);
            setMore(rows.length === 50);
            setError("");
        } catch (e: any) {
            setError(e.message);
        }
    }

    async function loadMore() {
        const last = entries[entries.length - 1];
        if (!last) return;
        try {
            const rows = await api<Entry[]>(`${base}&before=${last.id}`);
            setEntries((l) => [...l, ...rows]);
            setMore(rows.length === 50);
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        setEntries([]);
        load();
    }, [workspaceId, actor]);

    // new activity appears by itself
    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "tasks.changed" || ev.type === "agent.changed" || ev.type === "members.changed") {
                load();
            }
        });
    }, [workspaceId, actor]);

    return (
        <div>
            <div className="tabs" style={{ marginBottom: 12 }}>
                {(["all", "human", "agent"] as const).map((a) => (
                    <button key={a} className={"tab" + (actor === a ? " active" : "")} onClick={() => setActor(a)}>
                        {a === "all" ? "Everyone" : a === "human" ? "👤 Humans" : "🤖 Agent"}
                    </button>
                ))}
            </div>

            {error && <div className="error">{error}</div>}

            <div className="members">
                {entries.map((e) => (
                    <div className="member-row" key={e.id}>
                        <span>{e.actor_type === "agent" ? "🤖" : "👤"}</span>
                        <div className="member-info">
                            <div>
                                <strong>{e.actor_type === "agent" ? "Agent" : e.actor_name ?? "Someone"}</strong>{" "}
                                {LABEL[e.action] ?? e.action}
                                {e.approved === true && <span className="chip status-approved" style={{ marginLeft: 8 }}>approved</span>}
                                {e.approved === false && <span className="chip status-rejected" style={{ marginLeft: 8 }}>not applied</span>}
                            </div>
                            <div className="member-email">{details(e.payload)}</div>
                        </div>
                        <span className="comment-time">
                            {new Date(e.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                    </div>
                ))}
                {entries.length === 0 && !error && <div className="col-empty">No activity yet.</div>}
            </div>

            {more && entries.length > 0 && (
                <button className="btn" style={{ marginTop: 12 }} onClick={loadMore}>
                    Load more
                </button>
            )}
        </div>
    );
}
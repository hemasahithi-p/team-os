import { useEffect, useState } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";

type Action = {
    id: number;
    kind: "reschedule_task" | "reassign_task" | "nudge_owner";
    payload: any;
    reason: string;
    status: "pending" | "approved" | "rejected" | "stale";
    note: string | null;
    created_at: string;
    decided_at: string | null;
    task_id: number;
    task_title: string;
    requester_name: string | null;
    decider_name: string | null;
};

function describe(a: Action) {
    const p = a.payload;
    if (a.kind === "reschedule_task") {
        return `📅 Move "${a.task_title}" from ${p.from ?? "no date"} to ${p.to}`;
    }
    if (a.kind === "reassign_task") {
        return `👤 Reassign "${a.task_title}" from ${p.fromName ?? "nobody"} to ${p.toName}`;
    }
    return `🔔 Nudge ${p.owner ?? "the owner"} about "${a.task_title}": "${p.message}"`;
}

export default function Agent({
    workspaceId,
    isAdmin,
    canEdit,
}: {
    workspaceId: number;
    isAdmin: boolean;
    canEdit: boolean;
}) {
    const [actions, setActions] = useState<Action[]>([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");

    async function load() {
        try {
            setActions(await api<Action[]>(`/workspaces/${workspaceId}/agent/actions`));
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        setActions([]);
        setInfo("");
        load();
    }, [workspaceId]);

    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "subscribed" || ev.type === "agent.changed") load();
        });
    }, [workspaceId]);

    async function suggest() {
        setLoading(true);
        setError("");
        setInfo("");
        try {
            const r = await api<{ message: string }>(`/workspaces/${workspaceId}/agent/suggest`, {
                method: "POST",
            });
            setInfo(r.message);
            await load();
        } catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }

    async function decide(id: number, verb: "approve" | "reject") {
        setBusyId(id);
        setError("");
        try {
            await api(`/workspaces/${workspaceId}/agent/actions/${id}/${verb}`, { method: "POST" });
        } catch (e: any) {
            setError(e.message);
        }
        await load();
        setBusyId(null);
    }

    const pending = actions.filter((a) => a.status === "pending");
    const history = actions.filter((a) => a.status !== "pending");

    return (
        <div>
            <div className="agent-banner">
                🤖 The agent only <strong>proposes</strong>. Nothing changes until an admin approves, and
                every decision is written to the activity log.
            </div>

            <div className="board-bar">
                <span className="risk-counts">{pending.length} waiting for approval</span>
                {canEdit && (
                    <button className="btn btn-primary" onClick={suggest} disabled={loading}>
                        {loading ? "Thinking..." : "🤖 Suggest actions"}
                    </button>
                )}
            </div>

            {info && <div className="ai-box">{info}</div>}
            {error && <div className="error">{error}</div>}

            {pending.map((a) => (
                <div className="action-card" key={a.id}>
                    <div className="action-title">{describe(a)}</div>
                    {a.reason && <div className="plan-desc">Why: {a.reason}</div>}
                    <div className="action-foot">
                        <span className="member-email">
                            proposed by agent for {a.requester_name ?? "a teammate"} ·{" "}
                            {new Date(a.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {isAdmin ? (
                            <span className="action-buttons">
                                <button className="btn" onClick={() => decide(a.id, "reject")} disabled={busyId === a.id}>
                                    Reject
                                </button>
                                <button className="btn btn-primary" onClick={() => decide(a.id, "approve")} disabled={busyId === a.id}>
                                    Approve
                                </button>
                            </span>
                        ) : (
                            <span className="chip">Waiting for an admin</span>
                        )}
                    </div>
                </div>
            ))}
            {pending.length === 0 && <div className="col-empty">No suggestions waiting. Click "Suggest actions".</div>}

            {history.length > 0 && (
                <>
                    <div className="panel-section-title" style={{ marginTop: 24 }}>History</div>
                    <div className="members">
                        {history.map((a) => (
                            <div className="member-row" key={a.id}>
                                <div className="member-info">
                                    <div>{describe(a)}</div>
                                    <div className="member-email">
                                        {a.decider_name ? `by ${a.decider_name}` : ""}
                                        {a.note ? ` · ${a.note}` : ""}
                                    </div>
                                </div>
                                <span className={"chip status-" + a.status}>{a.status}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
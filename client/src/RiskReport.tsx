import { useEffect, useState } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";
import RiskBadge from "./RiskBadge";
import { reasonText } from "./risk";
import type { RiskItem } from "./risk";

type Summary = {
    headline: string;
    slipping: { taskId: number; text: string }[];
    actions: string[];
};

export default function RiskReport({
    workspaceId,
    projectId,
    canUseAi,
    onClose,
}: {
    workspaceId: number;
    projectId: number;
    canUseAi: boolean;
    onClose: () => void;
}) {
    const [items, setItems] = useState<RiskItem[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function load() {
        try {
            const d = await api<{ items: RiskItem[] }>(
                `/workspaces/${workspaceId}/risks?projectId=${projectId}`
            );
            setItems(d.items);
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        load();
    }, [workspaceId, projectId]);

    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "tasks.changed") load();
        });
    }, [workspaceId, projectId]);

    const rank = (i: RiskItem) => (i.own === "blocked" ? 0 : i.own === "overdue" ? 1 : 2);
    const problems = items
        .filter((i) => i.status !== "done" && (i.own || i.reasons.length > 0))
        .sort((a, b) => rank(a) - rank(b) || b.downstream - a.downstream);

    const titleOf = (id: number) => items.find((i) => i.id === id)?.title ?? `Task ${id}`;

    async function explain() {
        setLoading(true);
        setError("");
        try {
            setSummary(
                await api<Summary>(`/workspaces/${workspaceId}/ai/risk-summary`, {
                    method: "POST",
                    body: { projectId },
                })
            );
        } catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }

    return (
        <>
            <div className="overlay" onClick={onClose} />
            <div className="modal">
                <div className="panel-head">
                    <h2>🧠 Risk report</h2>
                    <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {summary && (
                    <div className="ai-box">
                        <div className="ai-headline">{summary.headline}</div>
                        {summary.slipping.length > 0 && (
                            <ul>
                                {summary.slipping.map((s) => (
                                    <li key={s.taskId}>
                                        <strong>{titleOf(s.taskId)}:</strong> {s.text}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {summary.actions.length > 0 && (
                            <>
                                <div className="ai-sub">Suggested next steps</div>
                                <ul>
                                    {summary.actions.map((a, i) => (
                                        <li key={i}>{a}</li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}

                <div className="plan-list">
                    {problems.map((p) => (
                        <div className="plan-row" key={p.id}>
                            <div className="plan-top">
                                <strong style={{ flex: 1 }}>{p.title}</strong>
                                <RiskBadge r={p} />
                            </div>
                            <div className="plan-desc">
                                {p.assignee_name ?? "Unassigned"}
                                {p.due_date ? ` · due ${p.due_date}` : ""}
                            </div>
                            {p.reasons.length > 0 && (
                                <div className="plan-needs">because: {p.reasons.map(reasonText).join("; ")}</div>
                            )}
                        </div>
                    ))}
                    {problems.length === 0 && <div className="col-empty">✅ No risks detected in this project.</div>}
                </div>

                {error && <div className="error">{error}</div>}
                <div className="modal-foot">
                    <button className="btn" onClick={onClose}>Close</button>
                    {canUseAi && (
                        <button className="btn btn-primary" onClick={explain} disabled={loading}>
                            {loading ? "Thinking..." : "✨ Explain with AI"}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
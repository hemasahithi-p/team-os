import { useState } from "react";
import { api } from "./api";

type Person = { id: number; name: string };

type Draft = {
    ref: string;
    title: string;
    description: string;
    dueDate: string | null;
    assigneeId: number | null;
    dependsOn: string[];
};

export default function AiPlan({
    workspaceId,
    projectId,
    members,
    onClose,
    onApplied,
}: {
    workspaceId: number;
    projectId: number;
    members: Person[];
    onClose: () => void;
    onApplied: () => void;
}) {
    const [brief, setBrief] = useState("");
    const [drafts, setDrafts] = useState<Draft[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function generate() {
        if (brief.trim().length < 20) {
            setError("Write a little more: at least 20 characters.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const data = await api<{ tasks: Omit<Draft, "assigneeId">[] }>(
                `/workspaces/${workspaceId}/ai/plan`,
                { method: "POST", body: { projectId, brief: brief.trim() } }
            );
            setDrafts(data.tasks.map((t) => ({ ...t, assigneeId: null })));
        } catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }

    function update(ref: string, patch: Partial<Draft>) {
        setDrafts((list) => list && list.map((t) => (t.ref === ref ? { ...t, ...patch } : t)));
    }

    // deleting a task also removes it from other tasks' "needs" lists
    function remove(ref: string) {
        setDrafts(
            (list) =>
                list &&
                list
                    .filter((t) => t.ref !== ref)
                    .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((r) => r !== ref) }))
        );
    }

    async function apply() {
        if (!drafts) return;
        setSaving(true);
        setError("");
        try {
            await api(`/workspaces/${workspaceId}/ai/plan/apply`, {
                method: "POST",
                body: {
                    projectId,
                    tasks: drafts.map((t) => ({
                        ref: t.ref,
                        title: t.title.trim(),
                        description: t.description.trim() || undefined,
                        dueDate: t.dueDate || null,
                        assigneeId: t.assigneeId,
                        dependsOn: t.dependsOn,
                    })),
                },
            });
            onApplied();
        } catch (e: any) {
            setError(e.message);
        }
        setSaving(false);
    }

    const titleOf = (ref: string) => drafts?.find((t) => t.ref === ref)?.title ?? ref;
    const canApply = !!drafts && drafts.length > 0 && drafts.every((t) => t.title.trim());

    return (
        <>
            <div className="overlay" onClick={onClose} />
            <div className="modal">
                <div className="panel-head">
                    <h2>✨ AI plan</h2>
                    <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {!drafts ? (
                    <>
                        <p className="ai-note">
                            Paste a messy brief. The AI drafts tasks, dates and dependencies, and you review before
                            anything is saved. Use demo data only.
                        </p>
                        <textarea
                            className="input"
                            placeholder="Example: We launch a student expense-tracker app in 3 weeks. Need signup and login, a dashboard with monthly spending charts, CSV export, and a landing page. QA and a beta test with 20 students must happen before launch..."
                            value={brief}
                            onChange={(e) => setBrief(e.target.value)}
                            maxLength={4000}
                        />
                        {error && <div className="error">{error}</div>}
                        <div className="modal-foot">
                            <button className="btn" onClick={onClose}>Cancel</button>
                            <button className="btn btn-primary" onClick={generate} disabled={loading}>
                                {loading ? "Thinking..." : "Generate plan"}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="ai-note">
                            Review the draft. Edit, assign, or delete tasks. Nothing is saved until you click Create.
                        </p>
                        <div className="plan-list">
                            {drafts.map((t) => (
                                <div className="plan-row" key={t.ref}>
                                    <div className="plan-top">
                                        <input
                                            className="input"
                                            style={{ flex: 1 }}
                                            value={t.title}
                                            onChange={(e) => update(t.ref, { title: e.target.value })}
                                        />
                                        <button className="icon-btn" onClick={() => remove(t.ref)} aria-label="Delete task">
                                            🗑
                                        </button>
                                    </div>
                                    {t.description && <div className="plan-desc">{t.description}</div>}
                                    <div className="plan-meta">
                                        <input
                                            className="input"
                                            type="date"
                                            value={t.dueDate ?? ""}
                                            onChange={(e) => update(t.ref, { dueDate: e.target.value || null })}
                                        />
                                        <select
                                            className="input"
                                            value={t.assigneeId ?? ""}
                                            onChange={(e) =>
                                                update(t.ref, { assigneeId: e.target.value ? Number(e.target.value) : null })
                                            }
                                        >
                                            <option value="">Unassigned</option>
                                            {members.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {t.dependsOn.length > 0 && (
                                        <div className="plan-needs">⛓ after: {t.dependsOn.map(titleOf).join(", ")}</div>
                                    )}
                                </div>
                            ))}
                            {drafts.length === 0 && <div className="col-empty">All tasks removed.</div>}
                        </div>

                        {error && <div className="error">{error}</div>}
                        <div className="modal-foot">
                            <button className="btn" onClick={() => setDrafts(null)}>Back</button>
                            <button className="btn btn-primary" onClick={apply} disabled={!canApply || saving}>
                                {saving ? "Saving..." : `Create ${drafts.length} task${drafts.length === 1 ? "" : "s"}`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
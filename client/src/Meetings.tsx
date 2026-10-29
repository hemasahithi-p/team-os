import { useEffect, useState } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";

type Person = { id: number; name: string };
type Project = { id: number; name: string };

type MeetingRow = {
    id: number;
    title: string;
    summary: string;
    created_at: string;
    creator_name: string;
    project_name: string | null;
    task_count: number;
};

type MeetingDetail = {
    id: number;
    title: string;
    notes: string;
    summary: string;
    decisions: string[];
    created_at: string;
    creator_name: string;
    project_name: string | null;
    tasks: { id: number; title: string; status: string; assignee_name: string | null }[];
};

type Draft = {
    title: string;
    description: string;
    owner: string | null;
    assigneeId: number | null;
    dueDate: string | null;
};

export default function Meetings({
    workspaceId,
    canEdit,
    focus,
    onFocusDone,
}: {
    workspaceId: number;
    canEdit: boolean;
    focus: { id: number; n: number } | null;
    onFocusDone: () => void;
}) {
    const [meetings, setMeetings] = useState<MeetingRow[]>([]);
    const [detail, setDetail] = useState<MeetingDetail | null>(null);
    const [members, setMembers] = useState<Person[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");

    // new meeting form
    const [title, setTitle] = useState("");
    const [projectId, setProjectId] = useState("");
    const [notes, setNotes] = useState("");
    const [summary, setSummary] = useState("");
    const [decisions, setDecisions] = useState<string[]>([]);
    const [drafts, setDrafts] = useState<Draft[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState("");

    async function loadList() {
        try {
            setMeetings(await api<MeetingRow[]>(`/workspaces/${workspaceId}/meetings`));
            setError("");
        } catch (e: any) {
            setError(e.message);
        }
    }

    async function openMeeting(id: number) {
        try {
            setDetail(await api<MeetingDetail>(`/workspaces/${workspaceId}/meetings/${id}`));
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        setMeetings([]);
        setDetail(null);
        loadList();
        api<Person[]>(`/workspaces/${workspaceId}/members`).then(setMembers).catch(() => { });
        api<Project[]>(`/workspaces/${workspaceId}/projects`)
            .then((p) => {
                setProjects(p);
                setProjectId(p[0] ? String(p[0].id) : "");
            })
            .catch(() => { });
    }, [workspaceId]);

    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "subscribed" || ev.type === "meetings.changed") loadList();
        });
    }, [workspaceId]);

    // opened from the search bar
    useEffect(() => {
        if (focus) {
            openMeeting(focus.id);
            onFocusDone();
        }
    }, [focus]);

    function resetForm() {
        setTitle("");
        setNotes("");
        setSummary("");
        setDecisions([]);
        setDrafts(null);
        setFormError("");
    }

    async function extract() {
        if (!title.trim() || notes.trim().length < 40) {
            setFormError("Add a title and at least 40 characters of notes.");
            return;
        }
        setBusy(true);
        setFormError("");
        try {
            const d = await api<{
                summary: string;
                decisions: string[];
                tasks: Draft[];
            }>(`/workspaces/${workspaceId}/ai/meeting-extract`, {
                method: "POST",
                body: { notes: notes.trim() },
            });
            setSummary(d.summary);
            setDecisions(d.decisions);
            setDrafts(d.tasks);
        } catch (e: any) {
            setFormError(e.message);
        }
        setBusy(false);
    }

    function updateDraft(i: number, patch: Partial<Draft>) {
        setDrafts((list) => list && list.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
    }

    async function save() {
        if (!drafts) return;
        setBusy(true);
        setFormError("");
        try {
            await api(`/workspaces/${workspaceId}/meetings`, {
                method: "POST",
                body: {
                    title: title.trim(),
                    projectId: Number(projectId),
                    notes: notes.trim(),
                    summary: summary.trim(),
                    decisions: decisions.map((d) => d.trim()).filter(Boolean),
                    tasks: drafts.map((t) => ({
                        title: t.title.trim(),
                        description: t.description.trim() || undefined,
                        dueDate: t.dueDate || null,
                        assigneeId: t.assigneeId,
                    })),
                },
            });
            setCreating(false);
            resetForm();
            await loadList();
        } catch (e: any) {
            setFormError(e.message);
        }
        setBusy(false);
    }

    const canSave = !!drafts && !!projectId && drafts.every((t) => t.title.trim());

    return (
        <div>
            <div className="board-bar">
                <span className="risk-counts">{meetings.length} meeting{meetings.length === 1 ? "" : "s"}</span>
                {canEdit && (
                    <button className="btn btn-primary" onClick={() => setCreating(true)}>
                        ✨ New meeting
                    </button>
                )}
            </div>

            {error && <div className="error">{error}</div>}

            <div className="members">
                {meetings.map((m) => (
                    <div className="member-row meeting-row" key={m.id} onClick={() => openMeeting(m.id)}>
                        <div className="member-info">
                            <strong>{m.title}</strong>
                            <div className="member-email">
                                {new Date(m.created_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
                                {" · "}
                                {m.creator_name}
                                {m.project_name ? ` · ${m.project_name}` : ""}
                            </div>
                            {m.summary && <div className="plan-desc">{m.summary}</div>}
                        </div>
                        <span className="chip">{m.task_count} task{m.task_count === 1 ? "" : "s"}</span>
                    </div>
                ))}
                {meetings.length === 0 && <div className="col-empty">No meetings yet. Paste your first notes.</div>}
            </div>

            {/* meeting detail */}
            {detail && (
                <>
                    <div className="overlay" onClick={() => setDetail(null)} />
                    <aside className="panel">
                        <div className="panel-head">
                            <h2>{detail.title}</h2>
                            <button className="icon-btn" onClick={() => setDetail(null)} aria-label="Close">✕</button>
                        </div>
                        <div className="member-email" style={{ margin: "6px 0 12px" }}>
                            {new Date(detail.created_at).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}
                            {" · "}
                            {detail.creator_name}
                            {detail.project_name ? ` · ${detail.project_name}` : ""}
                        </div>
                        <div className="thread">
                            <div className="panel-section-title">Summary</div>
                            <div>{detail.summary || "No summary."}</div>

                            <div className="panel-section-title">Decisions</div>
                            {detail.decisions.length === 0 && <div className="side-empty">None recorded.</div>}
                            <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                                {detail.decisions.map((d, i) => (
                                    <li key={i}>{d}</li>
                                ))}
                            </ul>

                            <div className="panel-section-title">Action items</div>
                            {detail.tasks.length === 0 && <div className="side-empty">No tasks were created.</div>}
                            {detail.tasks.map((t) => (
                                <div className="dep-row" key={t.id}>
                                    <span className={"dot " + t.status} />
                                    <span className="dep-title">{t.title}</span>
                                    <span className="chip">{t.assignee_name ?? "Unassigned"}</span>
                                </div>
                            ))}

                            <details style={{ marginTop: 14 }}>
                                <summary>Original notes</summary>
                                <div className="comment-text" style={{ marginTop: 8 }}>{detail.notes}</div>
                            </details>
                        </div>
                    </aside>
                </>
            )}

            {/* new meeting */}
            {creating && (
                <>
                    <div className="overlay" onClick={() => setCreating(false)} />
                    <div className="modal">
                        <div className="panel-head">
                            <h2>✨ New meeting</h2>
                            <button className="icon-btn" onClick={() => setCreating(false)} aria-label="Close">✕</button>
                        </div>

                        {!drafts ? (
                            <>
                                <p className="ai-note">
                                    Paste raw notes or a transcript. The AI drafts a summary, decisions and action items,
                                    and you review before anything is saved. Use demo data only.
                                </p>
                                <div className="plan-meta">
                                    <input
                                        className="input"
                                        style={{ flex: 1 }}
                                        placeholder="Meeting title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                    <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                                        {projects.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                Tasks go to: {p.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <textarea
                                    className="input"
                                    placeholder="Paste the meeting notes here..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    maxLength={8000}
                                />
                                {formError && <div className="error">{formError}</div>}
                                <div className="modal-foot">
                                    <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
                                    <button className="btn btn-primary" onClick={extract} disabled={busy}>
                                        {busy ? "Thinking..." : "Extract"}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="ai-note">Review and edit. Nothing is saved until you click Save.</p>
                                <div className="plan-list">
                                    <div className="plan-row">
                                        <div className="dep-label">Summary</div>
                                        <textarea
                                            className="input"
                                            style={{ height: 80 }}
                                            value={summary}
                                            onChange={(e) => setSummary(e.target.value)}
                                        />
                                    </div>

                                    <div className="plan-row">
                                        <div className="dep-label">Decisions</div>
                                        {decisions.map((d, i) => (
                                            <div className="plan-top" key={i} style={{ marginBottom: 6 }}>
                                                <input
                                                    className="input"
                                                    style={{ flex: 1 }}
                                                    value={d}
                                                    onChange={(e) =>
                                                        setDecisions((l) => l.map((x, idx) => (idx === i ? e.target.value : x)))
                                                    }
                                                />
                                                <button
                                                    className="icon-btn"
                                                    onClick={() => setDecisions((l) => l.filter((_, idx) => idx !== i))}
                                                    aria-label="Delete decision"
                                                >
                                                    🗑
                                                </button>
                                            </div>
                                        ))}
                                        {decisions.length === 0 && <div className="side-empty">None found.</div>}
                                    </div>

                                    <div className="dep-label" style={{ margin: "4px 2px" }}>
                                        Action items ({drafts.length})
                                    </div>
                                    {drafts.map((t, i) => (
                                        <div className="plan-row" key={i}>
                                            <div className="plan-top">
                                                <input
                                                    className="input"
                                                    style={{ flex: 1 }}
                                                    value={t.title}
                                                    onChange={(e) => updateDraft(i, { title: e.target.value })}
                                                />
                                                <button
                                                    className="icon-btn"
                                                    onClick={() => setDrafts((l) => l && l.filter((_, idx) => idx !== i))}
                                                    aria-label="Delete task"
                                                >
                                                    🗑
                                                </button>
                                            </div>
                                            <div className="plan-meta">
                                                <input
                                                    className="input"
                                                    type="date"
                                                    value={t.dueDate ?? ""}
                                                    onChange={(e) => updateDraft(i, { dueDate: e.target.value || null })}
                                                />
                                                <select
                                                    className="input"
                                                    value={t.assigneeId ?? ""}
                                                    onChange={(e) =>
                                                        updateDraft(i, { assigneeId: e.target.value ? Number(e.target.value) : null })
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
                                            {t.owner && !t.assigneeId && (
                                                <div className="plan-needs">Notes mention "{t.owner}" but no matching member was found.</div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {formError && <div className="error">{formError}</div>}
                                <div className="modal-foot">
                                    <button className="btn" onClick={() => setDrafts(null)}>Back</button>
                                    <button className="btn btn-primary" onClick={save} disabled={!canSave || busy}>
                                        {busy
                                            ? "Saving..."
                                            : `Save meeting + create ${drafts.length} task${drafts.length === 1 ? "" : "s"}`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
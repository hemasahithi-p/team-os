import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";
import { initials, avatarColor } from "./ui";
import type { Task } from "./Board";

type Comment = {
    id: number;
    task_id: number;
    body: string;
    created_at: string;
    user_id: number;
    user_name: string;
};

type Link = { id: number; title: string; status: Task["status"] };
type Deps = { waitingOn: Link[]; blocks: Link[] };

const STATUS_LABEL: Record<Task["status"], string> = {
    todo: "To do",
    in_progress: "In progress",
    blocked: "Blocked",
    done: "Done",
};

export default function TaskPanel({
    workspaceId,
    task,
    canEdit,
    onClose,
}: {
    workspaceId: number;
    task: Task;
    canEdit: boolean;
    onClose: () => void;
}) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [text, setText] = useState("");
    const [error, setError] = useState("");
    const [deps, setDeps] = useState<Deps>({ waitingOn: [], blocks: [] });
    const [options, setOptions] = useState<Link[]>([]);
    const [pick, setPick] = useState("");
    const endRef = useRef<HTMLDivElement>(null);

    async function loadDeps() {
        try {
            setDeps(await api<Deps>(`/workspaces/${workspaceId}/tasks/${task.id}/dependencies`));
        } catch (e: any) {
            setError(e.message);
        }
    }

    async function loadOptions() {
        if (!canEdit) return;
        try {
            const all = await api<Task[]>(`/workspaces/${workspaceId}/tasks`);
            setOptions(all.map((t) => ({ id: t.id, title: t.title, status: t.status })));
        } catch {
            /* ignore */
        }
    }

    // comments
    useEffect(() => {
        setComments([]);
        api<Comment[]>(`/workspaces/${workspaceId}/tasks/${task.id}/comments`)
            .then((list) => {
                setComments(list);
                setError("");
            })
            .catch((e) => setError(e.message));
    }, [workspaceId, task.id]);

    // dependencies and the dropdown options
    useEffect(() => {
        setDeps({ waitingOn: [], blocks: [] });
        setPick("");
        loadDeps();
        loadOptions();
    }, [workspaceId, task.id]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [comments.length]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // live: new comments, and dependency or status changes
    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "comment.created" && ev.taskId === task.id) {
                setComments((list) =>
                    list.some((c) => c.id === ev.comment.id) ? list : [...list, ev.comment]
                );
            }
            if (ev.type === "tasks.changed") {
                loadDeps();
                loadOptions();
            }
        });
    }, [task.id]);

    async function patch(body: object) {
        try {
            await api(`/workspaces/${workspaceId}/tasks/${task.id}`, { method: "PATCH", body });
            setError("");
        } catch (e: any) {
            setError(e.message);
        }
    }

    async function addDep() {
        if (!pick) return;
        try {
            await api(`/workspaces/${workspaceId}/tasks/${task.id}/dependencies`, {
                method: "POST",
                body: { dependsOnId: Number(pick) },
            });
            setPick("");
            setError("");
            await loadDeps();
        } catch (e: any) {
            setError(e.message);
        }
    }

    async function removeDep(id: number) {
        try {
            await api(`/workspaces/${workspaceId}/tasks/${task.id}/dependencies/${id}`, {
                method: "DELETE",
            });
            setError("");
            await loadDeps();
        } catch (e: any) {
            setError(e.message);
        }
    }

    async function send(e: FormEvent) {
        e.preventDefault();
        if (!text.trim()) return;
        try {
            const created = await api<Comment>(
                `/workspaces/${workspaceId}/tasks/${task.id}/comments`,
                { method: "POST", body: { body: text.trim() } }
            );
            setComments((list) =>
                list.some((c) => c.id === created.id) ? list : [...list, created]
            );
            setText("");
            setError("");
        } catch (err: any) {
            setError(err.message);
        }
    }

    const waitingIds = new Set(deps.waitingOn.map((d) => d.id));
    const choices = options.filter((o) => o.id !== task.id && !waitingIds.has(o.id));

    return (
        <>
            <div className="overlay" onClick={onClose} />
            <aside className="panel">
                <div className="panel-head">
                    <h2>{task.title}</h2>
                    <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="panel-meta">
                    <div>
                        <span className="meta-key">Status</span>{" "}
                        {canEdit ? (
                            <select
                                className="input"
                                value={task.status}
                                onChange={(e) => patch({ status: e.target.value })}
                            >
                                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                                    <option key={k} value={k}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            STATUS_LABEL[task.status]
                        )}
                    </div>
                    <div>
                        <span className="meta-key">Assignee</span> {task.assignee_name ?? "Unassigned"}
                    </div>
                    <div>
                        <span className="meta-key">Due</span>{" "}
                        {canEdit ? (
                            <input
                                className="input"
                                type="date"
                                value={task.due_date ?? ""}
                                onChange={(e) => patch({ dueDate: e.target.value || null })}
                            />
                        ) : (
                            task.due_date ?? "No date"
                        )}
                    </div>
                </div>

                <div className="panel-section-title">Dependencies</div>
                <div className="dep-box">
                    <div className="dep-label">Waiting on</div>
                    {deps.waitingOn.map((d) => (
                        <div className="dep-row" key={d.id}>
                            <span className={"dot " + d.status} />
                            <span className="dep-title">{d.title}</span>
                            <span className="chip">{STATUS_LABEL[d.status]}</span>
                            {canEdit && (
                                <button className="icon-btn" onClick={() => removeDep(d.id)} aria-label="Remove dependency">
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                    {deps.waitingOn.length === 0 && <div className="side-empty">Nothing. This task can start now.</div>}

                    {canEdit && (
                        <div className="side-row">
                            <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                                <option value="">Add: this task waits on...</option>
                                {choices.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.title}
                                    </option>
                                ))}
                            </select>
                            <button className="btn" onClick={addDep} disabled={!pick}>
                                Add
                            </button>
                        </div>
                    )}

                    {deps.blocks.length > 0 && (
                        <>
                            <div className="dep-label">Blocks (waiting on this task)</div>
                            {deps.blocks.map((d) => (
                                <div className="dep-row" key={d.id}>
                                    <span className={"dot " + d.status} />
                                    <span className="dep-title">{d.title}</span>
                                    <span className="chip">{STATUS_LABEL[d.status]}</span>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                <div className="panel-section-title">Comments ({comments.length})</div>

                <div className="thread">
                    {comments.map((c) => (
                        <div className="comment" key={c.id}>
                            <span className="avatar" style={{ background: avatarColor(c.user_name) }}>
                                {initials(c.user_name)}
                            </span>
                            <div className="comment-body">
                                <div className="comment-top">
                                    <strong>{c.user_name}</strong>
                                    <span className="comment-time">
                                        {new Date(c.created_at).toLocaleString([], {
                                            day: "numeric",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                                <div className="comment-text">{c.body}</div>
                            </div>
                        </div>
                    ))}
                    {comments.length === 0 && !error && (
                        <div className="col-empty">No comments yet. Start the conversation.</div>
                    )}
                    <div ref={endRef} />
                </div>

                {error && <div className="error">{error}</div>}

                {canEdit ? (
                    <form className="comment-form" onSubmit={send}>
                        <input
                            className="input"
                            placeholder="Write a comment..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary">Send</button>
                    </form>
                ) : (
                    <div className="side-empty">Viewers can read comments but not write.</div>
                )}
            </aside>
        </>
    );
}
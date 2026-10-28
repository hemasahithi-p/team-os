import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
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
    const endRef = useRef<HTMLDivElement>(null);

    // load the thread whenever a different task is opened
    useEffect(() => {
        setComments([]);
        api<Comment[]>(`/workspaces/${workspaceId}/tasks/${task.id}/comments`)
            .then((list) => {
                setComments(list);
                setError("");
            })
            .catch((e) => setError(e.message));
    }, [workspaceId, task.id]);

    // scroll to the newest comment
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [comments.length]);

    // Escape closes the panel
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function send(e: FormEvent) {
        e.preventDefault();
        if (!text.trim()) return;
        try {
            const created = await api<Comment>(
                `/workspaces/${workspaceId}/tasks/${task.id}/comments`,
                { method: "POST", body: { body: text.trim() } }
            );
            setComments((list) => [...list, created]);
            setText("");
            setError("");
        } catch (err: any) {
            setError(err.message);
        }
    }

    return (
        <>
            <div className="overlay" onClick={onClose} />
            <aside className="panel">
                <div className="panel-head">
                    <h2>{task.title}</h2>
                    <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="panel-meta">
                    <div><span className="meta-key">Status</span> {STATUS_LABEL[task.status]}</div>
                    <div>
                        <span className="meta-key">Assignee</span>{" "}
                        {task.assignee_name ?? "Unassigned"}
                    </div>
                    <div><span className="meta-key">Due</span> {task.due_date ?? "No date"}</div>
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
                            autoFocus
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
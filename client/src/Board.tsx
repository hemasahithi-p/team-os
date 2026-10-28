import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";

export type Task = {
    id: number;
    project_id: number;
    title: string;
    description: string | null;
    status: "todo" | "in_progress" | "blocked" | "done";
    assignee_id: number | null;
    assignee_name: string | null;
    due_date: string | null;
};

type Member = { id: number; name: string; email: string; role: string };

const COLUMNS: { key: Task["status"]; label: string; color: string }[] = [
    { key: "todo", label: "To do", color: "#64748b" },
    { key: "in_progress", label: "In progress", color: "#2563eb" },
    { key: "blocked", label: "Blocked", color: "#dc2626" },
    { key: "done", label: "Done", color: "#16a34a" },
];

export default function Board({
    workspaceId,
    projectId,
    canEdit,
}: {
    workspaceId: number;
    projectId: number;
    canEdit: boolean;
}) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [error, setError] = useState("");

    // form fields
    const [title, setTitle] = useState("");
    const [assigneeId, setAssigneeId] = useState("");
    const [dueDate, setDueDate] = useState("");

    // drag state
    const [dragId, setDragId] = useState<number | null>(null);
    const [overCol, setOverCol] = useState<Task["status"] | null>(null);

    async function loadTasks() {
        try {
            const list = await api<Task[]>(`/workspaces/${workspaceId}/tasks?projectId=${projectId}`);
            setTasks(list);
            setError("");
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        setTasks([]);
        loadTasks();
    }, [workspaceId, projectId]);

    useEffect(() => {
        api<Member[]>(`/workspaces/${workspaceId}/members`)
            .then(setMembers)
            .catch((e) => setError(e.message));
    }, [workspaceId]);

    async function addTask(e: FormEvent) {
        e.preventDefault();
        if (!title.trim()) return;
        try {
            await api(`/workspaces/${workspaceId}/tasks`, {
                method: "POST",
                body: {
                    projectId,
                    title: title.trim(),
                    ...(assigneeId ? { assigneeId: Number(assigneeId) } : {}),
                    ...(dueDate ? { dueDate } : {}),
                },
            });
            setTitle("");
            setAssigneeId("");
            setDueDate("");
            await loadTasks();
        } catch (err: any) {
            setError(err.message);
        }
    }

    // move a task to another column: update screen first, then the server
    async function moveTask(taskId: number, newStatus: Task["status"]) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || task.status === newStatus) return;

        const oldStatus = task.status;
        setTasks((list) => list.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

        try {
            await api(`/workspaces/${workspaceId}/tasks/${taskId}`, {
                method: "PATCH",
                body: { status: newStatus },
            });
            setError("");
        } catch (err: any) {
            // server said no: put the card back
            setTasks((list) => list.map((t) => (t.id === taskId ? { ...t, status: oldStatus } : t)));
            setError(err.message);
        }
    }

    const box = { padding: 8, border: "1px solid #ccc", borderRadius: 6, fontSize: 14 };

    return (
        <div>
            {canEdit && (
                <form onSubmit={addTask} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <input
                        style={{ ...box, flex: 1, minWidth: 200 }}
                        placeholder="New task title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <select style={box} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                    <input style={box} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    <button type="submit" style={{ ...box, background: "#111", color: "#fff", cursor: "pointer" }}>
                        Add task
                    </button>
                </form>
            )}

            {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                {COLUMNS.map((col) => {
                    const items = tasks.filter((t) => t.status === col.key);
                    return (
                        <div
                            key={col.key}
                            onDragOver={(e) => {
                                if (!canEdit) return;
                                e.preventDefault(); // required, otherwise drop is not allowed
                                setOverCol(col.key);
                            }}
                            onDragLeave={() => setOverCol(null)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setOverCol(null);
                                if (canEdit && dragId !== null) moveTask(dragId, col.key);
                                setDragId(null);
                            }}
                            style={{
                                background: overCol === col.key ? "#dbe4f5" : "#eceef2",
                                borderRadius: 10,
                                padding: 12,
                                minHeight: 300,
                                transition: "background 0.15s",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                <span style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }} />
                                <strong style={{ fontSize: 14 }}>{col.label}</strong>
                                <span style={{ color: "#888", fontSize: 13 }}>{items.length}</span>
                            </div>

                            {items.map((t) => (
                                <div
                                    key={t.id}
                                    draggable={canEdit}
                                    onDragStart={(e) => {
                                        setDragId(t.id);
                                        e.dataTransfer.setData("text/plain", String(t.id)); // needed for Firefox
                                    }}
                                    onDragEnd={() => {
                                        setDragId(null);
                                        setOverCol(null);
                                    }}
                                    style={{
                                        background: "#fff",
                                        borderRadius: 8,
                                        padding: 12,
                                        marginBottom: 10,
                                        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                                        cursor: canEdit ? "grab" : "default",
                                        opacity: dragId === t.id ? 0.4 : 1,
                                    }}
                                >
                                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{t.title}</div>
                                    <div style={{ fontSize: 12, color: "#666" }}>
                                        {t.assignee_name ? `👤 ${t.assignee_name}` : "Unassigned"}
                                    </div>
                                    {t.due_date && (
                                        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>📅 {t.due_date}</div>
                                    )}
                                </div>
                            ))}

                            {items.length === 0 && <div style={{ color: "#999", fontSize: 13 }}>No tasks</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
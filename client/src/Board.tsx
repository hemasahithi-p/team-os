import { useEffect, useState } from "react";
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

const COLUMNS: { key: Task["status"]; label: string; color: string }[] = [
    { key: "todo", label: "To do", color: "#64748b" },
    { key: "in_progress", label: "In progress", color: "#2563eb" },
    { key: "blocked", label: "Blocked", color: "#dc2626" },
    { key: "done", label: "Done", color: "#16a34a" },
];

export default function Board({
    workspaceId,
    projectId,
}: {
    workspaceId: number;
    projectId: number;
}) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [error, setError] = useState("");

    // reload tasks whenever the workspace or project changes
    useEffect(() => {
        setTasks([]);
        api<Task[]>(`/workspaces/${workspaceId}/tasks?projectId=${projectId}`)
            .then((list) => {
                setTasks(list);
                setError("");
            })
            .catch((e) => setError(e.message));
    }, [workspaceId, projectId]);

    return (
        <div>
            {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                {COLUMNS.map((col) => {
                    const items = tasks.filter((t) => t.status === col.key);
                    return (
                        <div key={col.key} style={{ background: "#eceef2", borderRadius: 10, padding: 12, minHeight: 300 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                <span style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }} />
                                <strong style={{ fontSize: 14 }}>{col.label}</strong>
                                <span style={{ color: "#888", fontSize: 13 }}>{items.length}</span>
                            </div>

                            {items.map((t) => (
                                <div
                                    key={t.id}
                                    style={{
                                        background: "#fff",
                                        borderRadius: 8,
                                        padding: 12,
                                        marginBottom: 10,
                                        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
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
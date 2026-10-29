import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import { initials, avatarColor, today } from "./ui";
import TaskPanel from "./TaskPanel";
import { onRealtime } from "./realtime";
import AiPlan from "./AiPlan";
import RiskBadge from "./RiskBadge";
import RiskReport from "./RiskReport";
import type { RiskItem } from "./risk";

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
    { key: "todo", label: "To do", color: "#8a8a8a" },
    { key: "in_progress", label: "In progress", color: "#0f6cbd" },
    { key: "blocked", label: "Blocked", color: "#c4314b" },
    { key: "done", label: "Done", color: "#237b4b" },
];

export default function Board({
    workspaceId,
    projectId,
    canEdit,
    focus,
    onFocusDone,
}: {
    workspaceId: number;
    projectId: number;
    canEdit: boolean;
    focus?: { id: number; n: number } | null;
    onFocusDone?: () => void;
}) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [error, setError] = useState("");

    const [title, setTitle] = useState("");
    const [assigneeId, setAssigneeId] = useState("");
    const [dueDate, setDueDate] = useState("");

    const [dragId, setDragId] = useState<number | null>(null);
    const [overCol, setOverCol] = useState<Task["status"] | null>(null);

    const [openId, setOpenId] = useState<number | null>(null);
    const openTask = tasks.find((t) => t.id === openId);

    const [aiOpen, setAiOpen] = useState(false);

    const [risks, setRisks] = useState<Record<number, RiskItem>>({});
    const [reportOpen, setReportOpen] = useState(false);

    async function loadTasks() {
        try {
            const [list, risk] = await Promise.all([
                api<Task[]>(`/workspaces/${workspaceId}/tasks?projectId=${projectId}`),
                api<{ items: RiskItem[] }>(`/workspaces/${workspaceId}/risks?projectId=${projectId}`),
            ]);
            setTasks(list);
            setRisks(Object.fromEntries(risk.items.map((i) => [i.id, i])));
            setError("");
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        setTasks([]);
        setOpenId(null);
        loadTasks();
    }, [workspaceId, projectId]);
    // opened from the search bar
    useEffect(() => {
        if (focus) {
            setOpenId(focus.id);
            onFocusDone?.();
        }
    }, [focus, projectId]);

    function loadMembers() {
        api<Member[]>(`/workspaces/${workspaceId}/members`)
            .then(setMembers)
            .catch((e) => setError(e.message));
    }

    useEffect(() => {
        loadMembers();
    }, [workspaceId]);

    // live updates from teammates
    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "subscribed") loadTasks();
            if (ev.type === "tasks.changed" && (ev.projectId === projectId || ev.projectId == null)) loadTasks();
            if (ev.type === "members.changed") {
                loadMembers();
                loadTasks();
            }
        });
    }, [workspaceId, projectId]);

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
            setTasks((list) => list.map((t) => (t.id === taskId ? { ...t, status: oldStatus } : t)));
            setError(err.message);
        }
    }

    const todayStr = today();
    const riskList = Object.values(risks);
    const riskCount = {
        blocked: riskList.filter((r) => r.own === "blocked").length,
        overdue: riskList.filter((r) => r.own === "overdue").length,
        atRisk: riskList.filter((r) => !r.own && r.reasons.length > 0).length,
    };

    return (
        <div>
            <div className="board-bar">
                <span className="risk-counts">
                    {riskCount.blocked + riskCount.overdue + riskCount.atRisk === 0
                        ? "✅ No risks detected"
                        : `⛔ ${riskCount.blocked} blocked · ⏰ ${riskCount.overdue} overdue · ⚠ ${riskCount.atRisk} at risk`}
                </span>
                <button className="btn" onClick={() => setReportOpen(true)}>🧠 Risk report</button>
            </div>
            {canEdit && (
                <form className="task-form" onSubmit={addTask}>
                    <input
                        className="input title-input"
                        placeholder="Add a new task..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                    <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    <button type="button" className="btn" onClick={() => setAiOpen(true)}>✨ AI plan</button>
                    <button type="submit" className="btn btn-primary">Add task</button>
                </form>
            )}

            {error && <div className="error">{error}</div>}

            <div className="board">
                {COLUMNS.map((col) => {
                    const items = tasks.filter((t) => t.status === col.key);
                    return (
                        <div
                            key={col.key}
                            className={"column" + (overCol === col.key ? " over" : "")}
                            style={{ ["--col" as any]: col.color }}
                            onDragOver={(e) => {
                                if (!canEdit) return;
                                e.preventDefault();
                                setOverCol(col.key);
                            }}
                            onDragLeave={() => setOverCol(null)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setOverCol(null);
                                if (canEdit && dragId !== null) moveTask(dragId, col.key);
                                setDragId(null);
                            }}
                        >
                            <div className="col-head">
                                <span className="col-title">{col.label}</span>
                                <span className="col-count">{items.length}</span>
                            </div>

                            {items.map((t) => {
                                const overdue = !!t.due_date && t.due_date < todayStr && t.status !== "done";
                                return (
                                    <div
                                        key={t.id}
                                        className={
                                            "card" + (canEdit ? " draggable" : "") + (dragId === t.id ? " dragging" : "")
                                        }
                                        onClick={() => setOpenId(t.id)}
                                        draggable={canEdit}
                                        onDragStart={(e) => {
                                            setDragId(t.id);
                                            e.dataTransfer.setData("text/plain", String(t.id));
                                        }}
                                        onDragEnd={() => {
                                            setDragId(null);
                                            setOverCol(null);
                                        }}
                                    >
                                        <div className="card-title">{t.title}</div>
                                        <RiskBadge r={risks[t.id]} />
                                        <div className="card-foot">
                                            <div className="assignee">
                                                {t.assignee_name ? (
                                                    <>
                                                        <span className="avatar sm" style={{ background: avatarColor(t.assignee_name) }}>
                                                            {initials(t.assignee_name)}
                                                        </span>
                                                        <span>{t.assignee_name}</span>
                                                    </>
                                                ) : (
                                                    <span>Unassigned</span>
                                                )}
                                            </div>
                                            {t.due_date && (
                                                <span className={"due" + (overdue ? " overdue" : "")}>{t.due_date}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {items.length === 0 && <div className="col-empty">No tasks</div>}
                        </div>
                    );
                })}
            </div>
            {openTask && (
                <TaskPanel
                    workspaceId={workspaceId}
                    task={openTask}
                    canEdit={canEdit}
                    onClose={() => setOpenId(null)}
                />
            )}
            {aiOpen && (
                <AiPlan
                    workspaceId={workspaceId}
                    projectId={projectId}
                    members={members}
                    onClose={() => setAiOpen(false)}
                    onApplied={() => {
                        setAiOpen(false);
                        loadTasks();
                    }}
                />
            )}
            {reportOpen && (
                <RiskReport
                    workspaceId={workspaceId}
                    projectId={projectId}
                    canUseAi={canEdit}
                    onClose={() => setReportOpen(false)}
                />
            )}
        </div>
    );
}
import { useEffect, useState } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";
import { today } from "./ui";
import TaskPanel from "./TaskPanel";
import type { Task } from "./Board";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_COLOR: Record<Task["status"], string> = {
    todo: "#8a8a8a",
    in_progress: "#0f6cbd",
    blocked: "#c4314b",
    done: "#237b4b",
};

// build "YYYY-MM-DD" from local parts (no timezone surprises)
function fmt(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function Calendar({
    workspaceId,
    canEdit,
}: {
    workspaceId: number;
    canEdit: boolean;
}) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [tasks, setTasks] = useState<Task[]>([]);
    const [error, setError] = useState("");
    const [openId, setOpenId] = useState<number | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    async function loadTasks() {
        try {
            setTasks(await api<Task[]>(`/workspaces/${workspaceId}/tasks`));
            setError("");
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        setTasks([]);
        setOpenId(null);
        loadTasks();
    }, [workspaceId]);

    // live updates
    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "subscribed" || ev.type === "tasks.changed") loadTasks();
        });
    }, [workspaceId]);

    function shift(delta: number) {
        const d = new Date(year, month + delta, 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth());
        setExpanded(null);
    }

    function goToday() {
        const d = new Date();
        setYear(d.getFullYear());
        setMonth(d.getMonth());
        setExpanded(null);
    }

    // grid: weeks start on Monday, includes days of the neighbouring months
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: total }, (_, i) => {
        const d = new Date(year, month, 1 - offset + i);
        return {
            date: fmt(d.getFullYear(), d.getMonth(), d.getDate()),
            day: d.getDate(),
            inMonth: d.getMonth() === month,
        };
    });

    // group tasks by due date
    const byDate: Record<string, Task[]> = {};
    tasks.forEach((t) => {
        if (t.due_date) (byDate[t.due_date] ??= []).push(t);
    });
    const unscheduled = tasks.filter((t) => !t.due_date);

    const todayStr = today();
    const openTask = tasks.find((t) => t.id === openId);

    function chip(t: Task) {
        const overdue = !!t.due_date && t.due_date < todayStr && t.status !== "done";
        return (
            <div
                key={t.id}
                className={"cal-chip" + (overdue ? " overdue" : "") + (t.status === "done" ? " done" : "")}
                style={{ borderLeftColor: STATUS_COLOR[t.status] }}
                onClick={() => setOpenId(t.id)}
                title={`${t.title}${t.assignee_name ? " · " + t.assignee_name : ""}`}
            >
                {t.title}
            </div>
        );
    }

    return (
        <div>
            <div className="cal-toolbar">
                <button className="btn" onClick={() => shift(-1)}>←</button>
                <button className="btn" onClick={() => shift(1)}>→</button>
                <button className="btn" onClick={goToday}>Today</button>
                <h2 className="cal-title">
                    {new Date(year, month, 1).toLocaleDateString([], { month: "long", year: "numeric" })}
                </h2>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="cal-grid">
                {DAYS.map((d) => (
                    <div key={d} className="cal-dow">{d}</div>
                ))}

                {cells.map((c) => {
                    const items = byDate[c.date] ?? [];
                    const showAll = expanded === c.date;
                    const visible = showAll ? items : items.slice(0, 3);
                    return (
                        <div
                            key={c.date}
                            className={
                                "cal-cell" + (c.inMonth ? "" : " outside") + (c.date === todayStr ? " today" : "")
                            }
                        >
                            <div className="cal-day">{c.day}</div>
                            {visible.map(chip)}
                            {items.length > 3 && (
                                <button className="link-btn" onClick={() => setExpanded(showAll ? null : c.date)}>
                                    {showAll ? "Show less" : `+${items.length - 3} more`}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {unscheduled.length > 0 && (
                <div className="unscheduled">
                    <div className="panel-section-title">No due date ({unscheduled.length})</div>
                    <div className="unscheduled-list">{unscheduled.map(chip)}</div>
                </div>
            )}

            {openTask && (
                <TaskPanel
                    workspaceId={workspaceId}
                    task={openTask}
                    canEdit={canEdit}
                    onClose={() => setOpenId(null)}
                />
            )}
        </div>
    );
}
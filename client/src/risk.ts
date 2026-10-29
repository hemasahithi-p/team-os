export type Reason = { type: "blocked" | "overdue" | "schedule"; taskId: number; title: string };

export type RiskItem = {
    id: number;
    project_id: number;
    title: string;
    status: string;
    due_date: string | null;
    assignee_name: string | null;
    own: "blocked" | "overdue" | null;
    reasons: Reason[];
    upstream: number;
    downstream: number;
};

export function reasonText(r: Reason) {
    if (r.type === "blocked") return `"${r.title}" is blocked`;
    if (r.type === "overdue") return `"${r.title}" is overdue`;
    return `"${r.title}" is due after this task`;
}
import { db } from "./db";

export type Reason = { type: "blocked" | "overdue" | "schedule"; taskId: number; title: string };

export type RiskItem = {
    id: number;
    project_id: number;
    title: string;
    status: string;
    due_date: string | null;
    assignee_name: string | null;
    own: "blocked" | "overdue" | null; // a problem with this task itself
    reasons: Reason[]; // problems upstream that threaten this task
    upstream: number; // unfinished tasks this one waits on (any depth)
    downstream: number; // unfinished tasks waiting on this one (any depth)
};

type Row = {
    id: number;
    project_id: number;
    title: string;
    status: string;
    due_date: string | null;
    assignee_name: string | null;
};
type Edge = { task_id: number; depends_on_id: number };

export function todayStr() {
    return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function push(map: Map<number, number[]>, key: number, value: number) {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(value);
}

export function computeRisks(tasks: Row[], edges: Edge[], today: string): RiskItem[] {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const parents = new Map<number, number[]>(); // task -> tasks it waits on
    const children = new Map<number, number[]>(); // task -> tasks waiting on it
    for (const e of edges) {
        if (!byId.has(e.task_id) || !byId.has(e.depends_on_id)) continue;
        push(parents, e.task_id, e.depends_on_id);
        push(children, e.depends_on_id, e.task_id);
    }

    // every UNFINISHED task reachable from start (finished work cannot cause problems)
    function walk(start: number, graph: Map<number, number[]>) {
        const seen = new Set<number>();
        const stack = [...(graph.get(start) ?? [])];
        while (stack.length) {
            const id = stack.pop()!;
            if (seen.has(id) || byId.get(id)!.status === "done") continue;
            seen.add(id);
            stack.push(...(graph.get(id) ?? []));
        }
        return seen;
    }

    return tasks.map((t) => {
        const done = t.status === "done";
        let own: RiskItem["own"] = null;
        const reasons: Reason[] = [];
        let upstream = 0;
        let downstream = 0;

        if (!done) {
            if (t.status === "blocked") own = "blocked";
            else if (t.due_date && t.due_date < today) own = "overdue";

            const up = walk(t.id, parents);
            upstream = up.size;
            downstream = walk(t.id, children).size;

            for (const uid of up) {
                const u = byId.get(uid)!;
                if (u.status === "blocked") reasons.push({ type: "blocked", taskId: u.id, title: u.title });
                else if (u.due_date && u.due_date < today)
                    reasons.push({ type: "overdue", taskId: u.id, title: u.title });
                else if (u.due_date && t.due_date && u.due_date > t.due_date)
                    reasons.push({ type: "schedule", taskId: u.id, title: u.title });
            }
        }

        return {
            id: t.id,
            project_id: t.project_id,
            title: t.title,
            status: t.status,
            due_date: t.due_date,
            assignee_name: t.assignee_name,
            own,
            reasons,
            upstream,
            downstream,
        };
    });
}

// load a workspace (optionally one project) and compute its risks
export async function loadRisks(workspaceId: number, projectId?: number) {
    const tasks = await db.query(
        `SELECT t.id, t.project_id, t.title, t.status, t.due_date, u.name AS assignee_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.workspace_id = $1`,
        [workspaceId]
    );
    const edges = await db.query(
        `SELECT d.task_id, d.depends_on_id
     FROM task_dependencies d JOIN tasks t ON t.id = d.task_id
     WHERE t.workspace_id = $1`,
        [workspaceId]
    );
    const items = computeRisks(tasks.rows, edges.rows, todayStr());
    return {
        items: projectId ? items.filter((i) => i.project_id === projectId) : items,
        edges: edges.rows as Edge[],
    };
}

// unfinished tasks that (directly or indirectly) wait on this task
export async function downstreamOf(workspaceId: number, taskId: number) {
    const r = await db.query(
        `WITH RECURSIVE down AS (
       SELECT task_id FROM task_dependencies WHERE depends_on_id = $1
       UNION
       SELECT d.task_id FROM task_dependencies d JOIN down ON d.depends_on_id = down.task_id
     )
     SELECT t.id, t.title, t.assignee_id
     FROM tasks t JOIN down ON down.task_id = t.id
     WHERE t.workspace_id = $2 AND t.status <> 'done'`,
        [taskId, workspaceId]
    );
    return r.rows as { id: number; title: string; assignee_id: number | null }[];
}
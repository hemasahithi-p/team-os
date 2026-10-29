import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";

export type SearchResult = {
    kind: "task" | "meeting";
    id: number;
    title: string;
    extra: string | null;
    project_id: number | null;
    score: number;
};

export default function Search({
    workspaceId,
    onPick,
}: {
    workspaceId: number | null;
    onPick: (r: SearchResult) => void;
}) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState<SearchResult[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setQ("");
        setResults(null);
        setError("");
    }, [workspaceId]);

    async function run(e: FormEvent) {
        e.preventDefault();
        if (workspaceId === null || q.trim().length < 2) return;
        setLoading(true);
        setError("");
        try {
            const d = await api<{ results: SearchResult[] }>(
                `/workspaces/${workspaceId}/search?q=${encodeURIComponent(q.trim())}`
            );
            setResults(d.results);
        } catch (err: any) {
            setError(err.message);
            setResults([]);
        }
        setLoading(false);
    }

    function close() {
        setResults(null);
        setError("");
    }

    const open = loading || results !== null;

    return (
        <form className="search-wrap" onSubmit={run}>
            <input
                className="search"
                placeholder="AI search: describe what you need, press Enter"
                value={q}
                onChange={(e) => setQ(e.target.value)}
            />
            {open && (
                <>
                    <div className="bell-overlay" onClick={close} />
                    <div className="search-menu">
                        {loading && <div className="col-empty">Searching...</div>}
                        {!loading && error && <div className="error" style={{ margin: 8 }}>{error}</div>}
                        {!loading &&
                            results?.map((r) => (
                                <div
                                    key={r.kind + r.id}
                                    className="result"
                                    onClick={() => {
                                        onPick(r);
                                        close();
                                    }}
                                >
                                    <span>{r.kind === "task" ? "📋" : "📝"}</span>
                                    <div className="result-main">
                                        <div className="result-title">{r.title}</div>
                                        {r.extra && <div className="result-extra">{r.extra}</div>}
                                    </div>
                                    <span className="chip">{Math.round(r.score * 100)}%</span>
                                </div>
                            ))}
                        {!loading && !error && results?.length === 0 && (
                            <div className="col-empty">No matches. Try different words.</div>
                        )}
                    </div>
                </>
            )}
        </form>
    );
}
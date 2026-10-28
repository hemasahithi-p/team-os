import { getToken } from "./api";

type Handler = (event: any) => void;

let socket: WebSocket | null = null;
let currentWs: number | null = null;
let retryTimer: number | undefined;
const handlers = new Set<Handler>();

function open(workspaceId: number) {
    const token = getToken();
    if (!token) return;

    const s = new WebSocket(`ws://localhost:4000/ws?token=${token}`);
    socket = s;

    s.onopen = () => s.send(JSON.stringify({ type: "subscribe", workspaceId }));

    s.onmessage = (e) => {
        try {
            const event = JSON.parse(e.data);
            handlers.forEach((h) => h(event));
        } catch {
            /* ignore bad messages */
        }
    };

    // connection dropped: try again in 2 seconds (unless we closed it on purpose)
    s.onclose = () => {
        if (socket === s && currentWs === workspaceId) {
            retryTimer = window.setTimeout(() => open(workspaceId), 2000);
        }
    };
}

export function connectWorkspace(workspaceId: number) {
    if (currentWs === workspaceId && socket) return;
    disconnect();
    currentWs = workspaceId;
    open(workspaceId);
}

export function disconnect() {
    currentWs = null;
    window.clearTimeout(retryTimer);
    const s = socket;
    socket = null;
    s?.close();
}

// listen to events; returns a function that stops listening
export function onRealtime(handler: Handler) {
    handlers.add(handler);
    return () => {
        handlers.delete(handler);
    };
}
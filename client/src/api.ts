const API = "http://localhost:4000";

export function getToken() {
    return localStorage.getItem("token");
}

export function setToken(token: string | null) {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
}

// one function for every API call; adds the token automatically
export async function api<T = any>(
    path: string,
    options: { method?: string; body?: unknown } = {}
): Promise<T> {
    const token = getToken();
    const res = await fetch(API + path, {
        method: options.method ?? "GET",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data as T;
}
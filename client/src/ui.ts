const COLORS = ["#5b5fc7", "#0f6cbd", "#237b4b", "#c4314b", "#ca5010", "#8764b8", "#038387", "#986f0b"];

export function initials(name: string) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// same name always gets the same color
export function avatarColor(name: string) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % COLORS.length;
    return COLORS[h];
}

// today as YYYY-MM-DD in local time (matches the due_date format)
export function today() {
    return new Date().toLocaleDateString("en-CA");
}
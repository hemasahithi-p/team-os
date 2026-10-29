import { reasonText } from "./risk";
import type { RiskItem } from "./risk";

export default function RiskBadge({ r }: { r?: RiskItem }) {
    if (!r) return null;
    const why = r.reasons.map(reasonText).join("\n");

    if (r.own === "blocked") {
        return (
            <span className="rbadge red" title={why}>
                ⛔ Blocked{r.downstream > 0 ? ` · holds up ${r.downstream}` : ""}
            </span>
        );
    }
    if (r.own === "overdue") {
        return (
            <span className="rbadge red" title={why}>
                ⏰ Overdue{r.downstream > 0 ? ` · holds up ${r.downstream}` : ""}
            </span>
        );
    }
    if (r.reasons.length > 0) {
        return (
            <span className="rbadge amber" title={why}>
                ⚠ At risk
            </span>
        );
    }
    return null;
}
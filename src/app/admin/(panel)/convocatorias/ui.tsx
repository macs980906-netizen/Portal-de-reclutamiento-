import { CYCLE_STATUS, type CycleStatus } from "@/server/cycles";

const STYLE: Record<CycleStatus, string> = {
  OPEN: "bg-green-100 text-green-900",
  REVIEW: "bg-amber-100 text-amber-900",
  CLOSED: "bg-zinc-200 text-zinc-800",
};

export function CycleBadge({ status }: { status: CycleStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[status]}`}>{CYCLE_STATUS[status]}</span>;
}

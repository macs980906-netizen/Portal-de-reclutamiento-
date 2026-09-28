import { STATUSES } from "@/config/statuses";

const TONES: Record<string, string> = {
  info: "bg-blue-100 text-blue-900",
  neutral: "bg-zinc-100 text-zinc-800",
  accent: "bg-red-100 text-red-900",
  muted: "bg-zinc-200 text-zinc-700",
  success: "bg-green-100 text-green-900",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = STATUSES.find((s) => s.id === status)?.tone ?? "neutral";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{label}</span>;
}

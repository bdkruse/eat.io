export function StatusPill({ text, ready }: { text: string; ready: boolean }) {
  return <span className={ready ? "status-pill status-pill--ready" : "status-pill"}>{text}</span>;
}

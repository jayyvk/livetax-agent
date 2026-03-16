import { LiveTaxWorkspace } from "@/components/live-tax/workspace";

export default function Page() {
  const wsUrl = process.env.BACKEND_WS_URL ?? "ws://127.0.0.1:8000/ws";
  return <LiveTaxWorkspace wsUrl={wsUrl} />;
}

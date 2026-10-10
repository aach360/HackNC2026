import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { refreshImport } from "@/modules/ingestion/events.functions";
import { AeroButton, PageTitle, Panel } from "@/components/aero";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Team import — PulseMatch" },
      { name: "description", content: "Team-only event import controls." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Team import — PulseMatch" },
      { property: "og:description", content: "Team-only event import controls." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const run = useServerFn(refreshImport);
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="max-w-md">
      <PageTitle title="Team import" subtitle="Re-fetch events from Heel Life. Requires the team import key." />
      <Panel className="space-y-3 p-5">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Import key"
          className="w-full rounded-full border border-input bg-card px-4 py-2 text-sm"
        />
        <AeroButton
          disabled={!token}
          onClick={async () => {
            setMsg("Importing…");
            const r = await run({ data: { token } });
            if (!r.ok) return setMsg(r.error);
            await qc.invalidateQueries({ queryKey: ["events"] });
            setMsg(`Imported via ${r.result.origin}. ${r.result.total} upcoming events. ${r.result.warnings.join(" ")}`);
          }}
        >
          Refresh import
        </AeroButton>
        {msg && <p className="text-sm font-semibold text-navy">{msg}</p>}
      </Panel>
    </div>
  );
}

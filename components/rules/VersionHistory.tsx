"use client";

import Link from "next/link";
import { rulesetLabel } from "@/lib/contracts/domain";
import { useApi } from "@/lib/client/hooks";
import { Banner, Card, CardHeader, P1Placeholder, Tag } from "@/components/ui";
import { formatWhen } from "./derive";
import { VerbatimText } from "./VerbatimText";

/** P1 placeholder (FE-12) that shows only what the data holds: the current version and approved proposal rules. */
export function VersionHistory() {
  const { data, error } = useApi("listRules", {});
  if (error && !data) return <Banner tone="error">Could not load the rules: {error.message}</Banner>;
  if (!data) return <p role="status" className="text-sm text-muted">Loading version history…</p>;

  const added = data.rules.filter((rule) => rule.source === "proposal").sort((a, b) => b.version - a.version);
  return (
    <div className="flex max-w-[860px] flex-col gap-4">
      <P1Placeholder title="Version history">
        Side-by-side versions, who changed what and rollback arrive with FE-12. Until then this page lists only the current ruleset version and the rules added by approved proposals.
      </P1Placeholder>
      <Card>
        <CardHeader title="Current ruleset" right={<Tag mono tone="neutral">{rulesetLabel(data.ruleset_version)}</Tag>} />
        {added.length === 0 ? (
          <p className="mt-3 mb-0 text-[13px] text-muted">No proposals have been approved yet. Every rule is from the seeded ruleset.</p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {added.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-1 border-t border-hint-bg pt-3 text-[13px] text-body first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/rules?rule=${encodeURIComponent(rule.id)}`} className="font-mono text-[13px] font-semibold text-link underline-offset-2 hover:underline">{rule.id}</Link>
                  <Tag tone="accent">Added {rulesetLabel(rule.version)}</Tag>
                  {rule.provenance ? <span className="text-muted">approved by {rule.provenance.actor} at {formatWhen(rule.provenance.at)}</span> : null}
                </div>
                <p className="m-0 line-clamp-2"><VerbatimText text={rule.text} /></p>
                {rule.provenance ? <p className="m-0 text-muted">Reason: “{rule.provenance.reason}”</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

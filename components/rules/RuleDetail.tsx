import type { Rule } from "@/lib/contracts/domain";
import { Button, Tag } from "@/components/ui";
import { SCOPE_LABEL, formatWhen } from "./derive";
import { RuleSeverity } from "./RuleSeverity";
import { VerbatimText } from "./VerbatimText";

const H3 = "m-0 text-xs font-semibold tracking-[0.05em] text-muted uppercase";

export function RuleDetail({ rule }: { rule: Rule }) {
  const { resolution, prefilter } = rule;
  const keywords = prefilter?.keywords ?? [];
  const notes = prefilter?.notes?.trim() ? prefilter.notes : null;
  return (
    <aside aria-label="Rule detail" className="flex flex-col gap-3.5 rounded-xl border border-line bg-card p-5 lg:sticky lg:top-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 font-mono text-[15px] font-semibold text-ink">{rule.id}</h2>
          <RuleSeverity rule={rule} />
          <Tag tone={resolution.active ? "ok" : "neutral"} className="rounded-md">{resolution.active ? "Active" : "Inactive"}</Tag>
          <span className="font-mono text-[11px] text-muted">{rule.level}</span>
          {rule.status === "retired" ? <Tag tone="warning" className="rounded-md">Retired</Tag> : null}
        </div>
        <div className="text-xs text-muted">{SCOPE_LABEL[resolution.scope]}</div>
      </div>

      <section className="flex flex-col gap-1">
        <h3 className={H3}>Rule text, verbatim</h3>
        <p className="m-0 font-serif text-[15px] text-ink"><VerbatimText text={rule.text} /></p>
        <span className="text-xs text-muted">Source: {rule.source_tag}</span>
      </section>

      <section className="flex flex-col gap-1.5 rounded-[10px] bg-subtle px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className={H3}>Check plan</h3>
          <span className="font-mono text-[11px] text-flag">{rule.plan}</span>
        </div>
        <dl className="m-0 flex flex-col gap-1 text-[13px] text-body">
          <div className="flex flex-wrap gap-x-1.5"><dt className="text-muted">Layers:</dt><dd className="m-0 font-mono text-xs leading-5">{resolution.layers.length ? resolution.layers.join(", ") : "none"}</dd></div>
          <div className="flex flex-wrap gap-x-1.5"><dt className="text-muted">Blocks publishing:</dt><dd className="m-0 font-medium">{resolution.blocks_publish ? "yes" : "no"}</dd></div>
          {resolution.publish_requires_reason !== undefined ? (
            <div className="flex flex-wrap gap-x-1.5"><dt className="text-muted">Publishing needs a recorded reason:</dt><dd className="m-0 font-medium">{resolution.publish_requires_reason ? "yes" : "no"}</dd></div>
          ) : null}
          {resolution.conditional ? (
            <div className="flex flex-wrap gap-x-1.5"><dt className="text-muted">Condition:</dt><dd className="m-0">{resolution.conditional}</dd></div>
          ) : null}
        </dl>
        {keywords.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Prefilter keywords</span>
            <div className="flex flex-wrap gap-1">
              {keywords.map((keyword) => (
                <span key={keyword} className="rounded border border-line bg-card px-1.5 py-px font-mono text-[11px] text-body"><VerbatimText text={keyword} /></span>
              ))}
            </div>
          </div>
        ) : null}
        {notes ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">Prefilter notes</span>
            <p className="m-0 text-[13px] text-body"><VerbatimText text={notes} /></p>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className={H3}>Team&apos;s judgment call</h3>
        <p className="m-0 text-[13px] text-body">{rule.decision ? <VerbatimText text={rule.decision} /> : "No recorded decision"}</p>
      </section>

      <section className="flex flex-col gap-1.5 border-t border-hint-bg pt-3">
        <h3 className={H3}>Provenance</h3>
        {rule.source === "proposal" && rule.provenance ? (
          <div className="text-[13px] text-body">
            <b className="font-mono font-semibold text-ink">v{rule.version}</b> · approved by {rule.provenance.actor} at {formatWhen(rule.provenance.at)}: “{rule.provenance.reason}”
          </div>
        ) : (
          <div className="text-[13px] text-body">
            <b className="font-mono font-semibold text-ink">v{rule.version}</b> · seeded from rules.resolved.json
          </div>
        )}
      </section>

      <div className="flex flex-col gap-1.5">
        <Button disabled className="min-h-11 w-full">Propose a change to this rule</Button>
        <span className="font-mono text-[11px] text-muted">P1 · FE-12, not available in this build</span>
      </div>
    </aside>
  );
}

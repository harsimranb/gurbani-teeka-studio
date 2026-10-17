"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Banner, P1Placeholder } from "@/components/ui";
import { ApiClientError } from "@/lib/client/api";
import { callApi, useApi, useUserName } from "@/lib/client/hooks";
import { DecideCard } from "./DecideCard";
import { DriftCard } from "./DriftCard";
import { EarlierProposals } from "./EarlierProposals";
import { EMPTY_DRAFT, ProposalForm, type ProposalDraft } from "./ProposalForm";

const BASE = "/rules/proposals";

/** /rules/proposals: submit a proposal, see its drift check, decide. */
export function ProposalsView() {
  const router = useRouter();
  const selectedId = useSearchParams().get("proposal");
  const { name } = useUserName();

  const proposals = useApi("listProposals", {});
  const rules = useApi("listRules", {});
  const detail = useApi("getProposal", selectedId ? { proposal_id: selectedId } : null);

  const [draft, setDraft] = useState<ProposalDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);

  const submit = useCallback(async () => {
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await callApi("submitProposal", {
        rule_text: draft.rule_text.trim(), example: draft.example.trim(), reason: draft.reason.trim(), author: name,
      });
      setDraft(EMPTY_DRAFT);
      router.push(`${BASE}?proposal=${encodeURIComponent(res.proposal.id)}`);
    } catch (e) {
      setSubmitError(e instanceof ApiClientError || e instanceof Error ? e.message : "Could not submit the proposal.");
    } finally {
      setBusy(false);
    }
  }, [draft, name, router]);

  // Copies the proposal's own words back into the form. Nothing is generated.
  const revise = useCallback(() => {
    const p = detail.data?.proposal;
    if (p) setDraft({ rule_text: p.rule_text, example: p.example, reason: p.reason });
    setSubmitError(null);
    setFocusSignal((n) => n + 1);
    router.push(BASE);
  }, [detail.data, router]);

  const startNew = useCallback(() => {
    setSubmitError(null);
    setFocusSignal((n) => n + 1);
    router.push(BASE);
  }, [router]);

  const selected = selectedId ? detail.data : null;
  const loadError = selectedId && detail.error ? detail.error.message : null;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-label="Proposal" className="flex min-w-0 flex-[1_1_440px] flex-col gap-4">
        <ProposalForm
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void submit()}
          busy={busy}
          error={submitError}
          canAct={name.trim() !== ""}
          selected={selected?.proposal ?? null}
          onNew={startNew}
          focusSignal={focusSignal}
        />
        {proposals.error ? (
          <Banner tone="error">Could not load earlier proposals: {proposals.error.message}</Banner>
        ) : (
          <EarlierProposals proposals={proposals.data?.proposals ?? []} selectedId={selectedId} />
        )}
        <P1Placeholder title="Drafted from repeated overrides">
          When two or more people override the same rule, Eko drafts a proposal with those overrides as evidence. It goes through the same drift check.
        </P1Placeholder>
      </section>

      <section aria-label="Drift check" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5">
        {loadError ? <Banner tone="error">Could not load proposal {selectedId}: {loadError}</Banner> : null}
        {selectedId && !selected && !loadError ? <p className="m-0 text-sm text-muted">Loading proposal…</p> : null}
        {!selectedId || selected || loadError ? <DriftCard results={selected ? selected.drift_results : null} /> : null}
        {selected ? (
          <DecideCard
            key={selected.proposal.id}
            proposal={selected.proposal}
            results={selected.drift_results}
            rulesetVersion={rules.data?.ruleset_version ?? null}
            rules={rules.data?.rules ?? []}
            name={name}
            onRevise={revise}
            onConflict={rules.refetch}
          />
        ) : null}
      </section>
    </div>
  );
}

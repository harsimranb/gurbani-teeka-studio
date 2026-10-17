import { z } from "zod";

// Model-facing review schemas: flat and refinement-free. Neither has a field for English text of any kind.
export const ConfirmationOutputSchema = z.object({
  decisions: z.array(z.object({ candidate_index: z.number().int(), verdict: z.enum(["confirm", "reject"]), explanation: z.string() })),
});
export type ConfirmationOutput = z.infer<typeof ConfirmationOutputSchema>;

export const OpenFindingsOutputSchema = z.object({
  status: z.enum(["evaluated", "not_evaluable"]),
  reason: z.string(),
  findings: z.array(z.object({ quoted_span: z.string(), occurrence: z.number().int(), explanation: z.string(), reference_ids: z.array(z.string()), subcheck: z.string() })),
});
export type OpenFindingsOutput = z.infer<typeof OpenFindingsOutputSchema>;

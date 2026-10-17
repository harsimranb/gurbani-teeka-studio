import type { LlmPacketKind } from "../../checks/pipeline";
import type { ConfirmationOutput, OpenFindingsOutput } from "../schemas";
import { confirmPrompt } from "./confirm";
import { freeTextPrompt } from "./freetext";
import { stylePrompt } from "./style";
import { term02Prompt } from "./term02";
import type { PromptSpec } from "./types";

export type { PromptSpec } from "./types";

export function promptFor(kind: "confirm"): PromptSpec<ConfirmationOutput>;
export function promptFor(kind: Exclude<LlmPacketKind, "confirm">): PromptSpec<OpenFindingsOutput>;
export function promptFor(kind: LlmPacketKind): PromptSpec<ConfirmationOutput> | PromptSpec<OpenFindingsOutput> {
  return { confirm: confirmPrompt, term02: term02Prompt, free_text: freeTextPrompt, style: stylePrompt }[kind];
}

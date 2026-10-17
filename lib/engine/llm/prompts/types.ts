import type { z } from "zod";
import type { LlmPacket } from "../../checks/pipeline";

export interface PromptSpec<T> {
  version: string;
  schemaName: string;
  schema: z.ZodType<T>;
  system: string;
  /** `evidence` is the exact cache identity of the question: it must hold everything that shapes the answer. */
  build(packet: LlmPacket): { prompt: string; evidence: unknown };
}

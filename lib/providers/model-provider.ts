/**
 * A ModelProvider produces a response to a prompt. V1 ships only the ManualResponseProvider
 * (a human pastes a prewritten/example answer). A remote provider would run server-side only,
 * reading its API key from the server environment, and must never be imported by client code.
 */
export interface ProviderResult {
  provider: string;
  model_name: string;
  model_version: string;
  generation_settings: Record<string, string | number | boolean | null>;
  response_text: string;
  origin: "manual" | "provider" | "seed";
  generated_at: string | null;
}

export interface ModelProvider {
  readonly id: string;
  generate(input: { promptText: string } & Partial<ProviderResult>): Promise<ProviderResult>;
}

export class ManualResponseProvider implements ModelProvider {
  readonly id = "manual";
  constructor(private readonly origin: "manual" | "seed" = "manual") {}

  async generate(input: { promptText: string } & Partial<ProviderResult>): Promise<ProviderResult> {
    if (!input.response_text?.trim()) throw new Error("Manual provider requires response_text");
    return {
      provider: input.provider ?? "manual-entry",
      model_name: input.model_name ?? "unspecified",
      model_version: input.model_version ?? "unspecified",
      generation_settings: input.generation_settings ?? {},
      response_text: input.response_text,
      origin: this.origin,
      generated_at: input.generated_at ?? null,
    };
  }
}

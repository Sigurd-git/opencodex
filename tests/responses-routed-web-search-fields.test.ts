import { describe, expect, test } from "bun:test";
import { stripOpenAiOnlyWebSearchFields } from "../src/adapters/openai-responses";

// #2188 follow-up: routed Responses upstreams (xAI api.x.ai) 400 the WHOLE request on
// OpenAI-only web_search config fields (probe 2026-08-21: external_web_access and
// search_context_size each 400 individually; user_location and filters are accepted).
describe("stripOpenAiOnlyWebSearchFields", () => {
  test("removes the two fatal fields, keeps user_location/filters and other tools", () => {
    const body = { model: "grok-4.6", tools: [
      { type: "web_search", external_web_access: true, search_context_size: "medium", user_location: { type: "approximate" }, filters: { allowed_domains: ["x.ai"] } },
      { type: "function", name: "f" },
    ] };
    const out = stripOpenAiOnlyWebSearchFields(body) as { tools: Array<Record<string, unknown>> };
    expect(out.tools[0]).toEqual({ type: "web_search", user_location: { type: "approximate" }, filters: { allowed_domains: ["x.ai"] } });
    expect(out.tools[1]).toEqual({ type: "function", name: "f" });
  });

  test("web_search_preview covered; clean body returns the same reference", () => {
    const preview = { model: "m", tools: [{ type: "web_search_preview", external_web_access: false }] };
    const out = stripOpenAiOnlyWebSearchFields(preview) as { tools: Array<Record<string, unknown>> };
    expect(out.tools[0]).toEqual({ type: "web_search_preview" });
    const clean = { model: "m", tools: [{ type: "web_search" }] };
    expect(stripOpenAiOnlyWebSearchFields(clean)).toBe(clean);
  });
});

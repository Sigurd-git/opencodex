import { afterEach, describe, expect, mock, test } from "bun:test";
import * as storeModule from "../src/oauth/store";

let accountSets: Record<string, { accounts: Array<{ id: string; needsReauth?: boolean; credential?: Record<string, unknown> }>; activeAccountId?: string }> = {};
mock.module("../src/oauth/store", () => ({
  ...storeModule,
  getAccountSet: (provider: string) => accountSets[provider] ?? null,
}));

import { mapCcaGroundedResponse } from "../src/web-search/gemini-executor";
import { findGeminiSidecarProvider, planWebSearch } from "../src/web-search";
import { parseRequest } from "../src/responses/parser";
import type { OcxConfig, OcxProviderConfig } from "../src/types";

const routed: OcxProviderConfig = { adapter: "openai-chat", baseUrl: "https://routed.test/v1", apiKey: "k" };
const cca: OcxProviderConfig = { adapter: "google", baseUrl: "https://daily-cloudcode-pa.googleapis.com", authMode: "oauth" };

function config(overrides: Partial<OcxConfig> = {}): OcxConfig {
  return { port: 10100, defaultProvider: "routed", providers: { routed, "google-antigravity": cca }, ...overrides };
}
function parsedWithWebSearch() {
  return parseRequest({ model: "routed/model", input: "search", stream: true, tools: [{ type: "web_search" }] });
}
afterEach(() => { accountSets = {}; });

describe("mapCcaGroundedResponse (002 live capture shape)", () => {
  test("wrapped response -> text + deduped grounding sources", () => {
    const out = mapCcaGroundedResponse({ response: { candidates: [{
      content: { parts: [{ text: "Google announced " }, { text: "a device." }] },
      groundingMetadata: { webSearchQueries: ["q"], groundingChunks: [
        { web: { uri: "https://blog.google/a", title: "A" } },
        { web: { uri: "https://blog.google/a", title: "A dup" } },
        { web: { uri: "https://blog.google/b" } },
      ], groundingSupports: [{}] },
    }] } });
    expect(out.text).toBe("Google announced a device.");
    expect(out.sources).toEqual([{ url: "https://blog.google/a", title: "A" }, { url: "https://blog.google/b" }]);
    expect(out.error).toBeUndefined();
  });

  test("absent groundingMetadata -> empty sources; empty text -> error outcome", () => {
    const ok = mapCcaGroundedResponse({ candidates: [{ content: { parts: [{ text: "plain" }] } }] });
    expect(ok.sources).toEqual([]);
    expect(ok.error).toBeUndefined();
    const bad = mapCcaGroundedResponse({ candidates: [{ content: { parts: [] } }] });
    expect(bad.error).toContain("no text");
    expect(mapCcaGroundedResponse(null).error).toBeDefined();
    expect(mapCcaGroundedResponse({}).error).toContain("no candidates");
  });
});

describe("planWebSearch gemini arm (L8)", () => {
  const healthy = { accounts: [{ id: "a1", credential: { projectId: "proj-1" } }], activeAccountId: "a1" };

  test("explicit gemini + OAuth + projectId -> plan with geminiSidecar and 3.7-flash default", () => {
    accountSets = { "google-antigravity": healthy };
    const plan = planWebSearch(config({ webSearchSidecar: { backend: "gemini" } }), parsedWithWebSearch(), false, routed, "model", undefined);
    expect(plan?.backend).toBe("gemini");
    expect(plan?.geminiSidecar?.providerName).toBe("google-antigravity");
    expect(plan?.settings.model).toBe("gemini-3.7-flash");
  });

  test.each([
    ["no account set", {}],
    ["needsReauth", { "google-antigravity": { accounts: [{ id: "a1", needsReauth: true, credential: { projectId: "p" } }], activeAccountId: "a1" } }],
    ["missing projectId", { "google-antigravity": { accounts: [{ id: "a1", credential: {} }], activeAccountId: "a1" } }],
  ] as const)("%s -> fail closed (no plan)", (_name, sets) => {
    accountSets = sets as typeof accountSets;
    expect(planWebSearch(config({ webSearchSidecar: { backend: "gemini" } }), parsedWithWebSearch(), false, routed, "model", undefined)).toBeUndefined();
  });

  test("findGeminiSidecarProvider: disabled and key-auth providers fail", () => {
    accountSets = { "google-antigravity": healthy };
    expect(findGeminiSidecarProvider(config({ providers: { routed, "google-antigravity": { ...cca, disabled: true } } }))).toBeUndefined();
    expect(findGeminiSidecarProvider(config({ providers: { routed, "google-antigravity": { ...cca, authMode: "key", apiKey: "k" } } }))).toBeUndefined();
    expect(findGeminiSidecarProvider(config())?.providerName).toBe("google-antigravity");
  });
});

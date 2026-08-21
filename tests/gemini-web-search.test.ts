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

import { runGeminiWebSearch } from "../src/web-search/gemini-executor";
import * as oauthModule from "../src/oauth";
mock.module("../src/oauth", () => ({
  ...oauthModule,
  getValidAccessTokenSnapshot: async () => ({ accessToken: "gem-token-abc", expiresAt: Date.now() + 3600_000 }),
}));
import { runWithWebSearch, type WebSearchLoopDeps } from "../src/web-search/loop";
import { createTestTranslatorBudget } from "./helpers/translator-budget";
import type { AdapterEvent, ProviderAdapter } from "../src/adapters/base";

describe("runGeminiWebSearch request shape (review P1)", () => {
  test("malicious baseUrl ignored: registry destination, manual redirect, bearer + IDE UA, full envelope, thinkingConfig", async () => {
    accountSets = { "google-antigravity": { accounts: [{ id: "a1", credential: { projectId: "proj-9" } }], activeAccountId: "a1" } };
    const captured: Array<{ url: string; init: RequestInit }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(input instanceof Request ? input.url : input), init: init ?? {} });
      return new Response(JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: "ok" }] } }] } }), { status: 200 });
    }) as typeof fetch;
    try {
      const evil: OcxProviderConfig = { adapter: "google", baseUrl: "https://evil.example/v1", authMode: "oauth" };
      const out = await runGeminiWebSearch("q", "google-antigravity", evil, { model: "gemini-3.7-flash", reasoning: "low", timeoutMs: 5000, describeImages: false });
      expect(out.text).toBe("ok");
      expect(captured).toHaveLength(1);
      const req = captured[0]!;
      expect(new URL(req.url).origin).toBe("https://daily-cloudcode-pa.googleapis.com");
      expect(req.url).toContain("/v1internal:generateContent");
      expect(req.init.redirect).toBe("manual");
      const headers = req.init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer gem-token-abc");
      expect(headers["User-Agent"]).toContain("antigravity");
      const body = JSON.parse(String(req.init.body));
      expect(body.project).toBe("proj-9");
      expect(body.userAgent).toBe("antigravity");
      expect(body.requestType).toBe("agent");
      expect(body.request.tools).toEqual([{ google_search: {} }]);
      expect(typeof body.request.sessionId).toBe("string");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("loop dispatch: gemini arm fails closed without a sidecar (review P1)", () => {
  test("missing geminiSidecar yields the invariant error; forward executor and pool recorder untouched", async () => {
    const firstPass: AdapterEvent[] = [
      { type: "tool_call_start", id: "ws1", name: "web_search" },
      { type: "tool_call_delta", arguments: "{\"query\":\"docs\"}" },
      { type: "tool_call_end" },
      { type: "done" },
    ];
    let pass = 0;
    let sawToolResult = "";
    const adapter: ProviderAdapter = {
      name: "two-pass",
      buildRequest: (parsed) => {
        if (pass > 0) sawToolResult = JSON.stringify(parsed.context.messages ?? parsed);
        return { url: "https://routed.test/v1", method: "POST", headers: {}, body: "{}" };
      },
      fetchResponse: async () => new Response("wire", { status: 200 }),
      async *parseStream() {
        const events = pass++ === 0 ? firstPass : [{ type: "text_delta", text: "answer" } as AdapterEvent, { type: "done" } as AdapterEvent];
        for (const event of events) yield event;
      },
      async parseResponse() { throw new Error("unreachable"); },
    };
    const fetches: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => { fetches.push(String(input)); return new Response("{}", { status: 500 }); }) as typeof fetch;
    let poolRecorded = 0;
    try {
      const response = await runWithWebSearch({
        parsed: parseRequest({ model: "routed/model", input: "hi", stream: true, tools: [{ type: "web_search" }] }),
        adapter,
        backend: "gemini",
        hostedTool: { type: "web_search" },
        selectedForwardHeaders: new Headers({ authorization: "Bearer forward-secret" }),
        settings: { model: "gemini-3.7-flash", reasoning: "low", timeoutMs: 5000, describeImages: false },
        maxSearches: 1,
        recordSidecarOutcome: () => { poolRecorded += 1; },
        incomingMeta: { headers: new Headers(), translatorBudget: createTestTranslatorBudget() },
      } satisfies WebSearchLoopDeps);
      await new Response(response.body).text();
      expect(fetches).toEqual([]);
      expect(poolRecorded).toBe(0);
      expect(sawToolResult).toContain("without a resolved Antigravity provider");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

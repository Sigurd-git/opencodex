import { describe, expect, test } from "bun:test";
import { syncClaudeAgentDefsAtProxyStartup } from "../src/cli/claude-agent-startup-sync";
import type { OcxConfig } from "../src/types";

const config = (claudeCode: OcxConfig["claudeCode"] = {}): OcxConfig => ({
  providers: [],
  claudeCode,
} as OcxConfig);

describe("Claude agent roster proxy-start synchronization (#2200)", () => {
  test("uses the live proxy context-window map for an enabled roster", async () => {
    const calls: Array<{ port: number; windows?: Record<string, number> }> = [];
    const result = await syncClaudeAgentDefsAtProxyStartup(config(), 10100, {
      fetchContextWindows: async (_cfg, port) => {
        calls.push({ port });
        return { "google/gemini-3.7-flash": 1_000_000 };
      },
      injectAgentDefs: (_cfg, windows) => {
        calls.push({ port: 0, windows });
        return ["ocx-google-gemini-3-7-flash.md"];
      },
    });

    expect(result).toEqual(["ocx-google-gemini-3-7-flash.md"]);
    expect(calls).toEqual([
      { port: 10100 },
      { port: 0, windows: { "google/gemini-3.7-flash": 1_000_000 } },
    ]);
  });

  test("disabled integration prunes owned definitions without touching discovery", async () => {
    let fetched = false;
    let injected: Record<string, number> | undefined;
    const result = await syncClaudeAgentDefsAtProxyStartup(config({ injectAgents: false }), 10100, {
      fetchContextWindows: async () => {
        fetched = true;
        return { stale: 1_000_000 };
      },
      injectAgentDefs: (_cfg, windows) => {
        injected = windows;
        return [];
      },
    });

    expect(result).toEqual([]);
    expect(fetched).toBe(false);
    expect(injected).toEqual({});
  });

  test("catalog failure falls back to an unmarked best-effort roster", async () => {
    let injected: Record<string, number> | undefined;
    const result = await syncClaudeAgentDefsAtProxyStartup(config(), 10100, {
      fetchContextWindows: async () => { throw new Error("catalog unavailable"); },
      injectAgentDefs: (_cfg, windows) => {
        injected = windows;
        return ["ocx-self.md"];
      },
    });

    expect(result).toEqual(["ocx-self.md"]);
    expect(injected).toEqual({});
  });

  test("write failures are warned and never fail proxy startup", async () => {
    const warnings: string[] = [];
    const result = await syncClaudeAgentDefsAtProxyStartup(config(), 10100, {
      fetchContextWindows: async () => ({}),
      injectAgentDefs: () => { throw new Error("permission denied"); },
      warn: message => warnings.push(message),
    });

    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("permission denied");
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCodexAccountCredential } from "../src/codex/account-store";
import { clearAccountQuota, updateAccountQuota } from "../src/codex/auth-api";
import { clearCodexUpstreamHealth, clearThreadAccountMap } from "../src/codex/routing";
import { CODEX_FORWARD_BASE_URL } from "../src/providers/openai-tiers";
import { PLAINTEXT_V2_COLLABORATION_NAMESPACE } from "../src/responses/plaintext-v2-agent-messages";
import { clearResponseStateForTests } from "../src/responses/state";
import { handleResponses } from "../src/server/responses";
import type { OcxConfig } from "../src/types";

const originalFetch = globalThis.fetch;
beforeEach(() => { clearResponseStateForTests(); });
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearResponseStateForTests();
});

function config(enabled: boolean, snapshotRepair = false): OcxConfig {
  return {
    defaultProvider: "native",
    providers: {
      native: {
        adapter: "openai-responses",
        baseUrl: CODEX_FORWARD_BASE_URL,
        authMode: "forward",
        ...(snapshotRepair ? { responsesSnapshotRepair: true } : {}),
      },
    },
    plaintextV2AgentMessages: enabled,
  } as OcxConfig;
}

function collaborationRequest(options: {
  input?: unknown[];
  model?: string;
  previousResponseId?: string;
  toolChoice?: unknown;
} = {}): Request {
  return new Request("http://localhost/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: options.model ?? "native/gpt-5.6-sol",
      store: false,
      stream: true,
      input: options.input ?? [{
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "delegate" }],
      }],
      ...(options.previousResponseId ? { previous_response_id: options.previousResponseId } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [
          {
            type: "function",
            name: "spawn_agent",
            parameters: {
              type: "object",
              properties: { message: { type: "string", encrypted: true } },
              required: ["message"],
            },
          },
          { type: "function", name: "send_message", parameters: { type: "object" } },
        ],
      }],
    }),
  });
}

async function withPoolHome<T>(run: () => Promise<T>): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), "ocx-plaintext-v2-pool-"));
  const previousOpencodexHome = process.env.OPENCODEX_HOME;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.OPENCODEX_HOME = home;
  process.env.CODEX_HOME = home;
  clearCodexUpstreamHealth();
  clearThreadAccountMap();
  clearAccountQuota();
  try {
    return await run();
  } finally {
    clearCodexUpstreamHealth();
    clearThreadAccountMap();
    clearAccountQuota();
    rmSync(home, { recursive: true, force: true });
    if (previousOpencodexHome === undefined) delete process.env.OPENCODEX_HOME;
    else process.env.OPENCODEX_HOME = previousOpencodexHome;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
  }
}

function completedResponsePayload(id = "resp-plaintext-v2") {
  return {
    id,
    status: "completed",
    output: [{
      type: "function_call",
      call_id: "call-spawn",
      namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
      name: "start_delegated_task",
      arguments: JSON.stringify({ message: "plain assignment" }),
      encrypted_function_args: [],
    }],
  };
}

describe("plaintext v2 agent messages at the Responses server boundary", () => {
  test("rewrites the canonical request and restores every SSE response snapshot", async () => {
    const sentBodies: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBodies.push(typeof init?.body === "string" ? init.body : "");
      const response = completedResponsePayload();
      return new Response(
        `event: response.output_item.added\ndata: ${JSON.stringify({
          type: "response.output_item.added",
          output_index: 0,
          item: response.output[0],
        })}\n\nevent: response.function_call_arguments.done\ndata: ${JSON.stringify({
          type: "response.function_call_arguments.done",
          item_id: "fc-spawn",
          namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
          name: `${PLAINTEXT_V2_COLLABORATION_NAMESPACE}__start_delegated_task`,
          arguments: JSON.stringify({ message: "plain assignment" }),
          encrypted_function_args: [],
        })}\n\nevent: response.completed\ndata: ${JSON.stringify({
          type: "response.completed",
          response,
        })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const response = await handleResponses(
      collaborationRequest(),
      config(true),
      { model: "", provider: "" },
    );
    const clientBody = await response.text();
    const sentBody = JSON.parse(sentBodies[0]!) as {
      tools: Array<{
        name: string;
        tools: Array<{
          name: string;
          parameters: { properties: { message: Record<string, unknown> } };
        }>;
      }>;
    };

    expect(sentBodies).toHaveLength(1);
    expect(sentBody.tools[0]!.name).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(sentBody.tools[0]!.tools[0]!.name).toBe("start_delegated_task");
    expect(sentBody.tools[0]!.tools[0]!.parameters.properties.message.encrypted).toBeUndefined();
    expect(clientBody).not.toContain(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(clientBody).toContain('"namespace":"collaboration"');
    expect(clientBody).toContain('"name":"collaboration__spawn_agent"');
    expect(clientBody).toContain('"encrypted_function_args":[]');
  });

  test("restores the namespace in bounded JSON responses", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify(completedResponsePayload()), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

    const response = await handleResponses(
      collaborationRequest(),
      config(true),
      { model: "", provider: "" },
    );
    const clientBody = await response.text();

    expect(clientBody).not.toContain(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(clientBody).toContain('"namespace":"collaboration"');
    expect(clientBody).toContain('"encrypted_function_args":[]');
  });

  test("restores aliases after SSE snapshot repair copies request tools and tool choice", async () => {
    globalThis.fetch = (async () => {
      const response = completedResponsePayload("resp-snapshot-sse");
      return new Response(
        `event: response.completed\ndata: ${JSON.stringify({
          type: "response.completed",
          response,
        })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const response = await handleResponses(
      collaborationRequest({
        toolChoice: { type: "function", namespace: "collaboration", name: "spawn_agent" },
      }),
      config(true, true),
      { model: "", provider: "" },
    );
    const completedLine = (await response.text()).split("\n")
      .find(line => line.includes('"response.completed"'))!;
    const completed = JSON.parse(completedLine.replace(/^data: /, "")) as {
      response: {
        tool_choice: { namespace: string };
        tools: Array<{ name: string }>;
        output: Array<{ namespace: string; encrypted_function_args: unknown[] }>;
      };
    };

    expect(completed.response.tool_choice.namespace).toBe("collaboration");
    expect(completed.response.tools[0]!.name).toBe("collaboration");
    expect(completed.response.output[0]!.namespace).toBe("collaboration");
    expect(completed.response.output[0]!.encrypted_function_args).toEqual([]);
  });

  test("restores aliases after bounded JSON snapshot repair", async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify(completedResponsePayload("resp-snapshot-json")),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

    const response = await handleResponses(
      collaborationRequest({
        toolChoice: { type: "function", namespace: "collaboration", name: "spawn_agent" },
      }),
      config(true, true),
      { model: "", provider: "" },
    );
    const completed = await response.json() as {
      tool_choice: { namespace: string };
      tools: Array<{ name: string }>;
      output: Array<{ namespace: string; encrypted_function_args: unknown[] }>;
    };

    expect(completed.tool_choice.namespace).toBe("collaboration");
    expect(completed.tools[0]!.name).toBe("collaboration");
    expect(completed.output[0]!.namespace).toBe("collaboration");
    expect(completed.output[0]!.encrypted_function_args).toEqual([]);
  });

  test("keeps the marker and reserved namespace when the option is disabled", async () => {
    const sentBodies: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBodies.push(typeof init?.body === "string" ? init.body : "");
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;

    await handleResponses(collaborationRequest(), config(false), { model: "", provider: "" });
    const sentBody = JSON.parse(sentBodies[0]!) as {
      tools: Array<{ name: string; tools: Array<{ parameters: { properties: { message: Record<string, unknown> } } }> }>;
    };

    expect(sentBodies).toHaveLength(1);
    expect(sentBody.tools[0]!.name).toBe("collaboration");
    expect(sentBody.tools[0]!.tools[0]!.parameters.properties.message.encrypted).toBe(true);
  });

  test("keeps the whole request unchanged when tool-search history conflicts with the alias", async () => {
    const sentBodies: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBodies.push(typeof init?.body === "string" ? init.body : "");
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;

    await handleResponses(collaborationRequest({
      input: [{
        type: "tool_search_output",
        tools: [{
          type: "namespace",
          name: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
          tools: [],
        }],
      }],
    }), config(true), { model: "", provider: "" });

    const sent = JSON.parse(sentBodies[0]!) as {
      tools: Array<{
        name: string;
        tools: Array<{ parameters: { properties: { message: Record<string, unknown> } } }>;
      }>;
    };
    expect(sent.tools[0]!.name).toBe("collaboration");
    expect(sent.tools[0]!.tools[0]!.parameters.properties.message.encrypted).toBe(true);
  });

  test("rebuilds the plaintext alias after a canonical pool quota retry", async () => {
    await withPoolHome(async () => {
      const poolConfig = {
        defaultProvider: "openai",
        activeCodexAccountId: "pool-a",
        autoSwitchThreshold: 0,
        providers: {
          openai: {
            adapter: "openai-responses",
            baseUrl: CODEX_FORWARD_BASE_URL,
            authMode: "forward",
            codexAccountMode: "pool",
          },
        },
        codexAccounts: ["pool-a", "pool-b"].map(id => ({
          id,
          email: `${id}@example.test`,
          isMain: false,
          chatgptAccountId: `${id}_chatgpt`,
        })),
        plaintextV2AgentMessages: true,
      } as OcxConfig;
      for (const [index, id] of ["pool-a", "pool-b"].entries()) {
        saveCodexAccountCredential(id, {
          accessToken: `${id}-access-token`,
          refreshToken: `${id}-refresh-token`,
          expiresAt: Date.now() + 300_000,
          chatgptAccountId: `${id}_chatgpt`,
        });
        updateAccountQuota(id, 10 + index * 10);
      }

      const sentBodies: string[] = [];
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentBodies.push(typeof init?.body === "string" ? init.body : "");
        if (sentBodies.length === 1) {
          return Response.json({ error: { message: "rate limited" } }, {
            status: 429,
            headers: { "retry-after": "1" },
          });
        }
        return Response.json(completedResponsePayload("resp-pool-retry"));
      }) as typeof fetch;

      const response = await handleResponses(
        collaborationRequest({ model: "gpt-5.6-sol" }),
        poolConfig,
        { model: "", provider: "" },
      );
      const clientBody = await response.text();

      expect(sentBodies).toHaveLength(2);
      for (const body of sentBodies) {
        const sent = JSON.parse(body) as { tools: Array<{ name: string }> };
        expect(sent.tools[0]!.name).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
      }
      expect(clientBody).toContain('"namespace":"collaboration"');
      expect(clientBody).not.toContain(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    });
  });

  test("returns an over-limit response but does not retain its private alias for continuation", async () => {
    const sentBodies: string[] = [];
    let requestIndex = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBodies.push(typeof init?.body === "string" ? init.body : "");
      requestIndex += 1;
      const payload = requestIndex === 1
        ? {
          id: "resp-plaintext-v2-overflow",
          status: "completed",
          output: Array.from({ length: 10_001 }, (_, index) => ({
            type: "function_call",
            call_id: `call-${index}`,
            namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
            name: "start_delegated_task",
            arguments: "{}",
          })),
        }
        : { id: "resp-after-overflow", status: "completed", output: [] };
      return Response.json(payload);
    }) as typeof fetch;

    const first = await handleResponses(
      collaborationRequest(),
      config(true),
      { model: "", provider: "" },
    );
    const firstBody = await first.text();
    expect(first.status).toBe(200);
    expect(firstBody).toContain(PLAINTEXT_V2_COLLABORATION_NAMESPACE);

    const second = await handleResponses(
      collaborationRequest({
        previousResponseId: "resp-plaintext-v2-overflow",
        input: [{
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "continue" }],
        }],
      }),
      config(false),
      { model: "", provider: "" },
    );
    const secondBody = await second.text();
    expect({ status: second.status, body: secondBody, sends: sentBodies.length }).toEqual({
      status: 400,
      body: expect.stringContaining("continuation state is unavailable or expired"),
      sends: 1,
    });
  });

  test("stores the client namespace so disabling the option cannot replay the private alias", async () => {
    const sentBodies: string[] = [];
    let requestIndex = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBodies.push(typeof init?.body === "string" ? init.body : "");
      requestIndex += 1;
      const payload = requestIndex === 1
        ? completedResponsePayload("resp-toggle-plaintext-v2")
        : { id: "resp-after-toggle", status: "completed", output: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const first = await handleResponses(
      collaborationRequest(),
      config(true),
      { model: "", provider: "" },
    );
    await first.text();
    const second = await handleResponses(
      collaborationRequest({
        previousResponseId: "resp-toggle-plaintext-v2",
        input: [{ type: "function_call_output", call_id: "call-spawn", output: "done" }],
      }),
      config(false),
      { model: "", provider: "" },
    );
    await second.text();

    const replay = JSON.parse(sentBodies[1]!) as { input: Array<Record<string, unknown>> };
    const replayedCall = replay.input.find(item => item.type === "function_call");
    expect(replayedCall?.namespace).toBe("collaboration");
    expect(JSON.stringify(replay)).not.toContain(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
  });
});

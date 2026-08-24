import { describe, expect, test } from "bun:test";
import { createResponsesPassthroughAdapter as createResponsesPassthroughAdapterProduction } from "../src/adapters/openai-responses";
import {
  PLAINTEXT_V2_COLLABORATION_NAMESPACE,
  preparePlaintextV2AgentMessages,
  restorePlaintextV2AgentMessageCalls,
  restorePlaintextV2AgentMessageCallsInJson,
  shouldPreparePlaintextV2AgentMessages,
} from "../src/responses/plaintext-v2-agent-messages";
import { withTestTranslatorBudget } from "./helpers/translator-budget";

const createResponsesPassthroughAdapter = (...args: Parameters<typeof createResponsesPassthroughAdapterProduction>) =>
  withTestTranslatorBudget(createResponsesPassthroughAdapterProduction(...args));

function collaborationTool(name: string, encrypted: boolean = true): Record<string, unknown> {
  return {
    type: "function",
    name,
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          encrypted,
          const: { encrypted: true },
        },
        encrypted: { type: "boolean" },
      },
      required: ["message"],
    },
  };
}

describe("plaintext v2 agent message request preparation", () => {
  test("strips only the three message markers and aliases collaboration catalogs", () => {
    const body = {
      model: "gpt-5.6-sol",
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [
          collaborationTool("spawn_agent"),
          collaborationTool("send_message"),
          collaborationTool("followup_task", false),
          collaborationTool("wait_agent"),
        ],
      }],
      input: [{
        type: "additional_tools",
        tools: [{
          type: "namespace",
          name: "collaboration",
          tools: [collaborationTool("followup_task")],
        }],
      }],
    };
    const before = structuredClone(body);

    const prepared = preparePlaintextV2AgentMessages(body);
    const result = prepared.body as typeof body;
    const namespace = result.tools[0] as typeof body.tools[0];
    const spawn = namespace.tools[0] as ReturnType<typeof collaborationTool>;
    const send = namespace.tools[1] as ReturnType<typeof collaborationTool>;
    const followup = namespace.tools[2] as ReturnType<typeof collaborationTool>;
    const wait = namespace.tools[3] as ReturnType<typeof collaborationTool>;
    const additionalNamespace = result.input[0].tools[0] as {
      name: string;
      tools: Array<ReturnType<typeof collaborationTool>>;
    };
    const additional = additionalNamespace.tools[0]!;
    const message = (tool: Record<string, unknown>) => (
      ((tool.parameters as Record<string, unknown>).properties as Record<string, Record<string, unknown>>).message
    );

    expect(prepared.namespaceAliased).toBe(true);
    expect([...prepared.toolNames].sort()).toEqual([
      "followup_task",
      "send_message",
      "spawn_agent",
      "wait_agent",
    ]);
    expect(namespace.name).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(additionalNamespace.name).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(message(spawn).encrypted).toBeUndefined();
    expect(message(send).encrypted).toBeUndefined();
    expect(message(additional).encrypted).toBeUndefined();
    expect(message(followup).encrypted).toBe(false);
    expect(message(wait).encrypted).toBe(true);
    expect(message(spawn).const).toEqual({ encrypted: true });
    expect(((spawn.parameters as Record<string, unknown>).properties as Record<string, unknown>).encrypted)
      .toEqual({ type: "boolean" });
    expect(body).toEqual(before);
  });

  test("does not reinterpret a flat same-named function as the Codex v2 catalog", () => {
    const body = { tools: [collaborationTool("spawn_agent")] };
    const prepared = preparePlaintextV2AgentMessages(body);
    const tool = (prepared.body as typeof body).tools[0] as Record<string, unknown>;
    const message = ((tool.parameters as Record<string, unknown>).properties as Record<string, Record<string, unknown>>).message;

    expect(message.encrypted).toBe(true);
    expect(prepared.body).toBe(body);
    expect(prepared.namespaceAliased).toBe(false);
  });

  test("does not strip same-named tools from another namespace", () => {
    const body = {
      tools: [
        {
          type: "namespace",
          name: "collaboration",
          tools: [collaborationTool("spawn_agent")],
        },
        {
          type: "namespace",
          name: "private_mail",
          tools: [collaborationTool("send_message")],
        },
      ],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    const privateTool = (prepared.body as typeof body).tools[1]!.tools[0] as Record<string, unknown>;
    const privateMessage = ((privateTool.parameters as Record<string, unknown>).properties as Record<string, Record<string, unknown>>).message;

    expect(privateMessage.encrypted).toBe(true);
  });

  test("does not strip an independent flat tool beside a collaboration namespace", () => {
    const body = {
      tools: [
        {
          type: "namespace",
          name: "collaboration",
          tools: [collaborationTool("spawn_agent")],
        },
        collaborationTool("send_message"),
      ],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    const flatTool = (prepared.body as typeof body).tools[1] as Record<string, unknown>;
    const flatMessage = ((flatTool.parameters as Record<string, unknown>).properties as Record<string, Record<string, unknown>>).message;
    expect(flatMessage.encrypted).toBe(true);
  });

  test("aliases selectors and replayed calls with the rewritten collaboration catalog", () => {
    const replayedCall = {
      type: "function_call",
      call_id: "call-old",
      namespace: "collaboration",
      name: "spawn_agent",
      arguments: "{}",
    };
    const replayedOutput = {
      type: "function_call_output",
      call_id: "call-old",
      output: { namespace: "collaboration" },
    };
    const body = {
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [collaborationTool("spawn_agent"), collaborationTool("send_message")],
      }],
      tool_choice: {
        type: "allowed_tools",
        mode: "required",
        tools: [
          { type: "function", namespace: "collaboration", name: "send_message" },
          { type: "function", namespace: "private_mail", name: "send_message" },
        ],
      },
      input: [replayedCall, replayedOutput],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    const result = prepared.body as typeof body;

    expect(result.tools[0]!.name).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(result.tool_choice.tools[0]!.namespace).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(result.tool_choice.tools[1]!.namespace).toBe("private_mail");
    expect(result.input[0]!.namespace).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(result.input[1]).toEqual(replayedOutput);
  });

  test("aliases a forced collaboration tool choice", () => {
    const body = {
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [collaborationTool("spawn_agent"), collaborationTool("followup_task")],
      }],
      tool_choice: { type: "function", namespace: "collaboration", name: "followup_task" },
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    expect((prepared.body as typeof body).tool_choice.namespace)
      .toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
  });

  test("aliases both supported qualified-name forms using declared child names", () => {
    const body = {
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [collaborationTool("spawn_agent"), collaborationTool("send_message")],
      }],
      tool_choice: { type: "function", name: "collaboration__spawn_agent" },
      input: [{
        type: "function_call",
        call_id: "call-send",
        name: "collaboration.send_message",
        arguments: "{}",
      }],
    };

    const result = preparePlaintextV2AgentMessages(body).body as typeof body;
    expect(result.tool_choice.name).toBe(`${PLAINTEXT_V2_COLLABORATION_NAMESPACE}__spawn_agent`);
    expect(result.input[0]!.name).toBe(`${PLAINTEXT_V2_COLLABORATION_NAMESPACE}.send_message`);
  });

  test("aliases every duplicate collaboration declaration in one request", () => {
    const body = {
      tools: [
        {
          type: "namespace",
          name: "collaboration",
          tools: [collaborationTool("spawn_agent")],
        },
        {
          type: "namespace",
          name: "collaboration",
          tools: [{ type: "function", name: "wait_agent", parameters: { type: "object" } }],
        },
      ],
      tool_choice: { type: "function", namespace: "collaboration", name: "wait_agent" },
    };

    const result = preparePlaintextV2AgentMessages(body).body as typeof body;
    expect(result.tools.map(tool => tool.name)).toEqual([
      PLAINTEXT_V2_COLLABORATION_NAMESPACE,
      PLAINTEXT_V2_COLLABORATION_NAMESPACE,
    ]);
    expect(result.tool_choice.namespace).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
  });

  test("does not reinterpret an independent flattened-looking tool name", () => {
    const body = {
      tools: [
        {
          type: "namespace",
          name: "collaboration",
          tools: [collaborationTool("spawn_agent")],
        },
        { type: "function", name: "collaboration__audit", parameters: { type: "object" } },
      ],
      tool_choice: {
        type: "allowed_tools",
        tools: [{ type: "function", name: "collaboration__audit" }],
      },
      input: [{
        type: "function_call",
        call_id: "call-audit",
        name: "collaboration__audit",
        arguments: "{}",
      }],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    const result = prepared.body as typeof body;
    expect(result.tool_choice.tools[0]!.name).toBe("collaboration__audit");
    expect(result.input[0]!.name).toBe("collaboration__audit");
  });

  test("skips aliasing when a flat declaration collides with a namespace child", () => {
    const body = {
      tools: [
        {
          type: "namespace",
          name: "collaboration",
          tools: [collaborationTool("spawn_agent")],
        },
        { type: "function", name: "collaboration__spawn_agent", parameters: { type: "object" } },
      ],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    expect(prepared.body).toBe(body);
    expect(prepared.namespaceAliased).toBe(false);
  });

  test("aliases a recognized collaboration catalog even when the marker is already absent", () => {
    const body = {
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [collaborationTool("spawn_agent", false)],
      }],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    expect((prepared.body as typeof body).tools[0]!.name)
      .toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(prepared.namespaceAliased).toBe(true);
  });

  test("leaves the whole request untouched when the private alias already exists", () => {
    const body = {
      tools: [
        { type: "namespace", name: PLAINTEXT_V2_COLLABORATION_NAMESPACE, tools: [] },
        {
          type: "namespace",
          name: "collaboration",
          tools: [collaborationTool("spawn_agent")],
        },
      ],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    expect(prepared.body).toBe(body);
    expect(prepared.namespaceAliased).toBe(false);
    expect(JSON.stringify(prepared.body)).toContain('"encrypted":true');
  });

  test("leaves the request untouched when replay history already uses the private alias", () => {
    const body = {
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [collaborationTool("spawn_agent")],
      }],
      input: [{
        type: "function_call",
        call_id: "call-private",
        namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
        name: "audit",
        arguments: "{}",
      }],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    expect(prepared.body).toBe(body);
    expect(prepared.namespaceAliased).toBe(false);
  });

  test("leaves the request untouched when tool-search history declares the private alias", () => {
    const body = {
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [collaborationTool("spawn_agent")],
      }],
      input: [{
        type: "tool_search_output",
        tools: [{
          type: "namespace",
          name: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
          tools: [],
        }],
      }],
    };

    const prepared = preparePlaintextV2AgentMessages(body);
    expect(prepared.body).toBe(body);
    expect(prepared.namespaceAliased).toBe(false);
  });

  test("does not treat a collaboration namespace nested under another namespace as Codex v2", () => {
    const depth = 20_000;
    const collaboration = {
      type: "namespace",
      name: "collaboration",
      tools: [collaborationTool("spawn_agent")],
    } as Record<string, unknown>;
    let root: Record<string, unknown> = collaboration;
    for (let index = 0; index < depth; index++) {
      root = { type: "namespace", name: `nest-${index}`, tools: [root] };
    }

    const prepared = preparePlaintextV2AgentMessages({ tools: [root] });
    expect(prepared.namespaceAliased).toBe(false);
  });
});

describe("plaintext v2 agent message response restoration", () => {
  const declaredToolNames = new Set(["spawn_agent", "send_message"]);

  test("restores tool identities and preserves the plaintext proof and user data", () => {
    const payload = JSON.stringify({
      type: "response.completed",
      response: {
        tool_choice: {
          type: "function",
          namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
          name: "spawn_agent",
        },
        tools: [{
          type: "namespace",
          name: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
          tools: [],
        }],
        output: [
          {
            type: "function_call",
            namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
            name: "spawn_agent",
            arguments: JSON.stringify({
              message: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
            }),
            encrypted_function_args: [],
          },
          {
            type: "function_call",
            name: `${PLAINTEXT_V2_COLLABORATION_NAMESPACE}__send_message`,
            arguments: "{}",
            encrypted_function_args: [],
          },
          {
            type: "function_call_output",
            output: { namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE },
          },
        ],
      },
    });

    const restored = JSON.parse(
      restorePlaintextV2AgentMessageCallsInJson(payload, declaredToolNames),
    ) as {
      response: {
        tool_choice: Record<string, unknown>;
        tools: Array<Record<string, unknown>>;
        output: Array<Record<string, unknown>>;
      };
    };
    const [namespaced, flattened, toolOutput] = restored.response.output;

    expect(namespaced!.namespace).toBe("collaboration");
    expect(namespaced!.name).toBe("spawn_agent");
    expect(namespaced!.encrypted_function_args).toEqual([]);
    expect(JSON.parse(namespaced!.arguments as string).message)
      .toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(flattened!.name).toBe("collaboration__send_message");
    expect(flattened!.encrypted_function_args).toEqual([]);
    expect(toolOutput!.output).toEqual({ namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE });
    expect(restored.response.tool_choice.namespace).toBe("collaboration");
    expect(restored.response.tools[0]!.name).toBe("collaboration");
  });

  test("restores the identity on streamed function-call argument completion", () => {
    const payload = JSON.stringify({
      type: "response.function_call_arguments.done",
      item_id: "fc-spawn",
      namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
      name: `${PLAINTEXT_V2_COLLABORATION_NAMESPACE}__spawn_agent`,
      arguments: JSON.stringify({ message: PLAINTEXT_V2_COLLABORATION_NAMESPACE }),
      encrypted_function_args: [],
    });

    const restored = JSON.parse(
      restorePlaintextV2AgentMessageCallsInJson(payload, declaredToolNames),
    ) as Record<string, unknown>;
    expect(restored.namespace).toBe("collaboration");
    expect(restored.name).toBe("collaboration__spawn_agent");
    expect(JSON.parse(restored.arguments as string).message)
      .toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(restored.encrypted_function_args).toEqual([]);
  });

  test("is byte-identical for invalid JSON and payloads without the private alias", () => {
    for (const payload of ["not json", '{"type":"response.completed"}']) {
      expect(restorePlaintextV2AgentMessageCallsInJson(payload, declaredToolNames)).toBe(payload);
    }
  });

  test("leaves undeclared aliases and nested extension metadata untouched", () => {
    const extensionCall = {
      type: "function_call",
      namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
      name: "spawn_agent",
    };
    const payload = JSON.stringify({
      type: "response.completed",
      response: {
        output: [
          {
            type: "function_call",
            namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
            name: "audit",
            arguments: "{}",
          },
          {
            type: "function_call",
            namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
            name: "spawn_agent",
            arguments: "{}",
          },
        ],
        metadata: {
          nested: extensionCall,
          values: Array.from({ length: 20_000 }, (_, index) => index),
        },
      },
    });

    const restored = JSON.parse(
      restorePlaintextV2AgentMessageCallsInJson(payload, declaredToolNames),
    ) as {
      response: {
        output: Array<Record<string, unknown>>;
        metadata: { nested: Record<string, unknown>; values: number[] };
      };
    };

    expect(restored.response.output[0]!.namespace).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(restored.response.output[1]!.namespace).toBe("collaboration");
    expect(restored.response.metadata.nested).toEqual(extensionCall);
    expect(restored.response.metadata.values).toHaveLength(20_000);
  });

  test("fails closed when known identity arrays exceed the work limit", () => {
    const value = {
      output: Array.from({ length: 10_001 }, () => ({
        type: "function_call",
        namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
        name: "spawn_agent",
      })),
    };
    const payload = JSON.stringify(value);

    expect(restorePlaintextV2AgentMessageCallsInJson(payload, declaredToolNames)).toBe(payload);
    expect(restorePlaintextV2AgentMessageCalls(value, declaredToolNames)).toEqual({
      value,
      changed: false,
      overflowed: true,
    });
  });
});

describe("plaintext v2 agent message route policy", () => {
  test("requires an explicit opt-in, Responses inbound, canonical ChatGPT, and a v2 catalog", () => {
    const requestBody = {
      input: [{
        type: "additional_tools",
        tools: [{
          type: "namespace",
          name: "collaboration",
          tools: [collaborationTool("spawn_agent")],
        }],
      }],
    };
    const baseline = {
      enabled: true,
      inboundWire: "responses",
      canonicalChatGpt: true,
      requestBody,
    };
    expect(shouldPreparePlaintextV2AgentMessages(baseline)).toBe(true);
    expect(shouldPreparePlaintextV2AgentMessages({ ...baseline, enabled: false })).toBe(false);
    expect(shouldPreparePlaintextV2AgentMessages({ ...baseline, inboundWire: "anthropic" })).toBe(false);
    expect(shouldPreparePlaintextV2AgentMessages({ ...baseline, canonicalChatGpt: false })).toBe(false);
    expect(shouldPreparePlaintextV2AgentMessages({
      ...baseline,
      requestBody: { tools: [collaborationTool("spawn_agent")] },
    })).toBe(false);
  });
});

describe("canonical Responses adapter plaintext v2 integration", () => {
  const provider = {
    adapter: "openai-responses",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    authMode: "forward" as const,
  };

  function build(enabled: boolean) {
    const rawBody = {
      model: "gpt-5.6-sol",
      store: false,
      stream: true,
      input: "delegate",
      tools: [{
        type: "namespace",
        name: "collaboration",
        tools: [collaborationTool("spawn_agent")],
      }],
    };
    const request = createResponsesPassthroughAdapter(provider).buildRequest({
      modelId: "gpt-5.6-sol",
      context: { messages: [] },
      stream: true,
      options: {},
      _rawBody: rawBody,
      ...(enabled ? { _plaintextV2AgentMessages: true } : {}),
    }, { headers: new Headers({ authorization: "Bearer test" }) });
    return { request, rawBody };
  }

  test("changes only the serialized upstream body when enabled", () => {
    const { request, rawBody } = build(true);
    const sent = JSON.parse(request.body) as typeof rawBody;
    const namespace = sent.tools[0]!;
    const spawn = namespace.tools[0] as Record<string, unknown>;
    const message = ((spawn.parameters as Record<string, unknown>).properties as Record<string, Record<string, unknown>>).message;

    expect(namespace.name).toBe(PLAINTEXT_V2_COLLABORATION_NAMESPACE);
    expect(message.encrypted).toBeUndefined();
    expect([...(request.plaintextV2AgentMessageToolNames ?? [])]).toEqual(["spawn_agent"]);
    expect(rawBody.tools[0]!.name).toBe("collaboration");
    expect(JSON.stringify(rawBody)).toContain('"encrypted":true');
  });

  test("keeps the upstream collaboration schema unchanged when disabled", () => {
    const { request, rawBody } = build(false);
    const sent = JSON.parse(request.body);

    expect(sent).toEqual(rawBody);
    expect(request.plaintextV2AgentMessageToolNames).toBeUndefined();
  });
});

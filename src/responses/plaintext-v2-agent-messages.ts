const COLLABORATION_NAMESPACE = "collaboration";
export const PLAINTEXT_V2_COLLABORATION_NAMESPACE = "collaboration-optimize";
const COLLABORATION_NAME_PREFIX = `${COLLABORATION_NAMESPACE}__`;
const COLLABORATION_DOTTED_NAME_PREFIX = `${COLLABORATION_NAMESPACE}.`;
const PLAINTEXT_V2_COLLABORATION_NAME_PREFIX = `${PLAINTEXT_V2_COLLABORATION_NAMESPACE}__`;
const PLAINTEXT_V2_COLLABORATION_DOTTED_NAME_PREFIX = `${PLAINTEXT_V2_COLLABORATION_NAMESPACE}.`;

const PLAINTEXT_V2_AGENT_MESSAGE_TOOLS = new Set([
  "spawn_agent",
  "send_message",
  "followup_task",
]);

const PLAINTEXT_V2_AGENT_MESSAGE_TOOL_ALIASES = new Map<string, string>([
  ["spawn_agent", "start_delegated_task"],
  ["send_message", "deliver_delegated_message"],
  ["followup_task", "continue_delegated_task"],
]);

const PLAINTEXT_V2_AGENT_MESSAGE_TOOL_NAMES = new Map<string, string>(
  [...PLAINTEXT_V2_AGENT_MESSAGE_TOOL_ALIASES].map(([name, alias]) => [alias, name]),
);

export function shouldPreparePlaintextV2AgentMessages(args: {
  enabled: boolean;
  inboundWire: string;
  canonicalChatGpt: boolean;
  requestBody: unknown;
}): boolean {
  return args.enabled
    && args.inboundWire === "responses"
    && args.canonicalChatGpt
    && hasPlaintextV2CollaborationCatalog(args.requestBody);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function responseToolCatalogs(body: Record<string, unknown>): unknown[][] {
  const catalogs: unknown[][] = [];
  if (Array.isArray(body.tools)) catalogs.push(body.tools);
  if (!Array.isArray(body.input)) return catalogs;
  for (const item of body.input) {
    if (
      isPlainObject(item)
      && item.type === "additional_tools"
      && Array.isArray(item.tools)
    ) {
      catalogs.push(item.tools);
    }
  }
  return catalogs;
}

function collaborationCatalogInfo(catalogs: readonly unknown[][]): {
  hasV2Catalog: boolean;
  toolNames: Set<string>;
} {
  let hasV2Catalog = false;
  const toolNames = new Set<string>();
  for (const tools of catalogs) {
    for (const tool of tools) {
      if (
        !isPlainObject(tool)
        || tool.type !== "namespace"
        || tool.name !== COLLABORATION_NAMESPACE
        || !Array.isArray(tool.tools)
      ) {
        continue;
      }
      for (const child of tool.tools) {
        if (
          isPlainObject(child)
          && (child.type === "function" || child.type === "custom")
          && typeof child.name === "string"
        ) {
          toolNames.add(child.name);
          if (child.type === "function" && child.name === "spawn_agent") hasV2Catalog = true;
        }
      }
    }
  }
  return { hasV2Catalog, toolNames };
}

export function hasPlaintextV2CollaborationCatalog(body: unknown): boolean {
  if (!isPlainObject(body)) return false;
  return collaborationCatalogInfo(responseToolCatalogs(body)).hasV2Catalog;
}

function hasOptimizedNamespaceConflict(catalogs: readonly unknown[][]): boolean {
  const pending = [...catalogs];
  while (pending.length > 0) {
    const tools = pending.pop()!;
    for (const tool of tools) {
      if (!isPlainObject(tool)) continue;
      if (
        typeof tool.name === "string"
        && (
          tool.name === PLAINTEXT_V2_COLLABORATION_NAMESPACE
          || tool.name.startsWith(PLAINTEXT_V2_COLLABORATION_NAME_PREFIX)
          || tool.name.startsWith(PLAINTEXT_V2_COLLABORATION_DOTTED_NAME_PREFIX)
        )
      ) {
        return true;
      }
      if (tool.type === "namespace" && Array.isArray(tool.tools)) pending.push(tool.tools);
    }
  }
  return false;
}

function isToolIdentity(value: Record<string, unknown>): boolean {
  return value.type === "function"
    || value.type === "custom"
    || value.type === "function_call"
    || value.type === "custom_tool_call";
}

function isOptimizedToolIdentity(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (
    isToolIdentity(value)
    && (
      value.namespace === PLAINTEXT_V2_COLLABORATION_NAMESPACE
      || (
        typeof value.name === "string"
        && (
          value.name === PLAINTEXT_V2_COLLABORATION_NAMESPACE
          || value.name.startsWith(PLAINTEXT_V2_COLLABORATION_NAME_PREFIX)
          || value.name.startsWith(PLAINTEXT_V2_COLLABORATION_DOTTED_NAME_PREFIX)
        )
      )
    )
  ) {
    return true;
  }
  return value.type === "namespace" && value.name === PLAINTEXT_V2_COLLABORATION_NAMESPACE;
}

function hasOptimizedReferenceConflict(body: Record<string, unknown>): boolean {
  if (isOptimizedToolIdentity(body.tool_choice)) return true;
  if (
    isPlainObject(body.tool_choice)
    && Array.isArray(body.tool_choice.tools)
    && body.tool_choice.tools.some(isOptimizedToolIdentity)
  ) {
    return true;
  }
  if (!Array.isArray(body.input)) return false;
  return body.input.some(item => (
    isPlainObject(item)
    && (item.type === "function_call" || item.type === "custom_tool_call")
    && isOptimizedToolIdentity(item)
  ));
}

function hasToolSearchCollaborationConflict(body: Record<string, unknown>): boolean {
  if (!Array.isArray(body.input)) return false;
  for (const item of body.input) {
    if (!isPlainObject(item) || item.type !== "tool_search_output" || !Array.isArray(item.tools)) {
      continue;
    }
    const pending = [item.tools];
    while (pending.length > 0) {
      const tools = pending.pop()!;
      for (const tool of tools) {
        if (!isPlainObject(tool)) continue;
        if (
          typeof tool.name === "string"
          && (tool.name === COLLABORATION_NAMESPACE
            || tool.name === PLAINTEXT_V2_COLLABORATION_NAMESPACE
            || tool.name.startsWith(COLLABORATION_NAME_PREFIX)
              || tool.name.startsWith(COLLABORATION_DOTTED_NAME_PREFIX)
              || tool.name.startsWith(PLAINTEXT_V2_COLLABORATION_NAME_PREFIX)
            || tool.name.startsWith(PLAINTEXT_V2_COLLABORATION_DOTTED_NAME_PREFIX))
        ) {
          return true;
        }
        if (tool.type === "namespace" && Array.isArray(tool.tools)) pending.push(tool.tools);
      }
    }
  }
  return false;
}

function hasAgentMessageEncryptionMarker(tool: Record<string, unknown>): boolean {
  return tool.type === "function"
    && typeof tool.name === "string"
    && PLAINTEXT_V2_AGENT_MESSAGE_TOOLS.has(tool.name)
    && isPlainObject(tool.parameters)
    && isPlainObject(tool.parameters.properties)
    && isPlainObject(tool.parameters.properties.message)
    && tool.parameters.properties.message.encrypted === true;
}

function rewriteAgentMessageToolDeclaration(tool: Record<string, unknown>): Record<string, unknown> {
  const alias = tool.type === "function" && typeof tool.name === "string"
    ? PLAINTEXT_V2_AGENT_MESSAGE_TOOL_ALIASES.get(tool.name)
    : undefined;
  if (!alias) return tool;

  let rewritten: Record<string, unknown> = { ...tool, name: alias };
  if (
    hasAgentMessageEncryptionMarker(tool)
    && isPlainObject(tool.parameters)
    && isPlainObject(tool.parameters.properties)
    && isPlainObject(tool.parameters.properties.message)
  ) {
    const { encrypted: _encrypted, ...messageSchema } = tool.parameters.properties.message;
    rewritten = {
      ...rewritten,
      parameters: {
        ...tool.parameters,
        properties: {
          ...tool.parameters.properties,
          message: messageSchema,
        },
      },
    };
  }
  return rewritten;
}

function hasAgentMessageToolAliasCatalogConflict(catalogs: readonly unknown[][]): boolean {
  for (const tools of catalogs) {
    for (const tool of tools) {
      if (
        !isPlainObject(tool)
        || tool.type !== "namespace"
        || tool.name !== COLLABORATION_NAMESPACE
        || !Array.isArray(tool.tools)
      ) {
        continue;
      }
      if (tool.tools.some(child => (
        isPlainObject(child)
        && typeof child.name === "string"
        && PLAINTEXT_V2_AGENT_MESSAGE_TOOL_NAMES.has(child.name)
      ))) {
        return true;
      }
    }
  }
  return false;
}

function hasAgentMessageToolAliasReference(value: unknown): boolean {
  if (!isPlainObject(value) || !isToolIdentity(value) || typeof value.name !== "string") {
    return false;
  }
  if (
    value.namespace === COLLABORATION_NAMESPACE
    && PLAINTEXT_V2_AGENT_MESSAGE_TOOL_NAMES.has(value.name)
  ) {
    return true;
  }
  for (const prefix of [COLLABORATION_NAME_PREFIX, COLLABORATION_DOTTED_NAME_PREFIX]) {
    if (
      value.name.startsWith(prefix)
      && PLAINTEXT_V2_AGENT_MESSAGE_TOOL_NAMES.has(value.name.slice(prefix.length))
    ) {
      return true;
    }
  }
  return false;
}

function hasAgentMessageToolAliasReferenceConflict(body: Record<string, unknown>): boolean {
  if (hasAgentMessageToolAliasReference(body.tool_choice)) return true;
  if (
    isPlainObject(body.tool_choice)
    && Array.isArray(body.tool_choice.tools)
    && body.tool_choice.tools.some(hasAgentMessageToolAliasReference)
  ) {
    return true;
  }
  if (!Array.isArray(body.input)) return false;
  return body.input.some(item => (
    isPlainObject(item)
    && (item.type === "function_call" || item.type === "custom_tool_call")
    && hasAgentMessageToolAliasReference(item)
  ));
}

function hasFlattenedCollaborationDeclarationConflict(
  catalogs: readonly unknown[][],
  collaborationToolNames: ReadonlySet<string>,
): boolean {
  const qualifiedNames = new Set(
    [...collaborationToolNames].flatMap(name => [
      `${COLLABORATION_NAME_PREFIX}${name}`,
      `${COLLABORATION_DOTTED_NAME_PREFIX}${name}`,
    ]),
  );
  const pending = catalogs.map(tools => ({ tools, collaborationNamespace: false }));
  while (pending.length > 0) {
    const { tools, collaborationNamespace } = pending.pop()!;
    for (const tool of tools) {
      if (!isPlainObject(tool)) continue;
      if (
        !collaborationNamespace
        && (tool.type === "function" || tool.type === "custom")
        && typeof tool.name === "string"
        && qualifiedNames.has(tool.name)
      ) {
        return true;
      }
      if (tool.type === "namespace" && Array.isArray(tool.tools)) {
        pending.push({
          tools: tool.tools,
          collaborationNamespace: tool.name === COLLABORATION_NAMESPACE,
        });
      }
    }
  }
  return false;
}

function rewriteToolCatalog(tools: unknown[]): {
  tools: unknown[];
  namespaceAliased: boolean;
} {
  let namespaceAliased = false;
  let changed = false;
  const rewritten = tools.map(tool => {
    if (
      !isPlainObject(tool)
      || tool.type !== "namespace"
      || tool.name !== COLLABORATION_NAMESPACE
      || !Array.isArray(tool.tools)
    ) {
      return tool;
    }
    const childTools = tool.tools.map(child => (
      isPlainObject(child) ? rewriteAgentMessageToolDeclaration(child) : child
    ));
    namespaceAliased = true;
    changed = true;
    return {
      ...tool,
      name: PLAINTEXT_V2_COLLABORATION_NAMESPACE,
      tools: childTools,
    };
  });
  return { tools: changed ? rewritten : tools, namespaceAliased };
}

function aliasCollaborationReference(
  value: unknown,
  collaborationToolNames: ReadonlySet<string>,
): unknown {
  if (!isPlainObject(value)) return value;
  const type = value.type;
  const canCarryNamespace = isToolIdentity(value);
  let rewritten = value;
  if (canCarryNamespace && value.namespace === COLLABORATION_NAMESPACE) {
    const name = (type === "function" || type === "function_call") && typeof value.name === "string"
      ? PLAINTEXT_V2_AGENT_MESSAGE_TOOL_ALIASES.get(value.name) ?? value.name
      : value.name;
    rewritten = { ...rewritten, namespace: PLAINTEXT_V2_COLLABORATION_NAMESPACE, name };
  }
  if (type === "namespace" && value.name === COLLABORATION_NAMESPACE) {
    rewritten = { ...rewritten, name: PLAINTEXT_V2_COLLABORATION_NAMESPACE };
  } else if (
    canCarryNamespace
    && typeof value.name === "string"
    && value.name.startsWith(COLLABORATION_NAME_PREFIX)
    && collaborationToolNames.has(value.name.slice(COLLABORATION_NAME_PREFIX.length))
  ) {
    const childName = value.name.slice(COLLABORATION_NAME_PREFIX.length);
    rewritten = {
      ...rewritten,
      name: `${PLAINTEXT_V2_COLLABORATION_NAME_PREFIX}${
        (type === "function" || type === "function_call")
          ? PLAINTEXT_V2_AGENT_MESSAGE_TOOL_ALIASES.get(childName) ?? childName
          : childName
      }`,
    };
  } else if (
    canCarryNamespace
    && typeof value.name === "string"
    && value.name.startsWith(COLLABORATION_DOTTED_NAME_PREFIX)
    && collaborationToolNames.has(value.name.slice(COLLABORATION_DOTTED_NAME_PREFIX.length))
  ) {
    const childName = value.name.slice(COLLABORATION_DOTTED_NAME_PREFIX.length);
    rewritten = {
      ...rewritten,
      name: `${PLAINTEXT_V2_COLLABORATION_DOTTED_NAME_PREFIX}${
        (type === "function" || type === "function_call")
          ? PLAINTEXT_V2_AGENT_MESSAGE_TOOL_ALIASES.get(childName) ?? childName
          : childName
      }`,
    };
  }
  return rewritten;
}

function aliasCollaborationToolChoice(
  toolChoice: unknown,
  collaborationToolNames: ReadonlySet<string>,
): unknown {
  if (!isPlainObject(toolChoice)) return toolChoice;
  let rewritten = aliasCollaborationReference(
    toolChoice,
    collaborationToolNames,
  ) as Record<string, unknown>;
  if (!Array.isArray(toolChoice.tools)) return rewritten;
  let toolsChanged = false;
  const tools = toolChoice.tools.map(tool => {
    const aliased = aliasCollaborationReference(tool, collaborationToolNames);
    toolsChanged ||= aliased !== tool;
    return aliased;
  });
  if (toolsChanged) rewritten = { ...rewritten, tools };
  return rewritten;
}

/**
 * Prepare v2 collaboration tools for plaintext messages on the canonical ChatGPT wire.
 *
 * ChatGPT reserves both `collaboration` and the three message-tool names. The request therefore
 * uses fixed, request-scoped aliases for both, then restores every identity before Codex sees it.
 */
export function preparePlaintextV2AgentMessages(body: unknown): {
  body: unknown;
  namespaceAliased: boolean;
  toolNames: ReadonlySet<string>;
} {
  if (!isPlainObject(body)) return { body, namespaceAliased: false, toolNames: new Set() };
  const catalogs = responseToolCatalogs(body);
  const catalogInfo = collaborationCatalogInfo(catalogs);
  if (
    !catalogInfo.hasV2Catalog
    || hasOptimizedNamespaceConflict(catalogs)
    || hasOptimizedReferenceConflict(body)
    || hasToolSearchCollaborationConflict(body)
    || hasFlattenedCollaborationDeclarationConflict(catalogs, catalogInfo.toolNames)
    || hasAgentMessageToolAliasCatalogConflict(catalogs)
    || hasAgentMessageToolAliasReferenceConflict(body)
  ) {
    return { body, namespaceAliased: false, toolNames: new Set() };
  }

  let namespaceAliased = false;
  let tools = body.tools;
  if (Array.isArray(body.tools)) {
    const rewritten = rewriteToolCatalog(body.tools);
    tools = rewritten.tools;
    namespaceAliased ||= rewritten.namespaceAliased;
  }

  let input = body.input;
  if (Array.isArray(body.input)) {
    let inputChanged = false;
    const rewrittenInput = body.input.map(item => {
      if (
        !isPlainObject(item)
        || item.type !== "additional_tools"
        || !Array.isArray(item.tools)
      ) {
        return item;
      }
      const rewritten = rewriteToolCatalog(item.tools);
      namespaceAliased ||= rewritten.namespaceAliased;
      if (rewritten.tools === item.tools) return item;
      inputChanged = true;
      return { ...item, tools: rewritten.tools };
    });
    if (inputChanged) input = rewrittenInput;
  }

  let toolChoice = body.tool_choice;
  if (namespaceAliased) {
    toolChoice = aliasCollaborationToolChoice(body.tool_choice, catalogInfo.toolNames);
    if (Array.isArray(input)) {
      let inputChanged = false;
      const aliasedInput = input.map(item => {
        if (!isPlainObject(item)) return item;
        if (item.type !== "function_call" && item.type !== "custom_tool_call") return item;
        const aliased = aliasCollaborationReference(item, catalogInfo.toolNames);
        inputChanged ||= aliased !== item;
        return aliased;
      });
      if (inputChanged) input = aliasedInput;
    }
  }

  if (!namespaceAliased || (tools === body.tools && input === body.input && toolChoice === body.tool_choice)) {
    return { body, namespaceAliased: false, toolNames: new Set() };
  }
  return {
    body: {
      ...body,
      ...(tools !== body.tools ? { tools } : {}),
      ...(input !== body.input ? { input } : {}),
      ...(toolChoice !== body.tool_choice ? { tool_choice: toolChoice } : {}),
    },
    namespaceAliased,
    toolNames: new Set(catalogInfo.toolNames),
  };
}

const MAX_RESTORED_TOOL_IDENTITIES = 10_000;

type RestoreOutcome = {
  value: unknown;
  changed: boolean;
  overflow: boolean;
};

type RestoreContext = {
  toolNames: ReadonlySet<string>;
  remainingIdentities: number;
};

const unchanged = (value: unknown): RestoreOutcome => ({ value, changed: false, overflow: false });

function reserveIdentities(context: RestoreContext, count: number): boolean {
  if (count > context.remainingIdentities) return false;
  context.remainingIdentities -= count;
  return true;
}

function declaredChildName(
  name: unknown,
  toolNames: ReadonlySet<string>,
  allowAgentMessageAlias: boolean,
): string | undefined {
  if (typeof name !== "string") return undefined;
  if (toolNames.has(name)) return name;
  if (allowAgentMessageAlias) {
    const restoredName = PLAINTEXT_V2_AGENT_MESSAGE_TOOL_NAMES.get(name);
    if (restoredName && toolNames.has(restoredName)) return restoredName;
  }
  for (const prefix of [
    PLAINTEXT_V2_COLLABORATION_NAME_PREFIX,
    PLAINTEXT_V2_COLLABORATION_DOTTED_NAME_PREFIX,
  ]) {
    if (!name.startsWith(prefix)) continue;
    const childName = name.slice(prefix.length);
    const restoredChildName = allowAgentMessageAlias
      ? PLAINTEXT_V2_AGENT_MESSAGE_TOOL_NAMES.get(childName) ?? childName
      : childName;
    return toolNames.has(restoredChildName) ? restoredChildName : undefined;
  }
  return undefined;
}

function restoreToolIdentity(
  value: unknown,
  context: RestoreContext,
  allowNamespaceDeclaration = false,
): RestoreOutcome {
  if (!isPlainObject(value)) return unchanged(value);
  if (!reserveIdentities(context, 1)) return { ...unchanged(value), overflow: true };

  if (
    allowNamespaceDeclaration
    && value.type === "namespace"
    && value.name === PLAINTEXT_V2_COLLABORATION_NAMESPACE
  ) {
    const children = restoreIdentityList(value.tools, context, false);
    if (children.overflow) return { ...unchanged(value), overflow: true };
    return {
      value: {
        ...value,
        name: COLLABORATION_NAMESPACE,
        ...(children.changed ? { tools: children.value } : {}),
      },
      changed: true,
      overflow: false,
    };
  }

  const identityType = value.type;
  if (
    identityType !== "function"
    && identityType !== "custom"
    && identityType !== "function_call"
    && identityType !== "custom_tool_call"
    && identityType !== "response.function_call_arguments.done"
  ) {
    return unchanged(value);
  }

  const allowAgentMessageAlias = identityType === "function"
    || identityType === "function_call"
    || identityType === "response.function_call_arguments.done";
  const childName = declaredChildName(value.name, context.toolNames, allowAgentMessageAlias);
  if (!childName) return unchanged(value);

  let restored = value;
  let changed = false;
  if (value.namespace === PLAINTEXT_V2_COLLABORATION_NAMESPACE) {
    restored = { ...restored, namespace: COLLABORATION_NAMESPACE };
    changed = true;
  }
  if (allowAgentMessageAlias && PLAINTEXT_V2_AGENT_MESSAGE_TOOL_NAMES.has(value.name as string)) {
    restored = { ...restored, name: childName };
    changed = true;
  } else if (typeof value.name === "string" && value.name.startsWith(PLAINTEXT_V2_COLLABORATION_NAME_PREFIX)) {
    restored = { ...restored, name: `${COLLABORATION_NAME_PREFIX}${childName}` };
    changed = true;
  } else if (
    typeof value.name === "string"
    && value.name.startsWith(PLAINTEXT_V2_COLLABORATION_DOTTED_NAME_PREFIX)
  ) {
    restored = { ...restored, name: `${COLLABORATION_DOTTED_NAME_PREFIX}${childName}` };
    changed = true;
  }
  return { value: restored, changed, overflow: false };
}

function restoreIdentityList(
  values: unknown,
  context: RestoreContext,
  allowNamespaceDeclaration: boolean,
): RestoreOutcome {
  if (!Array.isArray(values)) return unchanged(values);
  if (values.length > context.remainingIdentities) {
    return { ...unchanged(values), overflow: true };
  }
  let restored: unknown[] | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const result = restoreToolIdentity(values[index], context, allowNamespaceDeclaration);
    if (result.overflow) return { ...unchanged(values), overflow: true };
    if (!result.changed) continue;
    restored ??= values.slice();
    restored[index] = result.value;
  }
  return restored
    ? { value: restored, changed: true, overflow: false }
    : unchanged(values);
}

function restoreToolChoice(value: unknown, context: RestoreContext): RestoreOutcome {
  const direct = restoreToolIdentity(value, context);
  if (direct.overflow || !isPlainObject(value) || !Array.isArray(value.tools)) return direct;
  const tools = restoreIdentityList(value.tools, context, false);
  if (tools.overflow) return { ...unchanged(value), overflow: true };
  if (!tools.changed) return direct;
  const base = direct.value as Record<string, unknown>;
  return { value: { ...base, tools: tools.value }, changed: true, overflow: false };
}

function restoreResponseSnapshot(value: unknown, context: RestoreContext): RestoreOutcome {
  if (!isPlainObject(value)) return unchanged(value);
  const output = restoreIdentityList(value.output, context, false);
  if (output.overflow) return { ...unchanged(value), overflow: true };
  const tools = restoreIdentityList(value.tools, context, true);
  if (tools.overflow) return { ...unchanged(value), overflow: true };
  const toolChoice = restoreToolChoice(value.tool_choice, context);
  if (toolChoice.overflow) return { ...unchanged(value), overflow: true };
  if (!output.changed && !tools.changed && !toolChoice.changed) return unchanged(value);
  return {
    value: {
      ...value,
      ...(output.changed ? { output: output.value } : {}),
      ...(tools.changed ? { tools: tools.value } : {}),
      ...(toolChoice.changed ? { tool_choice: toolChoice.value } : {}),
    },
    changed: true,
    overflow: false,
  };
}

/**
 * Restore request-scoped collaboration aliases only at documented Responses identity positions.
 * Tool arguments, tool results, and extension metadata are deliberately opaque.
 */
export function restorePlaintextV2AgentMessageCalls(
  value: unknown,
  toolNames: ReadonlySet<string>,
): { value: unknown; changed: boolean; overflowed: boolean } {
  if (toolNames.size === 0 || !isPlainObject(value)) {
    return { value, changed: false, overflowed: false };
  }
  const context: RestoreContext = {
    toolNames,
    remainingIdentities: MAX_RESTORED_TOOL_IDENTITIES,
  };

  const rootIdentity = restoreToolIdentity(value, context);
  if (rootIdentity.overflow) return { value, changed: false, overflowed: true };
  const root = rootIdentity.value as Record<string, unknown>;
  const item = restoreToolIdentity(root.item, context);
  if (item.overflow) return { value, changed: false, overflowed: true };
  const response = restoreResponseSnapshot(root.response, context);
  if (response.overflow) return { value, changed: false, overflowed: true };
  const snapshot = restoreResponseSnapshot(root, context);
  if (snapshot.overflow) return { value, changed: false, overflowed: true };

  let restored = snapshot.value as Record<string, unknown>;
  let changed = rootIdentity.changed || snapshot.changed;
  if (item.changed) {
    restored = { ...restored, item: item.value };
    changed = true;
  }
  if (response.changed) {
    restored = { ...restored, response: response.value };
    changed = true;
  }
  return changed
    ? { value: restored, changed: true, overflowed: false }
    : { value, changed: false, overflowed: false };
}

export function restorePlaintextV2AgentMessageCallsInJson(
  payload: string,
  toolNames: ReadonlySet<string>,
): string {
  if (
    !payload.includes(PLAINTEXT_V2_COLLABORATION_NAMESPACE)
    && ![...PLAINTEXT_V2_AGENT_MESSAGE_TOOL_NAMES.keys()].some(alias => payload.includes(alias))
  ) {
    return payload;
  }

  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return payload;
  }
  const restored = restorePlaintextV2AgentMessageCalls(value, toolNames);
  return restored.changed ? JSON.stringify(restored.value) : payload;
}

export function createPlaintextV2AgentMessageCallRestoreRewrite(
  toolNames: ReadonlySet<string>,
): (payload: string) => string {
  return payload => restorePlaintextV2AgentMessageCallsInJson(payload, toolNames);
}

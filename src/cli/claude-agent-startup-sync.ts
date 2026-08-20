import type { OcxConfig } from "../types";
import { injectClaudeAgentDefs } from "../claude/agents-inject";
import { fetchClaudeContextWindows } from "./claude";

export interface ClaudeAgentStartupSyncDeps {
  fetchContextWindows?: typeof fetchClaudeContextWindows;
  injectAgentDefs?: typeof injectClaudeAgentDefs;
  warn?: (message: string) => void;
}

/**
 * Reconcile the generated Claude Code roster after the proxy listener is live.
 *
 * This belongs to the owning CLI lifecycle rather than `startServer`: the latter is also a
 * library/test primitive and must not mutate a developer's real `~/.claude` directory merely
 * because an in-process test server was created. The live Management API supplies the same bounded
 * context-window map used by `ocx claude`; failure keeps startup available and falls back to an
 * unmarked roster. Disabled integrations skip discovery and prune verified-owned definitions.
 */
export async function syncClaudeAgentDefsAtProxyStartup(
  config: OcxConfig,
  port: number,
  deps: ClaudeAgentStartupSyncDeps = {},
): Promise<string[] | null> {
  const inject = deps.injectAgentDefs ?? injectClaudeAgentDefs;
  const warn = deps.warn ?? (message => console.warn(message));

  try {
    if (config.claudeCode?.enabled === false || config.claudeCode?.injectAgents === false) {
      return inject(config, {});
    }

    let windows: Record<string, number> = {};
    try {
      windows = await (deps.fetchContextWindows ?? fetchClaudeContextWindows)(config, port);
    } catch {
      // Startup remains best-effort. The next management mutation or `ocx claude` launch can
      // restore context markers after a transient catalog/Management API failure.
    }
    return inject(config, windows);
  } catch (error) {
    warn(`⚠ Claude agent definitions could not be synced at proxy startup: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

import { estimateAideTokens } from '../../lib/core/assistant/aideTokenEstimate.js';
import {
  createDefaultAideToolPermissionSettings,
  listAideDisabledToolNames,
  type AideToolPermissionSettings
} from '../../lib/core/assistant/aideToolPermissionSettings.js';

import type { AideReadScope } from './aideReadScope.js';

export interface AideWriteRequest {
  arguments: Record<string, unknown>;
  tool: string;
}

/** Asks the person to allow a batch of changes; resolves false when declined or nobody can answer. */
export type AideWriteApprover = (requests: AideWriteRequest[], signal?: AbortSignal) => Promise<boolean>;

// One per reply: the tool switches in force for it and what its read tools have consumed so far.
export interface AideToolSession {
  /** True while a change waits for the person, so idle timeouts do not end the reply. */
  awaitingApproval: boolean;
  /** Present only when "ask before changing" is on. */
  confirmWrites?: AideWriteApprover;
  disabledTools: ReadonlySet<string>;
  readBudget: number;
  /** Present when the reply knows its current materials; without it reads are not limited by place. */
  readScope?: AideReadScope;
  readUsed: number;
}

export function createAideToolSession(
  settings: AideToolPermissionSettings = createDefaultAideToolPermissionSettings(),
  approver?: AideWriteApprover,
  currentMaterialIds?: readonly string[]
): AideToolSession {
  return {
    awaitingApproval: false,
    // With nobody to ask, an "ask first" reply cannot make changes at all.
    ...(settings.askBeforeWrite ? { confirmWrites: approver ?? (async () => false) } : {}),
    disabledTools: new Set(listAideDisabledToolNames(settings)),
    readBudget: settings.readBudget,
    ...(currentMaterialIds ? { readScope: {
      currentIds: currentMaterialIds,
      manage: { dives: settings.write.manageDives, indexes: settings.write.manageIndexes, trash: settings.write.trash },
      scopes: settings.read
    } } : {}),
    readUsed: 0
  };
}

export async function confirmAideWrites(
  session: AideToolSession | undefined,
  requests: AideWriteRequest[],
  signal?: AbortSignal
) {
  if (!session?.confirmWrites || !requests.length) return true;
  session.awaitingApproval = true;
  try {
    return await session.confirmWrites(requests, signal);
  } catch {
    return false;
  } finally {
    session.awaitingApproval = false;
  }
}

export function isAideToolOffered(session: AideToolSession | undefined, toolName: string) {
  return !session?.disabledTools.has(toolName);
}

// Charges a read result against the reply's budget; a result that does not fit is not delivered.
export function chargeAideReadResult(session: AideToolSession | undefined, text: string) {
  if (!session) return { ok: true as const };
  const tokens = estimateAideTokens(text);
  const remaining = Math.max(0, session.readBudget - session.readUsed);
  if (tokens > remaining) return { ok: false as const, remaining };
  session.readUsed += tokens;
  return { ok: true as const };
}

type JsonishObject = Record<string, unknown>;

export interface ToolCallLike {
  name?: unknown;
  args?: unknown;
  id?: unknown;
  callId?: unknown;
  call_id?: unknown;
}

export interface NormalizedToolCall {
  name: string;
  args: JsonishObject;
  id?: string;
  fingerprint: string;
}

export interface ToolCallDecision {
  shouldProcess: boolean;
  reason?: 'duplicate_id' | 'duplicate_fingerprint';
  normalized: NormalizedToolCall;
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as JsonishObject).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeArgs(args: unknown): JsonishObject {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as JsonishObject;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as JsonishObject;
  }
  return {};
}

function normalizeToolCall(call: ToolCallLike): NormalizedToolCall {
  const name = typeof call.name === 'string' ? call.name : 'unknown_tool';
  const idCandidate = call.id ?? call.callId ?? call.call_id;
  const id = typeof idCandidate === 'string' && idCandidate.length > 0 ? idCandidate : undefined;
  const args = normalizeArgs(call.args);
  const fingerprint = `${name}:${stableStringify(args)}`;
  return { name, args, id, fingerprint };
}

function cleanupExpiredFingerprints(
  seenFingerprints: Map<string, number>,
  nowMs: number,
  dedupeWindowMs: number
) {
  for (const [fingerprint, lastSeen] of seenFingerprints.entries()) {
    if (nowMs - lastSeen > dedupeWindowMs) {
      seenFingerprints.delete(fingerprint);
    }
  }
}

export function shouldProcessToolCall(
  call: ToolCallLike,
  seenIds: Set<string>,
  seenFingerprints: Map<string, number>,
  nowMs = Date.now(),
  dedupeWindowMs = 2000
): ToolCallDecision {
  const normalized = normalizeToolCall(call);
  cleanupExpiredFingerprints(seenFingerprints, nowMs, dedupeWindowMs);

  if (normalized.id && seenIds.has(normalized.id)) {
    return { shouldProcess: false, reason: 'duplicate_id', normalized };
  }

  const previousFingerprintTime = seenFingerprints.get(normalized.fingerprint);
  if (
    typeof previousFingerprintTime === 'number' &&
    nowMs - previousFingerprintTime <= dedupeWindowMs
  ) {
    return { shouldProcess: false, reason: 'duplicate_fingerprint', normalized };
  }

  if (normalized.id) {
    seenIds.add(normalized.id);
  }
  seenFingerprints.set(normalized.fingerprint, nowMs);
  return { shouldProcess: true, normalized };
}

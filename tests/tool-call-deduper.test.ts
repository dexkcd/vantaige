import { describe, expect, it } from 'vitest';
import { shouldProcessToolCall } from '@/lib/toolCallDeduper';

describe('shouldProcessToolCall', () => {
  it('skips duplicate calls with same id', () => {
    const seenIds = new Set<string>();
    const seenFingerprints = new Map<string, number>();

    const first = shouldProcessToolCall(
      { name: 'generate_brand_asset', args: { image_prompt: 'test' }, id: 'abc123' },
      seenIds,
      seenFingerprints,
      1000
    );
    const second = shouldProcessToolCall(
      { name: 'generate_brand_asset', args: { image_prompt: 'test' }, id: 'abc123' },
      seenIds,
      seenFingerprints,
      1100
    );

    expect(first.shouldProcess).toBe(true);
    expect(second.shouldProcess).toBe(false);
    expect(second.reason).toBe('duplicate_id');
  });

  it('skips duplicate payloads when ids are missing/mismatched in a short window', () => {
    const seenIds = new Set<string>();
    const seenFingerprints = new Map<string, number>();

    const first = shouldProcessToolCall(
      { name: 'create_kanban_task', args: { title: 'Task', priority: 'high' } },
      seenIds,
      seenFingerprints,
      5000
    );
    const second = shouldProcessToolCall(
      { name: 'create_kanban_task', args: { priority: 'high', title: 'Task' }, id: 'new-id' },
      seenIds,
      seenFingerprints,
      5200
    );

    expect(first.shouldProcess).toBe(true);
    expect(second.shouldProcess).toBe(false);
    expect(second.reason).toBe('duplicate_fingerprint');
  });

  it('allows same payload again after dedupe window', () => {
    const seenIds = new Set<string>();
    const seenFingerprints = new Map<string, number>();

    const first = shouldProcessToolCall(
      { name: 'upsert_vibe_profile', args: { new_identity: 'A' } },
      seenIds,
      seenFingerprints,
      1000,
      2000
    );
    const second = shouldProcessToolCall(
      { name: 'upsert_vibe_profile', args: { new_identity: 'A' } },
      seenIds,
      seenFingerprints,
      4001,
      2000
    );

    expect(first.shouldProcess).toBe(true);
    expect(second.shouldProcess).toBe(true);
  });
});

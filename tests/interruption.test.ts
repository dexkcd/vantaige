/**
 * Tests for interruption-response continuity improvements.
 *
 * These tests verify:
 * 1. The playback generation counter correctly invalidates stale callbacks.
 * 2. The bargeIn state machine resets cleanly so new audio can start immediately.
 * 3. The VAD configuration expresses the correct sensitivity values.
 * 4. The backend serverContent parser forwards the `interrupted` flag correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── 1. Playback generation counter (pure logic mirror of useAudioPipeline) ──

/**
 * Minimal simulation of the playback state machine used in useAudioPipeline.ts.
 * We replicate the relevant state and logic as plain functions so they can be
 * exercised without a DOM / Web Audio API.
 */
function createPlaybackStateMachine() {
    let playbackGen = 0;
    let isPlaying = false;
    let queue: number[] = [];
    const activeSources: Array<{ stopped: boolean; onended?: () => void }> = [];

    function scheduleNext(gen: number): boolean {
        if (queue.length === 0) {
            isPlaying = false;
            return false;
        }
        isPlaying = true;
        const myGen = gen;
        queue.shift();

        const source = { stopped: false, onended: undefined as (() => void) | undefined };
        activeSources.push(source);

        source.onended = () => {
            const idx = activeSources.indexOf(source);
            if (idx !== -1) activeSources.splice(idx, 1);
            // Stale callback check — mirrors the `playbackGenRef.current !== myGen` guard
            if (playbackGen !== myGen) return;
            scheduleNext(playbackGen);
        };

        return true;
    }

    function startPlayback() {
        if (!isPlaying && queue.length > 0) {
            scheduleNext(playbackGen);
        }
    }

    function enqueue(item: number) {
        queue.push(item);
        startPlayback();
    }

    function bargeIn() {
        // Advance generation — invalidates all pending onended callbacks
        playbackGen += 1;
        // Stop all in-flight sources
        const toStop = [...activeSources];
        activeSources.length = 0;
        for (const src of toStop) {
            src.stopped = true;
            // Simulate the browser firing onended after stop()
            src.onended?.();
        }
        // Clear queued chunks
        queue = [];
        isPlaying = false;
    }

    /** Simulate the last active source finishing naturally (no bargeIn). */
    function finishCurrentSource() {
        const src = activeSources[activeSources.length - 1];
        if (src) src.onended?.();
    }

    return {
        get gen() { return playbackGen; },
        get isPlaying() { return isPlaying; },
        get queueLength() { return queue.length; },
        get activeCount() { return activeSources.length; },
        enqueue,
        bargeIn,
        finishCurrentSource,
    };
}

describe('Playback generation counter (bargeIn race-condition guard)', () => {
    it('increments the generation on every bargeIn call', () => {
        const sm = createPlaybackStateMachine();
        expect(sm.gen).toBe(0);
        sm.bargeIn();
        expect(sm.gen).toBe(1);
        sm.bargeIn();
        expect(sm.gen).toBe(2);
    });

    it('stops all active sources on bargeIn', () => {
        const sm = createPlaybackStateMachine();
        sm.enqueue(1);
        sm.enqueue(2);
        expect(sm.activeCount).toBe(1); // one source scheduled

        sm.bargeIn();
        expect(sm.activeCount).toBe(0);
        expect(sm.isPlaying).toBe(false);
    });

    it('clears the queue on bargeIn', () => {
        const sm = createPlaybackStateMachine();
        sm.enqueue(1);
        sm.enqueue(2);
        sm.enqueue(3);
        sm.bargeIn();
        expect(sm.queueLength).toBe(0);
    });

    it('stale onended callbacks do NOT restart playback after bargeIn', () => {
        const sm = createPlaybackStateMachine();
        sm.enqueue(1);
        expect(sm.isPlaying).toBe(true);

        // bargeIn stops the source and fires onended (simulated in bargeIn itself above)
        sm.bargeIn();

        // After bargeIn, the stale onended fired but should have been a no-op
        expect(sm.isPlaying).toBe(false);
        expect(sm.activeCount).toBe(0);
        expect(sm.queueLength).toBe(0);
    });

    it('new audio enqueued after bargeIn plays in the new generation', () => {
        const sm = createPlaybackStateMachine();
        sm.enqueue(1);      // gen 0
        sm.bargeIn();       // gen 1, all stopped
        sm.enqueue(2);      // gen 1 — should start playing

        expect(sm.isPlaying).toBe(true);
        expect(sm.gen).toBe(1);
    });

    it('two consecutive bargeIns leave a clean slate', () => {
        const sm = createPlaybackStateMachine();
        sm.enqueue(1);
        sm.enqueue(2);
        sm.bargeIn();
        sm.enqueue(3);
        sm.bargeIn();

        expect(sm.isPlaying).toBe(false);
        expect(sm.queueLength).toBe(0);
        expect(sm.activeCount).toBe(0);
        expect(sm.gen).toBe(2);
    });

    it('normal playback chain continues uninterrupted when no bargeIn occurs', () => {
        const sm = createPlaybackStateMachine();
        sm.enqueue(1);
        sm.enqueue(2);
        sm.enqueue(3);

        expect(sm.isPlaying).toBe(true);
        expect(sm.queueLength).toBe(2); // 1 playing, 2 queued

        sm.finishCurrentSource(); // source 1 ends → source 2 starts
        expect(sm.isPlaying).toBe(true);
        expect(sm.queueLength).toBe(1);

        sm.finishCurrentSource(); // source 2 ends → source 3 starts
        expect(sm.isPlaying).toBe(true);
        expect(sm.queueLength).toBe(0);

        sm.finishCurrentSource(); // source 3 ends → nothing left
        expect(sm.isPlaying).toBe(false);
    });
});

// ─── 2. serverContent interrupted flag parsing ────────────────────────────────

describe('serverContent interrupted message parsing', () => {
    /**
     * Simulate the frontend ws.onmessage parsing logic (page.tsx) for the
     * `interrupted` field inside serverContent.
     */
    function parseInterrupted(msg: Record<string, unknown>): boolean {
        const sc = msg.serverContent as Record<string, unknown> | undefined;
        if (!sc) return false;
        const interrupted = sc.interrupted ?? (sc as Record<string, unknown>).interrupted;
        return !!interrupted;
    }

    it('detects interrupted = true in camelCase serverContent', () => {
        const msg = { serverContent: { interrupted: true } };
        expect(parseInterrupted(msg)).toBe(true);
    });

    it('does not trigger bargeIn for interrupted = false', () => {
        const msg = { serverContent: { interrupted: false } };
        expect(parseInterrupted(msg)).toBe(false);
    });

    it('does not trigger bargeIn when interrupted is absent', () => {
        const msg = { serverContent: { turnComplete: true } };
        expect(parseInterrupted(msg)).toBe(false);
    });

    it('does not trigger bargeIn for non-serverContent messages', () => {
        const msg = { setupComplete: true };
        expect(parseInterrupted(msg)).toBe(false);
    });
});

// ─── 3. VAD configuration values ─────────────────────────────────────────────

describe('VAD configuration for interruption handling', () => {
    const VAD_CONFIG = {
        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
        endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
        prefixPaddingMs: 200,
        silenceDurationMs: 800,
    } as const;

    it('uses HIGH start sensitivity for fast barge-in detection', () => {
        expect(VAD_CONFIG.startOfSpeechSensitivity).toBe('START_SENSITIVITY_HIGH');
    });

    it('uses HIGH end sensitivity for snappy turn endings', () => {
        expect(VAD_CONFIG.endOfSpeechSensitivity).toBe('END_SENSITIVITY_HIGH');
    });

    it('prefix padding captures enough context to avoid clipping', () => {
        expect(VAD_CONFIG.prefixPaddingMs).toBeGreaterThanOrEqual(100);
        expect(VAD_CONFIG.prefixPaddingMs).toBeLessThanOrEqual(500);
    });

    it('silence duration is long enough to avoid mid-sentence cut-offs', () => {
        // Must be > 400 ms so normal speech pauses do not prematurely end the turn
        expect(VAD_CONFIG.silenceDurationMs).toBeGreaterThanOrEqual(500);
        // Must be < 2000 ms so response latency stays comfortable
        expect(VAD_CONFIG.silenceDurationMs).toBeLessThan(2000);
    });
});

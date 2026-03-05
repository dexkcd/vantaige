import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@google/genai', () => ({ GoogleGenAI: vi.fn() }));

vi.mock('firebase-admin/app', () => ({
    initializeApp: vi.fn(),
    getApps: vi.fn(() => []),
    cert: vi.fn((key: unknown) => key),
    applicationDefault: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/firestore', () => {
    const mockDoc = (id: string, data: Record<string, unknown> | null) => ({
        id,
        exists: !!data,
        data: () => data || {},
    });
    class MockTimestamp {
        constructor(private d?: Date) {}
        toDate() {
            return this.d ?? new Date();
        }
    }
    const collections: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {};
    let lastWhereFilter: { field: string; value: unknown } | null = null;
    let lastLimit = Infinity;
    const mockCollection = (name: string) => {
        if (!collections[name]) collections[name] = [];
        const docs = collections[name];
        const chain = {
            where: vi.fn().mockImplementation((field: string, _op: string, value: unknown) => {
                lastWhereFilter = { field, value };
                return chain;
            }),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation((n: number) => {
                lastLimit = n;
                return chain;
            }),
            get: vi.fn().mockImplementation(async () => {
                let filtered = docs;
                if (lastWhereFilter) {
                    filtered = docs.filter((d) => {
                        const v = (d.data as Record<string, unknown>)[lastWhereFilter!.field];
                        return v === lastWhereFilter!.value;
                    });
                    lastWhereFilter = null;
                }
                const limited = filtered.slice(0, lastLimit);
                lastLimit = Infinity;
                const docList = limited.map((d) => mockDoc(d.id, d.data));
                return { empty: docList.length === 0, docs: docList };
            }),
        };
        return {
            doc: (id: string) => ({
                get: vi.fn().mockResolvedValue(mockDoc(id, docs.find((d) => d.id === id)?.data ?? null)),
                set: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
                    const existing = docs.findIndex((d) => d.id === id);
                    const entry = { id, data: { ...data } };
                    if (existing >= 0) docs[existing] = entry;
                    else docs.push(entry);
                }),
            }),
            add: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
                const id = `mock-${Math.random().toString(36).slice(2)}`;
                const docData = { ...data, created_at: new MockTimestamp() };
                docs.push({ id, data: docData });
                return {
                    id,
                    get: vi.fn().mockResolvedValue(mockDoc(id, docData)),
                };
            }),
            ...chain,
        };
    };
    const db = { collection: mockCollection };
    return {
        getFirestore: vi.fn(() => db),
        FieldValue: { serverTimestamp: vi.fn(() => new MockTimestamp()) },
        Timestamp: MockTimestamp,
    };
});

import {
    createSessionAction,
    getSessionByPasscodeAction,
} from '@/app/actions/memory';
import { insertSession, getSessionByPasscode, insertSessionLog } from '@/lib/firestore';

describe('Session management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createSessionAction', () => {
        it('returns session_id and passcode', async () => {
            const result = await createSessionAction();
            expect(result.session_id).toBeDefined();
            expect(result.session_id.length).toBeGreaterThan(0);
            expect(result.passcode).toBeDefined();
            expect(result.passcode.length).toBe(6);
        });
    });

    describe('getSessionByPasscodeAction', () => {
        it('returns session_id for valid passcode', async () => {
            const { session_id, passcode } = await createSessionAction();
            const result = await getSessionByPasscodeAction(passcode);
            expect(result).not.toBeNull();
            expect(result!.session_id).toBe(session_id);
        });

        it('returns null for invalid passcode', async () => {
            const result = await getSessionByPasscodeAction('INVALID');
            expect(result).toBeNull();
        });
    });

    describe('session-scoped data', () => {
        it('stores session log under session_id', async () => {
            const session = await insertSession('test-session-1', 'ABC123');
            expect(session).not.toBeNull();
            const ok = await insertSessionLog('test-session-1', 'Test summary');
            expect(ok).toBe(true);
        });
    });
});

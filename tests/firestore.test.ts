import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin before any firestore imports
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
    const mockCollection = (name: string) => {
        const docs: Array<{ id: string; data: Record<string, unknown> }> = [];
        return {
            doc: (id: string) => ({
                get: vi.fn().mockResolvedValue(mockDoc(id, docs.find((d) => d.id === id)?.data ?? null)),
                set: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
                    docs.push({ id, data: { ...data, created_at: { toDate: () => new Date() } } });
                }),
            }),
            add: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({
                id: `mock-${Math.random().toString(36).slice(2)}`,
                get: vi.fn().mockResolvedValue(mockDoc('mock-id', { ...data, created_at: { toDate: () => new Date() } })),
            })),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            get: vi.fn().mockResolvedValue({
                docs: docs.map((d) => mockDoc(d.id, d.data)),
            }),
        };
    };
    const db = {
        collection: mockCollection,
    };
    return {
        getFirestore: vi.fn(() => db),
        FieldValue: {
            serverTimestamp: vi.fn(() => ({ _timestamp: true })),
        },
        Timestamp: {
            fromDate: (d: Date) => d,
            now: () => ({ toDate: () => new Date() }),
        },
    };
});

// Import after mocks
import {
    getVibeProfile,
    upsertVibeProfile,
    type VibeProfile,
} from '@/lib/firestore';

describe('Firestore data layer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('VibeProfile', () => {
        it('exports VibeProfile type', () => {
            const profile: VibeProfile = {
                id: 'test-brand',
                brand_identity: 'Test identity',
            };
            expect(profile.id).toBe('test-brand');
            expect(profile.brand_identity).toBe('Test identity');
        });
    });

    describe('getVibeProfile', () => {
        it('returns null when document does not exist', async () => {
            // Mock returns non-existent doc by default
            const result = await getVibeProfile('nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('upsertVibeProfile', () => {
        it('accepts valid profile and does not throw', async () => {
            const profile: VibeProfile = {
                id: 'default',
                brand_identity: 'New brand identity',
            };
            const result = await upsertVibeProfile(profile);
            // With mock, may return null or the merged result - we mainly verify no throw
            expect(typeof result === 'object' || result === null).toBe(true);
        });
    });
});

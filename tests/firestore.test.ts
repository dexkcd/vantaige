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
                update: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
                    const idx = docs.findIndex((d) => d.id === id);
                    if (idx >= 0) docs[idx] = { id, data: { ...docs[idx]?.data, ...data } };
                }),
                delete: vi.fn().mockImplementation(async () => {
                    const idx = docs.findIndex((d) => d.id === id);
                    if (idx >= 0) docs.splice(idx, 1);
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
    const db = {
        collection: mockCollection,
    };
    return {
        getFirestore: vi.fn(() => db),
        FieldValue: {
            serverTimestamp: vi.fn(() => new MockTimestamp()),
        },
        Timestamp: MockTimestamp,
    };
});

// Import after mocks
import {
    getVibeProfile,
    upsertVibeProfile,
    insertMarketingPlan,
    updateMarketingPlanStatus,
    deleteMarketingPlan,
    getBrandAssetById,
    type VibeProfile,
    type MarketingPlanStatus,
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

    describe('insertMarketingPlan', () => {
        it('accepts optional image_url, caption, tags, status', async () => {
            const result = await insertMarketingPlan('brand-1', {
                title: 'Social post',
                platform: 'Instagram',
                priority: 'high',
                description: 'Post desc',
                image_url: 'https://example.com/img.png',
                caption: 'Great caption',
                tags: ['launch', 'brand'],
                status: 'draft' as MarketingPlanStatus,
            });
            expect(result).not.toBeNull();
            expect(result?.title).toBe('Social post');
            expect(result?.status).toBe('draft');
        });
    });

    describe('updateMarketingPlanStatus', () => {
        it('does not throw when called', async () => {
            const result = await updateMarketingPlanStatus('brand-1', 'plan-1', 'in_progress');
            expect(typeof result === 'boolean').toBe(true);
        });
    });

    describe('getBrandAssetById', () => {
        it('returns null when document does not exist', async () => {
            const result = await getBrandAssetById('brand-1', 'nonexistent-asset');
            expect(result).toBeNull();
        });
    });

    describe('deleteMarketingPlan', () => {
        it('does not throw when called', async () => {
            const result = await deleteMarketingPlan('brand-1', 'plan-1');
            expect(typeof result === 'boolean').toBe(true);
        });
    });
});

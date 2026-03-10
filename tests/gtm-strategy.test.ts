import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetGtmStrategy = vi.fn();
const mockUpsertGtmStrategy = vi.fn();
const mockUpdateMarketingPlanPhase = vi.fn();
const mockUpdateBrandAssetPhase = vi.fn();
const mockUpdateShortVideoPhase = vi.fn();
const mockNormalizeGtmPhasesForBrand = vi.fn();

vi.mock('@/lib/firestore', () => ({
    getGtmStrategy: (...args: unknown[]) => mockGetGtmStrategy(...args),
    upsertGtmStrategy: (...args: unknown[]) => mockUpsertGtmStrategy(...args),
    updateMarketingPlanPhase: (...args: unknown[]) => mockUpdateMarketingPlanPhase(...args),
    updateBrandAssetPhase: (...args: unknown[]) => mockUpdateBrandAssetPhase(...args),
    updateShortVideoPhase: (...args: unknown[]) => mockUpdateShortVideoPhase(...args),
    normalizeGtmPhasesForBrand: (...args: unknown[]) => mockNormalizeGtmPhasesForBrand(...args),
}));

vi.mock('@google/genai', () => ({ GoogleGenAI: vi.fn() }));
vi.mock('@/lib/storage', () => ({
    uploadBrandAssetImage: vi.fn(),
    resolveImageUrlForFirestore: vi.fn((url: string) => Promise.resolve(url)),
}));

import {
    getGtmStrategyAction,
    upsertGtmStrategyAction,
    updateKanbanTaskPhaseAction,
    assignAssetToGtmPhaseAction,
} from '@/app/actions/memory';

describe('GTM strategy actions', () => {
    const brandId = 'test-brand-001';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getGtmStrategyAction', () => {
        it('returns null when no strategy exists', async () => {
            mockGetGtmStrategy.mockResolvedValue(null);

            const result = await getGtmStrategyAction(brandId);

            expect(mockGetGtmStrategy).toHaveBeenCalledWith(brandId);
            expect(result).toBeNull();
        });

        it('returns strategy when it exists', async () => {
            const strategy = {
                id: brandId,
                brand_id: brandId,
                name: 'Q2 Launch',
                description: 'Launch campaign',
                phases: ['Awareness', 'Consideration', 'Launch'],
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
            };
            mockGetGtmStrategy.mockResolvedValue(strategy);

            const result = await getGtmStrategyAction(brandId);

            expect(mockGetGtmStrategy).toHaveBeenCalledWith(brandId);
            expect(result).toEqual(strategy);
        });
    });

    describe('upsertGtmStrategyAction', () => {
        it('creates or updates strategy with name and phases', async () => {
            const saved = {
                id: brandId,
                brand_id: brandId,
                name: 'Q2 Launch',
                description: 'Go-to-market for Q2',
                phases: ['Awareness', 'Launch'],
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
            };
            mockUpsertGtmStrategy.mockResolvedValue(saved);

            const result = await upsertGtmStrategyAction(
                brandId,
                'Q2 Launch',
                ['Awareness', 'Launch'],
                'Go-to-market for Q2'
            );

            expect(mockUpsertGtmStrategy).toHaveBeenCalledWith(brandId, {
                name: 'Q2 Launch',
                phases: ['Awareness', 'Launch'],
                description: 'Go-to-market for Q2',
            });
            expect(result).not.toBeNull();
            expect(result?.name).toBe('Q2 Launch');
            expect(result?.phases).toEqual(['Awareness', 'Launch']);
            expect(result?.description).toBe('Go-to-market for Q2');
        });

        it('returns null when upsert fails', async () => {
            mockUpsertGtmStrategy.mockResolvedValue(null);

            const result = await upsertGtmStrategyAction(brandId, 'Strategy', ['Phase 1']);

            expect(result).toBeNull();
        });
    });

    describe('updateKanbanTaskPhaseAction', () => {
        it('updates task phase and returns true on success', async () => {
            mockUpdateMarketingPlanPhase.mockResolvedValue(true);

            const result = await updateKanbanTaskPhaseAction(brandId, 'task-1', 'Launch');

            expect(mockUpdateMarketingPlanPhase).toHaveBeenCalledWith(brandId, 'task-1', 'Launch');
            expect(result).toBe(true);
        });

        it('updates task phase to null (unassign) and returns true', async () => {
            mockUpdateMarketingPlanPhase.mockResolvedValue(true);

            const result = await updateKanbanTaskPhaseAction(brandId, 'task-1', null);

            expect(mockUpdateMarketingPlanPhase).toHaveBeenCalledWith(brandId, 'task-1', null);
            expect(result).toBe(true);
        });

        it('returns false when update fails', async () => {
            mockUpdateMarketingPlanPhase.mockResolvedValue(false);

            const result = await updateKanbanTaskPhaseAction(brandId, 'task-nonexistent', 'Launch');

            expect(result).toBe(false);
        });
    });

    describe('assignAssetToGtmPhaseAction', () => {
        it('assigns brand_asset to phase and returns true', async () => {
            mockUpdateBrandAssetPhase.mockResolvedValue(true);

            const result = await assignAssetToGtmPhaseAction(
                brandId,
                'brand_asset',
                'asset-1',
                'Launch'
            );

            expect(mockUpdateBrandAssetPhase).toHaveBeenCalledWith(brandId, 'asset-1', 'Launch');
            expect(mockUpdateShortVideoPhase).not.toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('assigns short_video to phase and returns true', async () => {
            mockUpdateShortVideoPhase.mockResolvedValue(true);

            const result = await assignAssetToGtmPhaseAction(
                brandId,
                'short_video',
                'short-1',
                'Awareness'
            );

            expect(mockUpdateShortVideoPhase).toHaveBeenCalledWith(brandId, 'short-1', 'Awareness');
            expect(mockUpdateBrandAssetPhase).not.toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('returns false when brand_asset update fails', async () => {
            mockUpdateBrandAssetPhase.mockResolvedValue(false);

            const result = await assignAssetToGtmPhaseAction(
                brandId,
                'brand_asset',
                'asset-1',
                'Launch'
            );

            expect(result).toBe(false);
        });
    });
});

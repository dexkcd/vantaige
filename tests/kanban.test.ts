import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertMarketingPlan = vi.fn();
const mockUpdateMarketingPlanStatus = vi.fn();
const mockDeleteMarketingPlan = vi.fn();
const mockGetBrandAssetById = vi.fn();
const mockGetShortVideoById = vi.fn();
const mockUpsertVibeProfile = vi.fn();

vi.mock('@/lib/firestore', () => ({
    insertMarketingPlan: (...args: unknown[]) => mockInsertMarketingPlan(...args),
    updateMarketingPlanStatus: (...args: unknown[]) => mockUpdateMarketingPlanStatus(...args),
    deleteMarketingPlan: (...args: unknown[]) => mockDeleteMarketingPlan(...args),
    getBrandAssetById: (...args: unknown[]) => mockGetBrandAssetById(...args),
    getShortVideoById: (...args: unknown[]) => mockGetShortVideoById(...args),
    upsertVibeProfile: (...args: unknown[]) => mockUpsertVibeProfile(...args),
}));

// Avoid GoogleGenAI and other deps for these tests
vi.mock('@google/genai', () => ({ GoogleGenAI: vi.fn() }));
vi.mock('@/lib/storage', () => ({
    uploadBrandAssetImage: vi.fn(),
    resolveImageUrlForFirestore: vi.fn((url: string) => Promise.resolve(url)),
}));

import { createKanbanTaskAction, updateKanbanTaskStatusAction, deleteKanbanTaskAction } from '@/app/actions/memory';

describe('Kanban task actions', () => {
    const brandId = 'test-brand-001';

    beforeEach(() => {
        vi.clearAllMocks();
        mockUpsertVibeProfile.mockResolvedValue({});
    });

    describe('createKanbanTaskAction', () => {
        it('creates task with required fields only and defaults status to draft', async () => {
            mockInsertMarketingPlan.mockResolvedValue({
                id: 'task-1',
                brand_id: brandId,
                title: 'Test Task',
                platform: 'Instagram',
                priority: 'high',
                description: 'A test task',
                status: 'draft',
                created_at: new Date().toISOString(),
            });

            const result = await createKanbanTaskAction(
                brandId,
                'Test Task',
                'Instagram',
                'high',
                'A test task'
            );

            expect(mockInsertMarketingPlan).toHaveBeenCalledWith(brandId, expect.objectContaining({
                title: 'Test Task',
                platform: 'Instagram',
                priority: 'high',
                description: 'A test task',
                status: 'draft',
            }));
            expect(result.id).toBe('task-1');
            expect(result.title).toBe('Test Task');
        });

        it('creates task with optional image_url, caption, tags, status', async () => {
            mockInsertMarketingPlan.mockResolvedValue({
                id: 'task-2',
                brand_id: brandId,
                title: 'Instagram Post',
                platform: 'Instagram',
                priority: 'medium',
                description: 'Social post',
                image_url: 'https://example.com/image.png',
                caption: 'Check this out!',
                tags: ['brand', 'launch'],
                status: 'pending',
                created_at: new Date().toISOString(),
            });

            const result = await createKanbanTaskAction(
                brandId,
                'Instagram Post',
                'Instagram',
                'medium',
                'Social post',
                {
                    image_url: 'https://example.com/image.png',
                    caption: 'Check this out!',
                    tags: ['brand', 'launch'],
                    status: 'pending',
                }
            );

            expect(mockInsertMarketingPlan).toHaveBeenCalledWith(brandId, {
                title: 'Instagram Post',
                platform: 'Instagram',
                priority: 'medium',
                description: 'Social post',
                image_url: 'https://example.com/image.png',
                caption: 'Check this out!',
                tags: ['brand', 'launch'],
                status: 'pending',
            });
            expect(result.image_url).toBe('https://example.com/image.png');
            expect(result.caption).toBe('Check this out!');
            expect(result.tags).toEqual(['brand', 'launch']);
            expect(result.status).toBe('pending');
        });

        it('resolves asset_id to image_url when provided', async () => {
            mockGetBrandAssetById.mockResolvedValue({
                id: 'asset-1',
                brand_id: brandId,
                image_url: 'https://storage.example.com/asset.png',
                prompt: 'Generated image',
                status: 'done',
            });
            mockInsertMarketingPlan.mockResolvedValue({
                id: 'task-3',
                brand_id: brandId,
                title: 'Post with asset',
                platform: 'TikTok',
                priority: 'low',
                description: 'Uses generated asset',
                image_url: 'https://storage.example.com/asset.png',
                status: 'draft',
                created_at: new Date().toISOString(),
            });

            await createKanbanTaskAction(
                brandId,
                'Post with asset',
                'TikTok',
                'low',
                'Uses generated asset',
                { asset_id: 'asset-1', caption: 'Check out this post!' }
            );

            expect(mockGetBrandAssetById).toHaveBeenCalledWith(brandId, 'asset-1');
            expect(mockInsertMarketingPlan).toHaveBeenCalledWith(brandId, expect.objectContaining({
                image_url: 'https://storage.example.com/asset.png',
                caption: 'Check out this post!',
            }));
        });

        it('resolves video_asset_id to video_url when provided', async () => {
            mockGetShortVideoById.mockResolvedValue({
                id: 'short-1',
                brand_id: brandId,
                video_url: 'https://storage.example.com/short.mp4',
                prompt: 'Generated short video',
                status: 'done',
            });
            mockInsertMarketingPlan.mockResolvedValue({
                id: 'task-4',
                brand_id: brandId,
                title: 'TikTok Short',
                platform: 'TikTok',
                priority: 'high',
                description: 'Short-form video post',
                video_url: 'https://storage.example.com/short.mp4',
                status: 'draft',
                created_at: new Date().toISOString(),
            });

            await createKanbanTaskAction(
                brandId,
                'TikTok Short',
                'TikTok',
                'high',
                'Short-form video post',
                { video_asset_id: 'short-1', caption: 'Check out our new short!' }
            );

            expect(mockGetShortVideoById).toHaveBeenCalledWith(brandId, 'short-1');
            expect(mockInsertMarketingPlan).toHaveBeenCalledWith(brandId, expect.objectContaining({
                video_url: 'https://storage.example.com/short.mp4',
                caption: 'Check out our new short!',
            }));
        });

        it('passes gtm_phase when provided', async () => {
            mockInsertMarketingPlan.mockResolvedValue({
                id: 'task-gtm',
                brand_id: brandId,
                title: 'Launch asset',
                platform: 'Instagram',
                priority: 'high',
                description: 'For launch phase',
                status: 'draft',
                gtm_phase: 'Launch',
                created_at: new Date().toISOString(),
            });

            const result = await createKanbanTaskAction(
                brandId,
                'Launch asset',
                'Instagram',
                'high',
                'For launch phase',
                { gtm_phase: 'Launch' }
            );

            expect(mockInsertMarketingPlan).toHaveBeenCalledWith(brandId, expect.objectContaining({
                title: 'Launch asset',
                platform: 'Instagram',
                priority: 'high',
                description: 'For launch phase',
                gtm_phase: 'Launch',
            }));
            expect(result.gtm_phase).toBe('Launch');
        });

        it('throws when insertMarketingPlan returns null', async () => {
            mockInsertMarketingPlan.mockResolvedValue(null);

            await expect(
                createKanbanTaskAction(brandId, 'Fail', 'Web', 'medium', 'Desc')
            ).rejects.toThrow('Failed to create kanban task');
        });
    });

    describe('updateKanbanTaskStatusAction', () => {
        it('updates task status and returns true on success', async () => {
            mockUpdateMarketingPlanStatus.mockResolvedValue(true);

            const result = await updateKanbanTaskStatusAction(
                brandId,
                'task-1',
                'in_progress'
            );

            expect(mockUpdateMarketingPlanStatus).toHaveBeenCalledWith(
                brandId,
                'task-1',
                'in_progress'
            );
            expect(result).toBe(true);
        });

        it('returns false when update fails', async () => {
            mockUpdateMarketingPlanStatus.mockResolvedValue(false);

            const result = await updateKanbanTaskStatusAction(
                brandId,
                'task-nonexistent',
                'done'
            );

            expect(result).toBe(false);
        });
    });

    describe('deleteKanbanTaskAction', () => {
        it('deletes task and returns true on success', async () => {
            mockDeleteMarketingPlan.mockResolvedValue(true);

            const result = await deleteKanbanTaskAction(brandId, 'task-1');

            expect(mockDeleteMarketingPlan).toHaveBeenCalledWith(brandId, 'task-1');
            expect(result).toBe(true);
        });

        it('returns false when delete fails', async () => {
            mockDeleteMarketingPlan.mockResolvedValue(false);

            const result = await deleteKanbanTaskAction(brandId, 'task-nonexistent');

            expect(result).toBe(false);
        });
    });
});

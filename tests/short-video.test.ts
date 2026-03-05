import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertShortVideo = vi.fn();
const mockUpdateShortVideo = vi.fn();
const mockGetShortVideoById = vi.fn();
const mockGetBrandAssetById = vi.fn();
const mockUpsertVibeProfile = vi.fn();
const mockHasGeneratingShortVideo = vi.fn();
const mockCreateSignedUrlForGcsPath = vi.fn();

vi.mock('@/lib/firestore', () => ({
    insertShortVideo: (...args: unknown[]) => mockInsertShortVideo(...args),
    updateShortVideo: (...args: unknown[]) => mockUpdateShortVideo(...args),
    getShortVideoById: (...args: unknown[]) => mockGetShortVideoById(...args),
    getBrandAssetById: (...args: unknown[]) => mockGetBrandAssetById(...args),
    upsertVibeProfile: (...args: unknown[]) => mockUpsertVibeProfile(...args),
    hasGeneratingShortVideo: (...args: unknown[]) => mockHasGeneratingShortVideo(...args),
}));

vi.mock('@/lib/storage', () => ({
    createSignedUrlForGcsPath: (...args: unknown[]) => mockCreateSignedUrlForGcsPath(...args),
}));

const { mockGenerateVideos, mockGetVideosOperation } = vi.hoisted(() => ({
    mockGenerateVideos: vi.fn(),
    mockGetVideosOperation: vi.fn(),
}));

vi.mock('@google/genai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@google/genai')>();
    return {
        ...actual,
        GoogleGenAI: vi.fn().mockImplementation(function (this: unknown) {
            return {
                models: { generateVideos: mockGenerateVideos },
                operations: { getVideosOperation: mockGetVideosOperation },
            };
        }),
        GenerateVideosOperation: vi.fn().mockImplementation(function () {
            return { name: undefined };
        }),
    };
});

process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

import { startShortFormVideoAction, checkShortFormVideoStatusAction } from '@/app/actions/memory';

describe('Short-form video actions', () => {
    const brandId = 'test-brand-001';

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
        mockUpsertVibeProfile.mockResolvedValue({});
        mockHasGeneratingShortVideo.mockResolvedValue(false);
    });

    describe('startShortFormVideoAction', () => {
        it('starts video generation and returns job_id', async () => {
            mockGenerateVideos.mockResolvedValue({
                name: 'projects/test-project/locations/us-central1/operations/op-123',
            });
            mockInsertShortVideo.mockResolvedValue({ id: 'job-abc' });

            const result = await startShortFormVideoAction(
                'A cat walking in the rain',
                brandId
            );

            expect(mockGenerateVideos).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'veo-3.1-generate-001',
                    prompt: 'A cat walking in the rain',
                    config: expect.objectContaining({
                        aspectRatio: '9:16',
                        durationSeconds: 6,
                        negativePrompt: expect.stringContaining('minimal text'),
                    }),
                })
            );
            expect(mockInsertShortVideo).toHaveBeenCalledWith(
                brandId,
                expect.objectContaining({
                    prompt: 'A cat walking in the rain',
                    status: 'generating',
                    operation_name: 'projects/test-project/locations/us-central1/operations/op-123',
                })
            );
            expect(result.job_id).toBe('job-abc');
        });

        it('passes reference_asset_ids and fetches images', async () => {
            mockGetBrandAssetById.mockResolvedValue({
                id: 'asset-1',
                image_url: 'https://example.com/logo.png',
                prompt: 'Brand logo',
            });
            mockGenerateVideos.mockResolvedValue({
                name: 'projects/test-project/operations/op-456',
            });
            mockInsertShortVideo.mockResolvedValue({ id: 'job-def' });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
                headers: new Headers({ 'content-type': 'image/png' }),
            });

            await startShortFormVideoAction('Logo reveal', brandId, {
                reference_asset_ids: ['asset-1'],
                duration_seconds: 8,
                platform: 'youtube_shorts',
            });

            expect(mockGetBrandAssetById).toHaveBeenCalledWith(brandId, 'asset-1');
            expect(mockGenerateVideos).toHaveBeenCalledWith(
                expect.objectContaining({
                    config: expect.objectContaining({
                        referenceImages: expect.arrayContaining([
                            expect.objectContaining({
                                image: expect.objectContaining({
                                    mimeType: 'image/png',
                                }),
                                referenceType: 'ASSET',
                            }),
                        ]),
                        durationSeconds: 8,
                    }),
                })
            );
        });

        it('throws when a video is already generating', async () => {
            mockHasGeneratingShortVideo.mockResolvedValue(true);
            await expect(
                startShortFormVideoAction('Another video', brandId)
            ).rejects.toThrow('A short-form video is already being generated');
            expect(mockGenerateVideos).not.toHaveBeenCalled();
        });

        it('throws when GOOGLE_CLOUD_PROJECT is missing', async () => {
            const orig = process.env.GOOGLE_CLOUD_PROJECT;
            process.env.GOOGLE_CLOUD_PROJECT = '';
            await expect(
                startShortFormVideoAction('Test', brandId)
            ).rejects.toThrow('GOOGLE_CLOUD_PROJECT is required');
            process.env.GOOGLE_CLOUD_PROJECT = orig;
        });
    });

    describe('checkShortFormVideoStatusAction', () => {
        it('returns generating when operation is not done', async () => {
            mockGetShortVideoById.mockResolvedValue({
                id: 'job-1',
                brand_id: brandId,
                status: 'generating',
                operation_name: 'projects/test/operations/op-1',
            });
            mockGetVideosOperation.mockResolvedValue({
                done: false,
            });

            const result = await checkShortFormVideoStatusAction('job-1', brandId);

            expect(result.status).toBe('generating');
        });

        it('returns done with video_url when operation completes', async () => {
            mockGetShortVideoById.mockResolvedValue({
                id: 'job-1',
                brand_id: brandId,
                status: 'generating',
                operation_name: 'projects/test/operations/op-1',
            });
            mockGetVideosOperation.mockResolvedValue({
                done: true,
                response: {
                    generatedVideos: [{
                        video: { uri: 'gs://bucket/path/sample_0.mp4' },
                    }],
                },
            });
            mockCreateSignedUrlForGcsPath.mockResolvedValue('https://signed.example.com/video.mp4');
            mockUpdateShortVideo.mockResolvedValue(true);

            const result = await checkShortFormVideoStatusAction('job-1', brandId);

            expect(result.status).toBe('done');
            expect(result.video_url).toBe('https://signed.example.com/video.mp4');
            expect(mockCreateSignedUrlForGcsPath).toHaveBeenCalledWith('gs://bucket/path/sample_0.mp4');
            expect(mockUpdateShortVideo).toHaveBeenCalledWith(brandId, 'job-1', {
                video_url: 'https://signed.example.com/video.mp4',
                status: 'done',
            });
        });

        it('returns error when job not found', async () => {
            mockGetShortVideoById.mockResolvedValue(null);

            const result = await checkShortFormVideoStatusAction('job-nonexistent', brandId);

            expect(result.status).toBe('error');
            expect(result.error).toBe('Job not found');
        });

        it('returns done when doc already has video_url', async () => {
            mockGetShortVideoById.mockResolvedValue({
                id: 'job-1',
                brand_id: brandId,
                status: 'done',
                video_url: 'https://already-done.com/video.mp4',
            });

            const result = await checkShortFormVideoStatusAction('job-1', brandId);

            expect(result.status).toBe('done');
            expect(result.video_url).toBe('https://already-done.com/video.mp4');
            expect(mockGetVideosOperation).not.toHaveBeenCalled();
        });
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetVibeProfile = vi.fn();
const mockFetchSessionLogs = vi.fn();
const mockUpsertVibeProfile = vi.fn();
const mockInsertBlogPost = vi.fn();
const mockFetchBlogPosts = vi.fn();

vi.mock('@/lib/firestore', () => ({
  getVibeProfile: (...args: unknown[]) => mockGetVibeProfile(...args),
  fetchSessionLogs: (...args: unknown[]) => mockFetchSessionLogs(...args),
  upsertVibeProfile: (...args: unknown[]) => mockUpsertVibeProfile(...args),
  insertBlogPost: (...args: unknown[]) => mockInsertBlogPost(...args),
  fetchBlogPosts: (...args: unknown[]) => mockFetchBlogPosts(...args),
}));

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn().mockImplementation(function (this: unknown) {
      return {
        models: { generateContent: mockGenerateContent },
      };
    }),
  };
});

import { generateBlogPostAction, fetchBlogPostsAction } from '@/app/actions/memory';

describe('Blog post actions', () => {
  const brandId = 'brand-blog-001';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVibeProfile.mockResolvedValue({ id: brandId, brand_identity: 'Calm, modern AI brand' });
    mockFetchSessionLogs.mockResolvedValue([
      {
        id: 'log-1',
        brand_id: brandId,
        summary: 'Discussed launch strategy for new feature.',
        created_at: new Date().toISOString(),
      },
    ]);
    mockUpsertVibeProfile.mockResolvedValue({});
  });

  describe('generateBlogPostAction', () => {
    it('generates and saves a markdown blog post with id', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'This is the generated blog body.',
                },
              ],
            },
          },
        ],
      });
      mockInsertBlogPost.mockResolvedValue({
        id: 'blog-123',
        brand_id: brandId,
        title: 'Test Topic',
        content: 'This is the generated blog body.',
        format: 'markdown',
        created_at: new Date().toISOString(),
      });

      const result = await generateBlogPostAction(brandId, {
        topic: 'Test Topic',
        format: 'markdown',
        length: 'short',
      });

      expect(mockGenerateContent).toHaveBeenCalled();
      expect(mockInsertBlogPost).toHaveBeenCalledWith(brandId, {
        title: 'Test Topic',
        content: 'This is the generated blog body.',
        format: 'markdown',
      });
      expect(result.id).toBe('blog-123');
      expect(result.title).toBe('Test Topic');
      expect(result.content).toBe('This is the generated blog body.');
      expect(result.format).toBe('markdown');
    });
  });

  describe('fetchBlogPostsAction', () => {
    it('returns mapped blog posts from firestore layer', async () => {
      const createdAt = new Date().toISOString();
      mockFetchBlogPosts.mockResolvedValue([
        {
          id: 'blog-1',
          brand_id: brandId,
          title: 'First Post',
          content: 'Body 1',
          format: 'markdown',
          created_at: createdAt,
        },
      ]);

      const posts = await fetchBlogPostsAction(brandId, 5);

      expect(mockFetchBlogPosts).toHaveBeenCalledWith(brandId, 5);
      expect(posts).toHaveLength(1);
      expect(posts[0]).toEqual({
        id: 'blog-1',
        title: 'First Post',
        content: 'Body 1',
        format: 'markdown',
        created_at: createdAt,
      });
    });
  });
});


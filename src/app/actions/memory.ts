'use server';

import {
    getVibeProfile,
    upsertVibeProfile,
    insertSessionLog,
    fetchSessionLogs,
    fetchMarketingPlans,
    insertMarketingPlan,
    insertBrandAsset,
    fetchBrandAssets,
    getBrandAssetById,
    updateMarketingPlanStatus,
} from '@/lib/firestore';
import { uploadBrandAssetImage, resolveImageUrlForFirestore } from '@/lib/storage';
import { GoogleGenAI } from '@google/genai';

function createGenAIClient() {
    const opts = {
        vertexai: true as const,
        project: process.env.GOOGLE_CLOUD_PROJECT || '',
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        ...(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim().startsWith('{')
            ? {
                  googleAuthOptions: {
                      credentials: JSON.parse(
                          process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!
                      ) as object,
                  },
              }
            : {}),
    };
    return new GoogleGenAI(opts);
}

const ai = createGenAIClient();

export interface MarketingPlan {
    id?: string;
    brand_id: string;
    title: string;
    platform?: string;
    priority?: 'high' | 'medium' | 'low';
    description?: string;
    created_at?: string;
}

export interface SessionLog {
    id: string;
    brand_id: string;
    summary: string;
    created_at: string;
}

export async function fetchVantAIgeContext(brandId: string) {
    const vibeProfile = await getVibeProfile(brandId);
    const sessionLogs = await fetchSessionLogs(brandId, 3);
    return { vibeProfile, sessionLogs };
}

export async function upsertVibeProfileAction(brandId: string, brandIdentity: string) {
    const result = await upsertVibeProfile({ id: brandId, brand_identity: brandIdentity });
    if (!result) {
        throw new Error('Failed to update vibe profile');
    }
    return result;
}

export async function summarizeSessionAction(brandId: string, meetingNotes: string) {
    try {
        // 1. Summarize via Gemini REST/GenAI SDK
        console.log(`Summarizing session with ${meetingNotes.length} chars of notes...`);
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                role: 'user', parts: [{
                    text: `Summarize the following meeting interactions and key decisions into a concise paragraph.
        
        Meeting Interactions:
        ${meetingNotes}`
                }]
            }],
        });

        const summary = response.candidates?.[0]?.content?.parts?.[0]?.text || 'Session was active but yielded no specific decisions.';
        console.log(`Generated Summary: ${summary}`);

        // 2. Save to Firestore (Ensure brand exists first)
        await upsertVibeProfile({ id: brandId, brand_identity: 'Default' });
        const ok = await insertSessionLog(brandId, summary);
        if (!ok) return false;
        return true;
    } catch (error) {
        console.error('Summarization Error:', error);
        return false;
    }
}

/**
 * Cross-session trend analysis: fetches recent session logs and roadmap tasks,
 * then uses Gemini to identify recurring themes, brand evolution, and strategic trends.
 */
export async function getCrossSessionTrendAnalysisAction(brandId: string): Promise<string> {
    try {
        const vibeProfile = await getVibeProfile(brandId);
        const sessionLogs = await fetchSessionLogs(brandId, 15);
        const plans = await fetchMarketingPlans(brandId);

        const sessionsText =
            sessionLogs
                .map((l, i) => `Session ${i + 1} (${new Date(l.created_at).toLocaleDateString()}): ${l.summary}`)
                .join('\n\n') || 'No sessions yet.';

        const plansText =
            plans
                .slice(0, 20)
                .map((p) => `- ${p.title} [${p.platform ?? 'Multi-channel'}] (${p.priority ?? 'medium'})`)
                .join('\n') || 'No roadmap tasks yet.';

        const prompt = `You are a strategic brand analyst. Given the following data for one brand, write a concise "Cross-Session Trend Analysis" (2–4 short paragraphs). Identify:
- Recurring themes or priorities across sessions
- How the brand direction or decisions have evolved over time
- Strategic patterns (e.g. channel focus, asset types, messaging)
- One or two actionable insights or recommendations

Current Vibe Profile (brand identity):
${vibeProfile?.brand_identity ?? 'Not set.'}

Recent session summaries (newest first):
${sessionsText}

Recent roadmap / marketing plan tasks:
${plansText}

Respond with only the analysis text, no preamble or headings.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const text =
            response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
            'Not enough session or roadmap data yet to identify trends. Run a few more sessions and add tasks.';
        return text;
    } catch (error) {
        console.error('Cross-session trend analysis error:', error);
        throw new Error('Failed to compute trend analysis');
    }
}

/** Max reference image size (chars) to avoid Server Action serialization limits */
const MAX_REFERENCE_B64 = 120000;

/**
 * Generates a brand asset image using Imagen on Vertex AI, saves to Firestore,
 * and returns only the asset ID. Avoids passing large base64 through Server Action
 * (causes "Maximum array nesting exceeded").
 * Reference image must be pre-compressed on client (see compressBase64Image).
 */
export async function generateBrandAssetAction(
    prompt: string,
    brandId: string,
    referenceImageBase64?: string
): Promise<{ id: string }> {
    try {
        let imagePrompt = prompt;
        const refB64 = referenceImageBase64 && referenceImageBase64.length <= MAX_REFERENCE_B64
            ? referenceImageBase64
            : undefined;
        if (refB64) {
            const visionResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: refB64 } },
                        {
                            text: `The user is asking for a brand asset. They said: "${prompt}". Based on what you see in the image (e.g. screen share, product, design, or camera view), write a single, detailed image generation prompt for an AI image model. Describe the scene or subject clearly and incorporate their request. Output only the prompt, no preamble.`,
                        },
                    ],
                }],
            });
            const enhanced = visionResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (enhanced) imagePrompt = enhanced;
        }

        const response = await ai.models.generateImages({
            model: 'imagen-4.0-ultra-generate-001',
            prompt: imagePrompt,
            config: { numberOfImages: 1, outputMimeType: 'image/png' },
        });

        const raw = response.generatedImages?.[0]?.image?.imageBytes;
        const imageBytes = typeof raw === 'string' ? raw : (raw ? String(raw) : '');
        if (!imageBytes) {
            throw new Error('No image bytes returned from Imagen');
        }

        const imageUrl = await uploadBrandAssetImage(
            brandId,
            `data:image/png;base64,${imageBytes}`,
            'image/png'
        );
        await upsertVibeProfile({ id: brandId, brand_identity: 'Default' });
        const result = await insertBrandAsset(brandId, prompt, imageUrl, 'done');
        if (!result) {
            throw new Error('Failed to save brand asset');
        }
        return result;
    } catch (error) {
        console.error('Image generation error:', error);
        throw new Error('Failed to generate brand asset');
    }
}

/**
 * Saves a brand asset record (prompt + data URL) to Firestore.
 */
export async function saveBrandAssetAction(
    brandId: string,
    prompt: string,
    dataUrl: string
): Promise<{ id: string }> {
    const imageUrl = await resolveImageUrlForFirestore(dataUrl, brandId);
    await upsertVibeProfile({ id: brandId, brand_identity: 'Default' });
    const result = await insertBrandAsset(brandId, prompt, imageUrl, 'done');
    if (!result) {
        throw new Error('Failed to save brand asset');
    }
    return result;
}

/**
 * Fetches all brand assets for a given brand, newest first.
 */
export async function fetchBrandAssetsAction(
    brandId: string
): Promise<Array<{ id: string; prompt: string; image_url: string; status: string; created_at: string }>> {
    return fetchBrandAssets(brandId);
}

export type KanbanTaskStatus = 'draft' | 'pending' | 'in_progress' | 'done';

/**
 * Fetches all kanban tasks (marketing plans) for a given brand, newest first.
 */
export async function fetchKanbanTasksAction(
    brandId: string
): Promise<Array<{
    id: string;
    title: string;
    platform: string;
    priority: 'high' | 'medium' | 'low';
    description: string;
    image_url?: string;
    caption?: string;
    tags?: string[];
    status: KanbanTaskStatus;
}>> {
    const plans = await fetchMarketingPlans(brandId);
    return plans.map((row) => ({
        id: row.id,
        title: row.title,
        platform: row.platform || 'Multi-channel',
        priority: (row.priority as 'high' | 'medium' | 'low') || 'medium',
        description: row.description || '',
        image_url: row.image_url,
        caption: row.caption,
        tags: row.tags,
        status: (row.status as KanbanTaskStatus) || 'draft',
    }));
}

/**
 * Generates an engaging social media caption from an image prompt.
 * The image prompt is technical; the caption should be post copy for the platform.
 */
async function generateSocialCaption(
    imagePrompt: string,
    platform: string
): Promise<string> {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
            role: 'user',
            parts: [{
                text: `You are a social media copywriter. Given this technical image description used to generate a visual, write a short, engaging caption (1-2 sentences) for a ${platform} post. The caption should NOT repeat the technical prompt—write actual post copy that would accompany the image (call-to-action, hook, or brand message). Output only the caption, no quotes or preamble.

Image description:
${imagePrompt}`,
            }],
        }],
    });
    const caption = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return caption || imagePrompt.slice(0, 160);
}

export async function createKanbanTaskAction(
    brandId: string,
    title: string,
    platform: string,
    priority: 'high' | 'medium' | 'low',
    description: string,
    options?: {
        asset_id?: string;
        image_url?: string;
        caption?: string;
        prompt_for_caption?: string;
        tags?: string[];
        status?: KanbanTaskStatus;
    }
): Promise<MarketingPlan & { id: string }> {
    await upsertVibeProfile({ id: brandId, brand_identity: 'Default' });

    let imageUrl = options?.image_url;
    let assetPrompt: string | undefined;
    if (options?.asset_id && !imageUrl) {
        const asset = await getBrandAssetById(brandId, options.asset_id);
        if (asset) {
            imageUrl = asset.image_url;
            assetPrompt = asset.prompt;
        }
    }

    let caption = options?.caption?.trim();
    const promptForCaption = options?.prompt_for_caption?.trim() || assetPrompt;
    if ((!caption || caption.length < 10) && promptForCaption && (imageUrl || options?.asset_id)) {
        caption = await generateSocialCaption(promptForCaption, platform);
    }

    const result = await insertMarketingPlan(brandId, {
        title,
        platform,
        priority,
        description,
        image_url: imageUrl,
        caption: caption || undefined,
        tags: options?.tags,
        status: options?.status ?? 'draft',
    });
    if (!result) {
        throw new Error('Failed to create kanban task');
    }
    return result;
}

/**
 * Updates a kanban task's status.
 */
export async function updateKanbanTaskStatusAction(
    brandId: string,
    taskId: string,
    status: KanbanTaskStatus
): Promise<boolean> {
    return updateMarketingPlanStatus(brandId, taskId, status);
}

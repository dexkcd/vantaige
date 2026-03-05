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
} from '@/lib/firestore';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
});

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

/**
 * Generates a brand asset image using Imagen 3 on Vertex AI (avoids Predict API).
 * If referenceImageBase64 (e.g. from the live feed) is provided, uses Gemini to derive
 * an image prompt from the reference + user prompt, then generates with Imagen.
 * Returns a base64-encoded PNG data URL.
 */
export async function generateBrandAssetAction(
    prompt: string,
    referenceImageBase64?: string
): Promise<string> {
    try {
        let imagePrompt = prompt;
        if (referenceImageBase64) {
            const visionResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: referenceImageBase64,
                            },
                        },
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
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
            },
        });

        const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
        if (!imageBytes) {
            throw new Error('No image bytes returned from Imagen');
        }

        return `data:image/png;base64,${imageBytes}`;
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
    await upsertVibeProfile({ id: brandId, brand_identity: 'Default' });
    const result = await insertBrandAsset(brandId, prompt, dataUrl, 'done');
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

/**
 * Fetches all kanban tasks (marketing plans) for a given brand, newest first.
 */
export async function fetchKanbanTasksAction(
    brandId: string
): Promise<Array<{ id: string; title: string; platform: string; priority: 'high' | 'medium' | 'low'; description: string }>> {
    const plans = await fetchMarketingPlans(brandId);
    return plans.map((row) => ({
        id: row.id,
        title: row.title,
        platform: row.platform || 'Multi-channel',
        priority: (row.priority as 'high' | 'medium' | 'low') || 'medium',
        description: row.description || '',
    }));
}

/**
 * Creates a marketing plan task in the kanban (marketing_plans collection).
 */
export async function createKanbanTaskAction(
    brandId: string,
    title: string,
    platform: string,
    priority: 'high' | 'medium' | 'low',
    description: string
): Promise<MarketingPlan> {
    await upsertVibeProfile({ id: brandId, brand_identity: 'Default' });
    const result = await insertMarketingPlan(brandId, {
        title,
        platform,
        priority,
        description,
    });
    if (!result) {
        throw new Error('Failed to create kanban task');
    }
    return result;
}

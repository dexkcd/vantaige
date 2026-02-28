'use server';

import { supabase } from '@/lib/supabase';
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
    // Fetch Vibe Profile
    const { data: vibeProfile } = await supabase
        .from('vibe_profiles')
        .select('*')
        .eq('id', brandId)
        .single();

    // Fetch Session Logs (Last 3)
    const { data: sessionLogs } = await supabase
        .from('session_logs')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(3);

    return { vibeProfile, sessionLogs: sessionLogs || [] };
}

export async function upsertVibeProfileAction(brandId: string, brandIdentity: string) {
    const { data, error } = await supabase
        .from('vibe_profiles')
        .upsert(
            { id: brandId, brand_identity: brandIdentity },
            { onConflict: 'id' }
        )
        .select();

    if (error) {
        console.error('Error upserting vibe:', error);
        throw new Error('Failed to update vibe profile');
    }

    return data[0];
}

export async function summarizeSessionAction(brandId: string, meetingNotes: string) {
    try {
        // 1. Summarize via Gemini REST/GenAI SDK
        console.log(`Summarizing session with ${meetingNotes.length} chars of notes...`);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
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

        // 2. Save to Supabase (Ensure brand exists first)
        await supabase.from('vibe_profiles').upsert({ id: brandId, brand_identity: 'Default' }, { onConflict: 'id' });

        const { error } = await supabase
            .from('session_logs')
            .insert({
                brand_id: brandId,
                summary: summary
            });

        if (error) {
            console.error('Failed to log session:', error);
            return false;
        }

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
        const { data: vibeProfile } = await supabase
            .from('vibe_profiles')
            .select('brand_identity')
            .eq('id', brandId)
            .single();

        const { data: sessionLogs } = await supabase
            .from('session_logs')
            .select('summary, created_at')
            .eq('brand_id', brandId)
            .order('created_at', { ascending: false })
            .limit(15);

        const { data: plans } = await supabase
            .from('marketing_plans')
            .select('title, platform, priority, created_at')
            .eq('brand_id', brandId)
            .order('created_at', { ascending: false })
            .limit(20);

        const sessionsText =
            (sessionLogs || [])
                .map((l, i) => `Session ${i + 1} (${new Date(l.created_at).toLocaleDateString()}): ${l.summary}`)
                .join('\n\n') || 'No sessions yet.';

        const plansText =
            (plans || [])
                .map((p) => `- ${p.title} [${p.platform}] (${p.priority})`)
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
            model: 'gemini-3-flash-preview',
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
 * Returns a base64-encoded PNG data URL.
 */
export async function generateBrandAssetAction(prompt: string): Promise<string> {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-ultra-generate-001',
            prompt,
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
 * Saves a brand asset record (prompt + data URL) to Supabase.
 */
export async function saveBrandAssetAction(
    brandId: string,
    prompt: string,
    dataUrl: string
): Promise<{ id: string }> {
    await supabase
        .from('vibe_profiles')
        .upsert({ id: brandId, brand_identity: 'Default' }, { onConflict: 'id' });

    const { data, error } = await supabase
        .from('brand_assets')
        .insert({ brand_id: brandId, prompt, image_url: dataUrl, status: 'done' })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to save brand asset:', error);
        throw new Error('Failed to save brand asset');
    }
    return data as { id: string };
}

/**
 * Fetches all brand assets for a given brand, newest first.
 */
export async function fetchBrandAssetsAction(
    brandId: string
): Promise<Array<{ id: string; prompt: string; image_url: string; status: string; created_at: string }>> {
    const { data, error } = await supabase
        .from('brand_assets')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to fetch brand assets:', error);
        return [];
    }
    return data || [];
}

/**
 * Fetches all kanban tasks (marketing plans) for a given brand, newest first.
 */
export async function fetchKanbanTasksAction(
    brandId: string
): Promise<Array<{ id: string; title: string; platform: string; priority: 'high' | 'medium' | 'low'; description: string }>> {
    const { data, error } = await supabase
        .from('marketing_plans')
        .select('id, title, platform, priority, description')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to fetch kanban tasks:', error);
        return [];
    }
    return (data || []).map((row) => ({
        id: row.id,
        title: row.title,
        platform: row.platform || 'Multi-channel',
        priority: (row.priority as 'high' | 'medium' | 'low') || 'medium',
        description: row.description || '',
    }));
}

/**
 * Creates or upserts a marketing plan task into the kanban (marketing_plans table).
 */
export async function createKanbanTaskAction(
    brandId: string,
    title: string,
    platform: string,
    priority: 'high' | 'medium' | 'low',
    description: string
): Promise<MarketingPlan> {
    // Ensure the brand profile exists first (prevents FK violation)
    await supabase
        .from('vibe_profiles')
        .upsert({ id: brandId, brand_identity: 'Default' }, { onConflict: 'id' });

    const { data, error } = await supabase
        .from('marketing_plans')
        .insert({ brand_id: brandId, title, platform, priority, description })
        .select()
        .single();

    if (error) {
        console.error('Failed to create kanban task:', error);
        throw new Error('Failed to create kanban task');
    }

    return data as MarketingPlan;
}

'use server';

import { supabase } from '@/lib/supabase';
import { GoogleGenAI } from '@google/genai';

// Initialize the standard Gemini client for the summarizer
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

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
            model: 'gemini-flash-latest',
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

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Define type for vibe_profiles
export interface VibeProfile {
    id: string; // Could be a session id or static 'vantaige-brand'
    brand_identity: string;
    created_at?: string;
    updated_at?: string;
}

export async function getVibeProfile(id: string = 'default') {
    const { data, error } = await supabase
        .from('vibe_profiles')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching vibe profile:', error);
        return null;
    }
    return data as VibeProfile;
}

export async function upsertVibeProfile(profile: VibeProfile) {
    const { data, error } = await supabase
        .from('vibe_profiles')
        .upsert(profile, { onConflict: 'id' })
        .select();

    if (error) {
        console.error('Error upserting vibe profile:', error);
        return null;
    }
    return data?.[0] as VibeProfile;
}

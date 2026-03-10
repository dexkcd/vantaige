import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin (singleton)
function getFirestoreClient() {
    if (getApps().length === 0) {
        const envProjectId = process.env.GOOGLE_CLOUD_PROJECT;
        let cred;
        let projectId = envProjectId;

        // Prefer JSON string (GOOGLE_APPLICATION_CREDENTIALS_JSON or FIREBASE_SERVICE_ACCOUNT_KEY)
        // for secure deployment – no file path needed
        const credsJson =
            process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (credsJson && credsJson.trim().startsWith('{')) {
            const parsed = JSON.parse(credsJson);
            cred = cert(parsed);
            if (!projectId && parsed?.project_id) projectId = parsed.project_id;
        } else if (credsJson) {
            // Path to JSON file (legacy FIREBASE_SERVICE_ACCOUNT_KEY as path)
            const path = credsJson.trim();
            cred = cert(path);
            if (!projectId) {
                try {
                    const key = JSON.parse(require('fs').readFileSync(path, 'utf8'));
                    projectId = key?.project_id;
                } catch {
                    /* ignore */
                }
            }
        } else if (
            process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
            process.env.GOOGLE_APPLICATION_CREDENTIALS
        ) {
            const path =
                process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
                process.env.GOOGLE_APPLICATION_CREDENTIALS!;
            cred = cert(path);
            if (!projectId) {
                try {
                    const fs = require('fs');
                    const key = JSON.parse(fs.readFileSync(path, 'utf8'));
                    projectId = key.project_id;
                } catch {
                    /* ignore */
                }
            }
        } else {
            cred = applicationDefault();
        }

        initializeApp({
            credential: cred,
            projectId: projectId || undefined,
            storageBucket: projectId ? `${projectId}.firebasestorage.app` : undefined,
        });

        if (projectId && process.env.NODE_ENV !== 'production') {
            console.log(`[Firestore] Connected to project: ${projectId}`);
        }
    }
    return getFirestore();
}

export const db = getFirestoreClient();

// ---------------------------------------------------------------------------
// Types (matching former Supabase schema)
// ---------------------------------------------------------------------------

export interface VibeProfile {
    id: string;
    brand_identity: string;
    created_at?: string;
    updated_at?: string;
}

export interface SessionLog {
    id: string;
    brand_id: string;
    summary: string;
    created_at: string;
}

export interface BrandAsset {
    id: string;
    brand_id: string;
    prompt: string;
    image_url: string;
    status: string;
    created_at: string;
    gtm_phase?: string;
}

export type ShortVideoStatus = 'generating' | 'done' | 'error';

export interface ShortVideo {
    id: string;
    brand_id: string;
    prompt: string;
    video_url?: string;
    reference_asset_ids?: string[];
    duration_seconds?: number;
    platform?: string;
    status: ShortVideoStatus;
    operation_name?: string;
    created_at: string;
    gtm_phase?: string;
}

export type MarketingPlanStatus = 'draft' | 'pending' | 'in_progress' | 'done';

export interface MarketingPlan {
    id: string;
    brand_id: string;
    title: string;
    platform?: string;
    priority?: 'high' | 'medium' | 'low';
    description?: string;
    image_url?: string;
    video_url?: string;
    video_asset_id?: string;
    caption?: string;
    tags?: string[];
    status: MarketingPlanStatus;
    created_at: string;
    gtm_phase?: string;
}

export interface GtmStrategy {
    id: string;
    brand_id: string;
    name: string;
    description?: string;
    phases: string[];
    created_at?: string;
    updated_at?: string;
}

export interface Session {
    id: string;
    passcode: string;
    created_at: string;
}

export type PinnedItemType = 'asset' | 'short' | 'copy';

export interface PinnedForReview {
    id: string;
    brand_id: string;
    item_type: PinnedItemType;
    item_id?: string;
    text?: string;
    prompt?: string;
    image_url?: string;
    video_url?: string;
    created_at: string;
}

export interface BlogPost {
    id: string;
    brand_id: string;
    title: string;
    content: string;
    format: 'markdown' | 'html';
    created_at: string;
    gtm_phase?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIsoString(ts: Timestamp | FieldValue | undefined): string | undefined {
    if (!ts) return undefined;
    if (ts instanceof Timestamp) return ts.toDate().toISOString();
    return undefined;
}

function isNotFoundError(err: unknown): boolean {
    const code = (err as { code?: number })?.code;
    const msg = (err as { message?: string })?.message ?? '';
    return code === 5 || msg.includes('NOT_FOUND');
}

function logFirestoreError(context: string, err: unknown): void {
    if (isNotFoundError(err)) {
        console.error(
            `Firestore NOT_FOUND (${context}): The Firestore database does not exist. ` +
                'Create it at https://console.firebase.google.com → Your project → Firestore Database → Create database.'
        );
    } else {
        console.error(`Error ${context}:`, err);
    }
}

// ---------------------------------------------------------------------------
// Vibe Profiles
// ---------------------------------------------------------------------------

export async function getVibeProfile(id: string = 'default'): Promise<VibeProfile | null> {
    try {
        const doc = await db.collection('vibe_profiles').doc(id).get();
        if (!doc.exists) return null;
        const data = doc.data()!;
        return {
            id: doc.id,
            brand_identity: data.brand_identity ?? '',
            created_at: toIsoString(data.created_at as Timestamp),
            updated_at: toIsoString(data.updated_at as Timestamp),
        };
    } catch (error) {
        logFirestoreError('fetching vibe profile', error);
        return null;
    }
}

export async function upsertVibeProfile(profile: VibeProfile): Promise<VibeProfile | null> {
    try {
        const ref = db.collection('vibe_profiles').doc(profile.id);
        const now = FieldValue.serverTimestamp();
        const snapshot = await ref.get();
        const payload: Record<string, unknown> = {
            brand_identity: profile.brand_identity,
            updated_at: now,
        };
        if (!snapshot.exists) {
            payload.created_at = now;
        }
        await ref.set(payload, { merge: true });
        const doc = await ref.get();
        const d = doc.data()!;
        return {
            id: doc.id,
            brand_identity: (d.brand_identity as string) ?? profile.brand_identity,
            created_at: toIsoString(d.created_at as Timestamp),
            updated_at: toIsoString(d.updated_at as Timestamp),
        };
    } catch (error) {
        logFirestoreError('upserting vibe profile', error);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Session Logs
// ---------------------------------------------------------------------------

export async function insertSessionLog(brandId: string, summary: string): Promise<boolean> {
    try {
        await db.collection('session_logs').add({
            brand_id: brandId,
            summary,
            created_at: FieldValue.serverTimestamp(),
        });
        return true;
    } catch (error) {
        logFirestoreError('logging session', error);
        return false;
    }
}

export async function fetchSessionLogs(
    brandId: string,
    limit: number = 15
): Promise<SessionLog[]> {
    try {
        const snap = await db
            .collection('session_logs')
            .where('brand_id', '==', brandId)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .get();
        return snap.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                brand_id: d.brand_id,
                summary: d.summary ?? '',
                created_at: toIsoString(d.created_at as Timestamp) ?? '',
            };
        });
    } catch (error) {
        logFirestoreError('fetching session logs', error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Sessions (passcode-based restore)
// ---------------------------------------------------------------------------

export async function insertSession(
    sessionId: string,
    passcode: string
): Promise<Session | null> {
    try {
        const ref = db.collection('sessions').doc(sessionId);
        await ref.set({
            passcode,
            created_at: FieldValue.serverTimestamp(),
        });
        const doc = await ref.get();
        const d = doc.data()!;
        return {
            id: doc.id,
            passcode: d.passcode as string,
            created_at: toIsoString(d.created_at as Timestamp) ?? '',
        };
    } catch (error) {
        logFirestoreError('creating session', error);
        return null;
    }
}

export async function getSessionByPasscode(passcode: string): Promise<Session | null> {
    try {
        const snap = await db
            .collection('sessions')
            .where('passcode', '==', passcode.trim())
            .limit(1)
            .get();
        if (snap.empty || !snap.docs?.length) return null;
        const doc = snap.docs[0];
        const d = doc.data();
        return {
            id: doc.id,
            passcode: d.passcode as string,
            created_at: toIsoString(d.created_at as Timestamp) ?? '',
        };
    } catch (error) {
        logFirestoreError('looking up session by passcode', error);
        return null;
    }
}

// ---------------------------------------------------------------------------
// GTM Strategy (one per brand/session)
// ---------------------------------------------------------------------------

export async function getGtmStrategy(brandId: string): Promise<GtmStrategy | null> {
    try {
        const doc = await db.collection('gtm_strategies').doc(brandId).get();
        if (!doc.exists) return null;
        const d = doc.data()!;
        return {
            id: doc.id,
            brand_id: d.brand_id ?? brandId,
            name: d.name ?? '',
            description: d.description,
            phases: Array.isArray(d.phases) ? (d.phases as string[]) : [],
            created_at: toIsoString(d.created_at as Timestamp),
            updated_at: toIsoString(d.updated_at as Timestamp),
        };
    } catch (error) {
        logFirestoreError('fetching GTM strategy', error);
        return null;
    }
}

export async function upsertGtmStrategy(
    brandId: string,
    data: { name: string; description?: string; phases: string[] }
): Promise<GtmStrategy | null> {
    try {
        const ref = db.collection('gtm_strategies').doc(brandId);
        const now = FieldValue.serverTimestamp();
        const snapshot = await ref.get();
        const payload: Record<string, unknown> = {
            brand_id: brandId,
            name: data.name ?? '',
            phases: Array.isArray(data.phases) ? data.phases : [],
            updated_at: now,
        };
        if (data.description != null) payload.description = data.description;
        if (!snapshot.exists) {
            payload.created_at = now;
        }
        await ref.set(payload, { merge: true });
        const doc = await ref.get();
        const d = doc.data()!;
        return {
            id: doc.id,
            brand_id: (d.brand_id as string) ?? brandId,
            name: (d.name as string) ?? '',
            description: d.description as string | undefined,
            phases: Array.isArray(d.phases) ? (d.phases as string[]) : [],
            created_at: toIsoString(d.created_at as Timestamp),
            updated_at: toIsoString(d.updated_at as Timestamp),
        };
    } catch (error) {
        logFirestoreError('upserting GTM strategy', error);
        return null;
    }
}

/**
 * After a GTM strategy is updated, ensure that any tasks/assets/shorts that
 * reference phases no longer present in the strategy are reset to unassigned.
 */
export async function normalizeGtmPhasesForBrand(
    brandId: string,
    validPhases: string[]
): Promise<void> {
    const phaseSet = new Set(validPhases.filter(Boolean));
    try {
        // Marketing plans (tasks)
        const plansSnap = await db
            .collection('marketing_plans')
            .where('brand_id', '==', brandId)
            .get();
        const planBatch = db.batch();
        for (const doc of plansSnap.docs) {
            const d = doc.data();
            const phase = (d.gtm_phase as string | undefined) ?? undefined;
            if (phase && !phaseSet.has(phase)) {
                planBatch.update(doc.ref, { gtm_phase: null });
            }
        }
        await planBatch.commit();
    } catch (error) {
        logFirestoreError('normalizing GTM phases for marketing_plans', error);
    }

    try {
        // Brand assets
        const assetsSnap = await db
            .collection('brand_assets')
            .where('brand_id', '==', brandId)
            .get();
        const assetBatch = db.batch();
        for (const doc of assetsSnap.docs) {
            const d = doc.data();
            const phase = (d.gtm_phase as string | undefined) ?? undefined;
            if (phase && !phaseSet.has(phase)) {
                assetBatch.update(doc.ref, { gtm_phase: null });
            }
        }
        await assetBatch.commit();
    } catch (error) {
        logFirestoreError('normalizing GTM phases for brand_assets', error);
    }

    try {
        // Short videos
        const shortsSnap = await db
            .collection('short_videos')
            .where('brand_id', '==', brandId)
            .get();
        const shortBatch = db.batch();
        for (const doc of shortsSnap.docs) {
            const d = doc.data();
            const phase = (d.gtm_phase as string | undefined) ?? undefined;
            if (phase && !phaseSet.has(phase)) {
                shortBatch.update(doc.ref, { gtm_phase: null });
            }
        }
        await shortBatch.commit();
    } catch (error) {
        logFirestoreError('normalizing GTM phases for short_videos', error);
    }
}

// ---------------------------------------------------------------------------
// Marketing Plans (Kanban)
// ---------------------------------------------------------------------------

export async function fetchMarketingPlans(brandId: string): Promise<MarketingPlan[]> {
    try {
        const snap = await db
            .collection('marketing_plans')
            .where('brand_id', '==', brandId)
            .orderBy('created_at', 'desc')
            .get();
        return snap.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                brand_id: d.brand_id,
                title: d.title ?? '',
                platform: d.platform,
                priority: (d.priority as 'high' | 'medium' | 'low') ?? undefined,
                description: d.description,
                image_url: d.image_url,
                video_url: d.video_url,
                video_asset_id: d.video_asset_id,
                caption: d.caption,
                tags: d.tags as string[] | undefined,
                status: (d.status as MarketingPlanStatus) ?? 'draft',
                created_at: toIsoString(d.created_at as Timestamp) ?? '',
                gtm_phase: d.gtm_phase as string | undefined,
            };
        });
    } catch (error) {
        logFirestoreError('fetching marketing plans', error);
        return [];
    }
}

export async function insertMarketingPlan(
    brandId: string,
    data: {
        title: string;
        platform: string;
        priority: 'high' | 'medium' | 'low';
        description: string;
        image_url?: string;
        video_url?: string;
        video_asset_id?: string;
        caption?: string;
        tags?: string[];
        status?: MarketingPlanStatus;
        gtm_phase?: string;
    }
): Promise<MarketingPlan | null> {
    try {
        const payload: Record<string, unknown> = {
            brand_id: brandId,
            title: data.title ?? '',
            platform: data.platform ?? 'Multi-channel',
            priority: data.priority ?? 'medium',
            description: data.description ?? '',
            status: data.status ?? 'draft',
            created_at: FieldValue.serverTimestamp(),
        };
        if (data.image_url != null) payload.image_url = data.image_url;
        if (data.video_url != null) payload.video_url = data.video_url;
        if (data.video_asset_id != null) payload.video_asset_id = data.video_asset_id;
        if (data.caption != null) payload.caption = data.caption;
        if (data.tags != null) payload.tags = data.tags;
        if (data.gtm_phase != null) payload.gtm_phase = data.gtm_phase;

        const ref = await db.collection('marketing_plans').add(payload);
        const doc = await ref.get();
        const d = doc.data()!;
        return {
            id: doc.id,
            brand_id: d.brand_id,
            title: d.title,
            platform: d.platform,
            priority: (d.priority as 'high' | 'medium' | 'low') ?? undefined,
            description: d.description,
            image_url: d.image_url,
            video_url: d.video_url,
            video_asset_id: d.video_asset_id,
            caption: d.caption,
            tags: d.tags as string[] | undefined,
            status: (d.status as MarketingPlanStatus) ?? 'draft',
            created_at: toIsoString(d.created_at as Timestamp) ?? '',
            gtm_phase: d.gtm_phase as string | undefined,
        };
    } catch (error) {
        logFirestoreError('creating marketing plan', error);
        return null;
    }
}

export async function updateMarketingPlanStatus(
    brandId: string,
    planId: string,
    status: MarketingPlanStatus
): Promise<boolean> {
    try {
        const ref = db.collection('marketing_plans').doc(planId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        await ref.update({ status });
        return true;
    } catch (error) {
        logFirestoreError('updating marketing plan status', error);
        return false;
    }
}

export async function updateMarketingPlanPhase(
    brandId: string,
    planId: string,
    gtmPhase: string | null
): Promise<boolean> {
    try {
        const ref = db.collection('marketing_plans').doc(planId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        await ref.update({ gtm_phase: gtmPhase ?? null });
        return true;
    } catch (error) {
        logFirestoreError('updating marketing plan phase', error);
        return false;
    }
}

export async function deleteMarketingPlan(
    brandId: string,
    planId: string
): Promise<boolean> {
    try {
        const ref = db.collection('marketing_plans').doc(planId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        await ref.delete();
        return true;
    } catch (error) {
        logFirestoreError('deleting marketing plan', error);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Brand Assets
// ---------------------------------------------------------------------------

export async function getBrandAssetById(
    brandId: string,
    assetId: string
): Promise<BrandAsset | null> {
    try {
        const doc = await db.collection('brand_assets').doc(assetId).get();
        if (!doc.exists) return null;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return null;
        return {
            id: doc.id,
            brand_id: d.brand_id,
            prompt: d.prompt ?? '',
            image_url: d.image_url ?? '',
            status: d.status ?? 'done',
            created_at: toIsoString(d.created_at as Timestamp) ?? '',
            gtm_phase: d.gtm_phase as string | undefined,
        };
    } catch (error) {
        logFirestoreError('fetching brand asset by id', error);
        return null;
    }
}

export async function insertBrandAsset(
    brandId: string,
    prompt: string,
    imageUrl: string,
    status: string = 'done'
): Promise<{ id: string } | null> {
    try {
        const ref = await db.collection('brand_assets').add({
            brand_id: brandId,
            prompt,
            image_url: imageUrl,
            status,
            created_at: FieldValue.serverTimestamp(),
        });
        return { id: ref.id };
    } catch (error) {
        logFirestoreError('saving brand asset', error);
        return null;
    }
}

export async function fetchBrandAssets(brandId: string): Promise<BrandAsset[]> {
    try {
        const snap = await db
            .collection('brand_assets')
            .where('brand_id', '==', brandId)
            .orderBy('created_at', 'desc')
            .get();
        return snap.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                brand_id: d.brand_id,
                prompt: d.prompt ?? '',
                image_url: d.image_url ?? '',
                status: d.status ?? 'done',
                created_at: toIsoString(d.created_at as Timestamp) ?? '',
                gtm_phase: d.gtm_phase as string | undefined,
            };
        });
    } catch (error) {
        logFirestoreError('fetching brand assets', error);
        return [];
    }
}

export async function updateBrandAssetPhase(
    brandId: string,
    assetId: string,
    gtmPhase: string | null
): Promise<boolean> {
    try {
        const ref = db.collection('brand_assets').doc(assetId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        await ref.update({ gtm_phase: gtmPhase ?? null });
        return true;
    } catch (error) {
        logFirestoreError('updating brand asset phase', error);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Short Videos
// ---------------------------------------------------------------------------

export async function getShortVideoById(
    brandId: string,
    videoId: string
): Promise<ShortVideo | null> {
    try {
        const doc = await db.collection('short_videos').doc(videoId).get();
        if (!doc.exists) return null;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return null;
        return {
            id: doc.id,
            brand_id: d.brand_id,
            prompt: d.prompt ?? '',
            video_url: d.video_url,
            reference_asset_ids: d.reference_asset_ids as string[] | undefined,
            duration_seconds: d.duration_seconds,
            platform: d.platform,
            status: (d.status as ShortVideoStatus) ?? 'generating',
            operation_name: d.operation_name,
            created_at: toIsoString(d.created_at as Timestamp) ?? '',
            gtm_phase: d.gtm_phase as string | undefined,
        };
    } catch (error) {
        logFirestoreError('fetching short video by id', error);
        return null;
    }
}

export async function insertShortVideo(
    brandId: string,
    data: {
        prompt: string;
        reference_asset_ids?: string[];
        duration_seconds?: number;
        platform?: string;
        status: ShortVideoStatus;
        operation_name?: string;
    }
): Promise<{ id: string } | null> {
    try {
        const ref = await db.collection('short_videos').add({
            brand_id: brandId,
            prompt: data.prompt,
            reference_asset_ids: data.reference_asset_ids ?? [],
            duration_seconds: data.duration_seconds ?? 6,
            platform: data.platform ?? 'tiktok',
            status: data.status,
            operation_name: data.operation_name,
            created_at: FieldValue.serverTimestamp(),
        });
        return { id: ref.id };
    } catch (error) {
        logFirestoreError('saving short video', error);
        return null;
    }
}

export async function updateShortVideo(
    brandId: string,
    videoId: string,
    updates: Partial<Pick<ShortVideo, 'video_url' | 'status'>>
): Promise<boolean> {
    try {
        const ref = db.collection('short_videos').doc(videoId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        const payload: Record<string, unknown> = {};
        if (updates.video_url != null) payload.video_url = updates.video_url;
        if (updates.status != null) payload.status = updates.status;
        if (Object.keys(payload).length > 0) {
            await ref.update(payload);
        }
        return true;
    } catch (error) {
        logFirestoreError('updating short video', error);
        return false;
    }
}

export async function deleteShortVideo(brandId: string, videoId: string): Promise<boolean> {
    try {
        const ref = db.collection('short_videos').doc(videoId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        await ref.delete();
        return true;
    } catch (error) {
        logFirestoreError('deleting short video', error);
        return false;
    }
}

const STALE_GENERATING_MINUTES = 10;

function isStaleGenerating(createdAtIso: string | undefined): boolean {
    if (!createdAtIso) return true;
    try {
        const created = new Date(createdAtIso).getTime();
        const cutoff = Date.now() - STALE_GENERATING_MINUTES * 60 * 1000;
        return created < cutoff;
    } catch {
        return true;
    }
}

/**
 * Returns true if this brand already has a short video with status 'generating'
 * that is NOT stale (created within last 10 min). Stale jobs are auto-marked error.
 */
export async function hasGeneratingShortVideo(brandId: string): Promise<boolean> {
    try {
        const snap = await db
            .collection('short_videos')
            .where('brand_id', '==', brandId)
            .orderBy('created_at', 'desc')
            .limit(20)
            .get();
        let hasActive = false;
        for (const doc of snap.docs) {
            const d = doc.data();
            const status = d.status ?? '';
            const createdAt = toIsoString(d.created_at as Timestamp);
            if (status === 'generating') {
                if (isStaleGenerating(createdAt)) {
                    await db.collection('short_videos').doc(doc.id).update({ status: 'error' });
                } else {
                    hasActive = true;
                    break;
                }
            }
        }
        return hasActive;
    } catch (error) {
        logFirestoreError('checking generating short video', error);
        return false; // Allow generation if check fails to avoid blocking
    }
}

/**
 * Returns today's short-form video usage for a brand (UTC day window).
 * Counts non-error videos created since midnight UTC and sums their durations.
 */
export async function getShortVideoUsageForToday(
    brandId: string
): Promise<{ count: number; totalDurationSeconds: number }> {
    try {
        const now = new Date();
        const startOfDayUtc = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
        );
        const snapshot = await db
            .collection('short_videos')
            .where('brand_id', '==', brandId)
            .where('created_at', '>=', Timestamp.fromDate(startOfDayUtc))
            .get();

        let count = 0;
        let totalDurationSeconds = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const status = (data.status as ShortVideoStatus) ?? 'generating';
            if (status === 'error') continue;
            count += 1;
            const duration = typeof data.duration_seconds === 'number' ? data.duration_seconds : 0;
            totalDurationSeconds += duration;
        }

        return { count, totalDurationSeconds };
    } catch (error) {
        logFirestoreError('fetching today short video usage', error);
        // Fail-open to avoid hard blocking if usage check breaks
        return { count: 0, totalDurationSeconds: 0 };
    }
}

export async function fetchShortVideos(brandId: string): Promise<ShortVideo[]> {
    try {
        const snap = await db
            .collection('short_videos')
            .where('brand_id', '==', brandId)
            .orderBy('created_at', 'desc')
            .get();
        return snap.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                brand_id: d.brand_id,
                prompt: d.prompt ?? '',
                video_url: d.video_url,
                reference_asset_ids: d.reference_asset_ids as string[] | undefined,
                duration_seconds: d.duration_seconds,
                platform: d.platform,
                status: (d.status as ShortVideoStatus) ?? 'generating',
                operation_name: d.operation_name,
                created_at: toIsoString(d.created_at as Timestamp) ?? '',
                gtm_phase: d.gtm_phase as string | undefined,
            };
        });
    } catch (error) {
        logFirestoreError('fetching short videos', error);
        return [];
    }
}

export async function updateShortVideoPhase(
    brandId: string,
    videoId: string,
    gtmPhase: string | null
): Promise<boolean> {
    try {
        const ref = db.collection('short_videos').doc(videoId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        await ref.update({ gtm_phase: gtmPhase ?? null });
        return true;
    } catch (error) {
        logFirestoreError('updating short video phase', error);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Pinned for Review (Launch Pack)
// ---------------------------------------------------------------------------

export async function insertPinnedForReview(
    brandId: string,
    data: {
        item_type: PinnedItemType;
        item_id?: string;
        text?: string;
        prompt?: string;
        image_url?: string;
        video_url?: string;
    }
): Promise<{ id: string } | null> {
    try {
        const ref = await db.collection('pinned_for_review').add({
            brand_id: brandId,
            item_type: data.item_type,
            item_id: data.item_id ?? null,
            text: data.text ?? null,
            prompt: data.prompt ?? null,
            image_url: data.image_url ?? null,
            video_url: data.video_url ?? null,
            created_at: FieldValue.serverTimestamp(),
        });
        return { id: ref.id };
    } catch (error) {
        logFirestoreError('saving pinned item', error);
        return null;
    }
}

export async function deletePinnedForReview(brandId: string, pinId: string): Promise<boolean> {
    try {
        const ref = db.collection('pinned_for_review').doc(pinId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        await ref.delete();
        return true;
    } catch (error) {
        logFirestoreError('deleting pinned item', error);
        return false;
    }
}

export async function fetchPinnedForReview(brandId: string): Promise<PinnedForReview[]> {
    try {
        const snap = await db
            .collection('pinned_for_review')
            .where('brand_id', '==', brandId)
            .orderBy('created_at', 'desc')
            .get();
        return snap.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                brand_id: d.brand_id,
                item_type: (d.item_type as PinnedItemType) ?? 'copy',
                item_id: d.item_id,
                text: d.text,
                prompt: d.prompt,
                image_url: d.image_url,
                video_url: d.video_url,
                created_at: toIsoString(d.created_at as Timestamp) ?? '',
            };
        });
    } catch (error) {
        logFirestoreError('fetching pinned items', error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Blog Posts
// ---------------------------------------------------------------------------

export async function insertBlogPost(
    brandId: string,
    data: {
        title: string;
        content: string;
        format: 'markdown' | 'html';
        gtm_phase?: string;
    }
): Promise<BlogPost | null> {
    try {
        const ref = await db.collection('blog_posts').add({
            brand_id: brandId,
            title: data.title ?? '',
            content: data.content ?? '',
            format: data.format ?? 'markdown',
            gtm_phase: data.gtm_phase ?? null,
            created_at: FieldValue.serverTimestamp(),
        });
        const doc = await ref.get();
        const d = doc.data()!;
        return {
            id: doc.id,
            brand_id: d.brand_id,
            title: d.title ?? '',
            content: d.content ?? '',
            format: (d.format as 'markdown' | 'html') ?? 'markdown',
            created_at: toIsoString(d.created_at as Timestamp) ?? '',
            gtm_phase: d.gtm_phase as string | undefined,
        };
    } catch (error) {
        logFirestoreError('creating blog post', error);
        return null;
    }
}

export async function fetchBlogPosts(
    brandId: string,
    limit: number = 20
): Promise<BlogPost[]> {
    try {
        const snap = await db
            .collection('blog_posts')
            .where('brand_id', '==', brandId)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .get();
        return snap.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                brand_id: d.brand_id,
                title: d.title ?? '',
                content: d.content ?? '',
                format: (d.format as 'markdown' | 'html') ?? 'markdown',
                created_at: toIsoString(d.created_at as Timestamp) ?? '',
                gtm_phase: d.gtm_phase as string | undefined,
            };
        });
    } catch (error) {
        logFirestoreError('fetching blog posts', error);
        return [];
    }
}

export async function updateBlogPostPhase(
    brandId: string,
    postId: string,
    gtmPhase: string | null
): Promise<boolean> {
    try {
        const ref = db.collection('blog_posts').doc(postId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data()!;
        if (d.brand_id !== brandId) return false;
        await ref.update({ gtm_phase: gtmPhase ?? null });
        return true;
    } catch (error) {
        logFirestoreError('updating blog post phase', error);
        return false;
    }
}

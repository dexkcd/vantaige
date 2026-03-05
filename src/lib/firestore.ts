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
}

export interface MarketingPlan {
    id: string;
    brand_id: string;
    title: string;
    platform?: string;
    priority?: 'high' | 'medium' | 'low';
    description?: string;
    created_at: string;
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
                created_at: toIsoString(d.created_at as Timestamp) ?? '',
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
    }
): Promise<MarketingPlan | null> {
    try {
        const ref = await db.collection('marketing_plans').add({
            brand_id: brandId,
            title: data.title,
            platform: data.platform,
            priority: data.priority,
            description: data.description,
            created_at: FieldValue.serverTimestamp(),
        });
        const doc = await ref.get();
        const d = doc.data()!;
        return {
            id: doc.id,
            brand_id: d.brand_id,
            title: d.title,
            platform: d.platform,
            priority: (d.priority as 'high' | 'medium' | 'low') ?? undefined,
            description: d.description,
            created_at: toIsoString(d.created_at as Timestamp) ?? '',
        };
    } catch (error) {
        logFirestoreError('creating marketing plan', error);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Brand Assets
// ---------------------------------------------------------------------------

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
            };
        });
    } catch (error) {
        logFirestoreError('fetching brand assets', error);
        return [];
    }
}

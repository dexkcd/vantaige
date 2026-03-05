/**
 * Upload brand asset images to Firebase Storage and return public URLs.
 * Firestore string fields are limited to 1,048,487 bytes; images exceed this,
 * so we store them in Cloud Storage and keep only the URL in Firestore.
 */
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';

const FIRESTORE_STRING_LIMIT = 1_048_487;

/**
 * Upload image bytes to Storage and return a public URL.
 * Caller must ensure the Firebase app is initialized (e.g. via firestore.ts).
 */
export async function uploadBrandAssetImage(
    brandId: string,
    imageData: string,
    mimeType: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<string> {
    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const path = `brand-assets/${brandId}/${randomUUID()}.${ext}`;

    let buffer: Buffer;
    if (imageData.startsWith('data:')) {
        const base64 = imageData.split(',')[1];
        if (!base64) throw new Error('Invalid data URL');
        buffer = Buffer.from(base64, 'base64');
    } else {
        buffer = Buffer.from(imageData, 'base64');
    }

    const bucket = getStorage().bucket();
    if (!bucket) throw new Error('Storage bucket not configured');

    const file = bucket.file(path);
    await file.save(buffer, {
        metadata: { contentType: mimeType },
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
}

/**
 * Returns a Storage URL if the image exceeds Firestore's limit, otherwise the original value.
 */
export function resolveImageUrlForFirestore(
    imageUrl: string,
    brandId: string
): Promise<string> {
    const len = Buffer.byteLength(imageUrl, 'utf8');
    if (len <= FIRESTORE_STRING_LIMIT) return Promise.resolve(imageUrl);

    const mimeType = imageUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    const base64 = imageUrl.startsWith('data:') ? imageUrl : `data:${mimeType};base64,${imageUrl}`;
    return uploadBrandAssetImage(brandId, base64, mimeType);
}

/**
 * Returns a proxy URL for a GCS file (e.g. Veo video output).
 * Uses /api/asset to stream the file, avoiding signBlob on Cloud Run.
 * Format: gs://bucket-name/path/to/file.mp4
 */
export function getProxyUrlForGcsPath(gcsUri: string): string {
    if (!gcsUri.startsWith('gs://')) throw new Error(`Invalid GCS URI: ${gcsUri}`);
    return `/api/asset?uri=${encodeURIComponent(gcsUri)}`;
}

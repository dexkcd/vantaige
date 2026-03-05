/**
 * Proxy for Firebase Storage brand asset images.
 * Streams from Storage using service account credentials (avoids 403 from public access).
 */
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import '@/lib/firestore'; // ensure Firebase app is initialized

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    const uri = request.nextUrl.searchParams.get('uri');
    const input = url || uri;
    if (!input || typeof input !== 'string') {
        return NextResponse.json({ error: 'Missing url or uri parameter' }, { status: 400 });
    }

    let bucketName: string;
    let path: string;

    const firebaseMatch = input.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
    const gcsMatch = input.match(/^gs:\/\/([^/]+)\/(.+)$/);

    if (firebaseMatch) {
        [, bucketName, path] = firebaseMatch;
        path = decodeURIComponent(path);
    } else if (gcsMatch) {
        [, bucketName, path] = gcsMatch;
    } else {
        return NextResponse.json({ error: 'Invalid URL: expected firebasestorage or gs:// URI' }, { status: 400 });
    }

    try {
        const bucket = getStorage().bucket(bucketName);
        if (!bucket) {
            return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
        }
        const file = bucket.file(path);
        const [exists] = await file.exists();
        if (!exists) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        const [metadata] = await file.getMetadata();
        const contentType = metadata?.contentType ||
            (path.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'image/png');
        const nodeStream = file.createReadStream();
        const webStream = Readable.toWeb(nodeStream) as ReadableStream;
        return new NextResponse(webStream, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (err) {
        console.error('[asset proxy]', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to fetch asset' },
            { status: 500 }
        );
    }
}

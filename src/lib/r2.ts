import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import { getEnv } from './env';

let s3: S3Client | null = null;

function getClient(): S3Client | null {
  if (s3) return s3;
  const accountId  = getEnv('R2_ACCOUNT_ID');
  const accessKey  = getEnv('R2_ACCESS_KEY_ID');
  const secretKey  = getEnv('R2_SECRET_ACCESS_KEY');
  if (!accountId || !accessKey || !secretKey) return null;
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  return s3;
}

export function isR2Configured(): boolean {
  return !!(
    getEnv('R2_ACCOUNT_ID') &&
    getEnv('R2_ACCESS_KEY_ID') &&
    getEnv('R2_SECRET_ACCESS_KEY') &&
    getEnv('R2_BUCKET_NAME') &&
    getEnv('R2_PUBLIC_URL')
  );
}

export function isBase64Photo(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith('data:');
}

/**
 * Upload a base64 data URL to R2.
 * Returns the public URL on success, or null on failure/misconfiguration.
 */
export async function uploadBase64ToR2(
  dataUrl: string,
  folder = 'photos'
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const bucket    = getEnv('R2_BUCKET_NAME');
  const publicUrl = getEnv('R2_PUBLIC_URL');
  if (!bucket || !publicUrl) return null;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;

  const mimeType = match[1];
  const data     = Buffer.from(match[2], 'base64');
  const ext      = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const key      = `${folder}/${randomBytes(16).toString('hex')}.${ext}`;

  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: mimeType,
    }));
    const base = publicUrl.replace(/\/$/, '');
    return `${base}/${key}`;
  } catch (err) {
    console.error('[R2] Upload failed:', err);
    return null;
  }
}

/**
 * Upload all base64 photos in an array to R2.
 * Non-base64 strings (already URLs) are kept as-is.
 */
export async function uploadPhotosArray(
  photos: string[],
  folder = 'photos'
): Promise<string[]> {
  return Promise.all(
    photos.map(async p => {
      if (!isBase64Photo(p)) return p;
      const url = await uploadBase64ToR2(p, folder);
      return url ?? p; // fallback: keep base64 if upload fails
    })
  );
}

/**
 * Walk a products array and upload any base64 photos to R2.
 * Returns a new array with URLs replacing base64 strings.
 */
export async function uploadProductsPhotos(
  products: any[],
  folder = 'photos'
): Promise<any[]> {
  return Promise.all(
    products.map(async (p: any) => {
      if (!Array.isArray(p.photos) || p.photos.length === 0) return p;
      const photos = await uploadPhotosArray(p.photos, folder);
      return { ...p, photos };
    })
  );
}

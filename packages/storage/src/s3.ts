import { env } from "@acme/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Built lazily (on first actual use) rather than at module load — importing
// this module happens during the app's build (bundling, route analysis),
// where storage credentials aren't necessarily set yet.
let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are required",
    );
  }

  const s3Endpoint = env.AWS_S3_ENDPOINT;
  s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // AWS SDK v3 adds x-amz-checksum-* to presigned PutObject URLs by default,
    // but those params aren't in SignedHeaders — Yandex Object Storage then
    // rejects the upload as AccessDenied ("headers ... not signed"), which
    // the browser reports as an opaque CORS failure.
    requestChecksumCalculation: "WHEN_REQUIRED",
    ...(s3Endpoint
      ? {
          endpoint: s3Endpoint,
          // Path-style by default when a custom endpoint is set — required by
          // MinIO locally; Yandex Cloud Object Storage supports virtual-hosted
          // style, so set AWS_S3_FORCE_PATH_STYLE=false in production.
          forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE !== "false",
        }
      : {}),
  });
  return s3Client;
}

const BUCKET_NAME = env.AWS_S3_BUCKET;
export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

export async function createPresignedUrl(
  key: string,
  contentLength: number,
): Promise<string> {
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_UPLOAD_SIZE_BYTES
  ) {
    throw new RangeError(
      `Upload size must be between 1 and ${MAX_UPLOAD_SIZE_BYTES} bytes`,
    );
  }
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: "application/octet-stream",
    ContentLength: contentLength,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 }); // 1 hour
}

export function generateS3Key(originalKey: string, temporary = false): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const prefix = temporary ? "temp" : "uploads";

  return `${prefix}/${timestamp}-${randomId}-${originalKey}`;
}

export async function uploadBufferToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string,
): Promise<{ key: string; bucket: string; etag?: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType ?? "application/octet-stream",
  });
  try {
    const res = await getS3Client().send(command);
    return { key, bucket: BUCKET_NAME, etag: res.ETag };
  } catch (err) {
    const e = err as Error;
    console.error("S3 upload failed", {
      bucket: BUCKET_NAME,
      key,
      error: e?.message ?? String(err),
      stack: e?.stack,
    });
    throw new Error(
      `Failed to upload to S3 bucket '${BUCKET_NAME}' key '${key}': ${e?.message ?? String(err)}`,
    );
  }
}

export async function getDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 }); // 1 hour
}

export async function deleteObjectFromS3(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
  );
}

/** Fetches an object's bytes directly — for server-side processing (parsing, ingestion) rather than a browser download. */
export async function downloadBufferFromS3(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  const res = await getS3Client().send(command);
  if (!res.Body) {
    throw new Error(`S3 object '${key}' has no body`);
  }
  if (
    typeof res.ContentLength !== "number" ||
    !Number.isSafeInteger(res.ContentLength)
  ) {
    throw new Error(`S3 object '${key}' has no valid content length`);
  }
  if (res.ContentLength > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`S3 object '${key}' exceeds the maximum upload size`);
  }
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

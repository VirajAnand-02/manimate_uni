import 'server-only';
import fs from 'fs';
import fsp from 'fs/promises';
import * as tus from 'tus-js-client';
import { adminClient } from '@/src/lib/supabase/admin';
import { storageBucket, supabaseServiceRoleKey, supabaseUrl } from '@/src/lib/supabase/env';
import { sanitizeSegment } from './workspace';
import { pool } from './concurrency';

/** Supabase's resumable endpoint requires exactly 6 MB chunks. */
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

/** Above this, upload resumably so a network blip doesn't discard a long render. */
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;

export function jobPrefix(userId: string, jobId: string) {
  return `${sanitizeSegment(userId)}/${sanitizeSegment(jobId)}`;
}

export function videoKey(userId: string, jobId: string) {
  return `${jobPrefix(userId, jobId)}/video.mp4`;
}

/**
 * Upload a local file to the job's folder in Storage.
 * `relPath` is relative to the job prefix, e.g. "video.mp4" or "scene_code/x.py".
 */
export async function uploadArtifact(
  userId: string,
  jobId: string,
  relPath: string,
  localFile: string,
  contentType = 'application/octet-stream',
): Promise<string> {
  const key = `${jobPrefix(userId, jobId)}/${relPath}`;
  const { size } = await fsp.stat(localFile);

  if (size >= RESUMABLE_THRESHOLD) {
    await resumableUpload(key, localFile, size, contentType);
  } else {
    const body = await fsp.readFile(localFile);
    const { error } = await adminClient()
      .storage.from(storageBucket())
      .upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed for ${key}: ${error.message}`);
  }

  return key;
}

function resumableUpload(
  key: string,
  localFile: string,
  size: number,
  contentType: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(fs.createReadStream(localFile), {
      endpoint: `${supabaseUrl()}/storage/v1/upload/resumable`,
      uploadSize: size,
      chunkSize: TUS_CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 8000],
      headers: {
        authorization: `Bearer ${supabaseServiceRoleKey()}`,
        'x-upsert': 'true',
      },
      metadata: {
        bucketName: storageBucket(),
        objectName: key,
        contentType,
        cacheControl: '3600',
      },
      onError: (error) => reject(new Error(`Resumable upload failed for ${key}: ${error.message}`)),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

/** Upload every file in a local directory under `relDir` in Storage. */
export async function uploadDirectory(
  userId: string,
  jobId: string,
  localDir: string,
  relDir: string,
  contentType = 'text/plain',
) {
  const entries = await fsp.readdir(localDir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile());
  // These are small text files uploaded at the very end of a job; serialising
  // them just added round trips to the tail of every render.
  await pool(files, 6, (entry) =>
    uploadArtifact(
      userId,
      jobId,
      `${relDir}/${entry.name}`,
      `${localDir}/${entry.name}`,
      contentType,
    ).catch((err) => {
      // Scene code is a debugging nicety — never fail a finished render over it.
      console.warn(`[Job ${jobId}] could not upload ${entry.name}:`, err);
    }));
}

/**
 * Short-lived signed URL for a private object.
 * Passing `downloadAs` makes Storage send Content-Disposition: attachment.
 */
export async function signedUrl(
  key: string,
  expiresInSeconds = 3600,
  downloadAs?: string,
): Promise<string | null> {
  const { data, error } = await adminClient()
    .storage.from(storageBucket())
    .createSignedUrl(key, expiresInSeconds, downloadAs ? { download: downloadAs } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Delete everything stored for a job. */
export async function removeJobArtifacts(userId: string, jobId: string) {
  const prefix = jobPrefix(userId, jobId);
  const bucket = adminClient().storage.from(storageBucket());

  const keys: string[] = [];
  const walk = async (dir: string) => {
    const { data } = await bucket.list(dir, { limit: 1000 });
    for (const item of data ?? []) {
      const full = `${dir}/${item.name}`;
      // Storage fakes directories: entries without metadata are prefixes.
      if (item.id === null) await walk(full);
      else keys.push(full);
    }
  };

  await walk(prefix);
  if (keys.length) await bucket.remove(keys);
}

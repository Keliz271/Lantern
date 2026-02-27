import { json } from '@sveltejs/kit';
import { writeFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readPrivateEnv } from '$serverlib/env';

const resolveUploadsDir = () => {
  const override = String(readPrivateEnv('LANTERN_UPLOADS_PATH', 'DASHBOARD_UPLOADS_PATH') ?? '').trim();
  if (override) return path.resolve(override);
  return path.resolve(process.cwd(), 'static/uploads');
};

const resolveMaxUploadBytes = () => {
  const mb = Number(readPrivateEnv('LANTERN_MAX_UPLOAD_MB', 'DASHBOARD_MAX_UPLOAD_MB') ?? 12);
  const safeMb = Number.isFinite(mb) ? Math.min(128, Math.max(1, mb)) : 12;
  return Math.floor(safeMb * 1024 * 1024);
};

const resolveMaxUploadBodyBytes = () => {
  const mb = Number(readPrivateEnv('LANTERN_MAX_UPLOAD_BODY_MB', 'DASHBOARD_MAX_UPLOAD_BODY_MB') ?? 16);
  const safeMb = Number.isFinite(mb) ? Math.min(256, Math.max(2, mb)) : 16;
  return Math.floor(safeMb * 1024 * 1024);
};

const resolveMaxStoredUploadBytes = () => {
  const mb = Number(
    readPrivateEnv('LANTERN_MAX_UPLOAD_STORAGE_MB', 'DASHBOARD_MAX_UPLOAD_STORAGE_MB') ?? 512
  );
  const safeMb = Number.isFinite(mb) ? Math.min(8192, Math.max(64, mb)) : 512;
  return Math.floor(safeMb * 1024 * 1024);
};

type UploadFileInfo = {
  path: string;
  size: number;
  mtimeMs: number;
};

const isManagedUploadFileName = (name: string) =>
  /^background-[0-9a-f-]+\.(png|jpg|gif|webp)$/i.test(name);

const listUploadFiles = async (uploadsDir: string): Promise<UploadFileInfo[]> => {
  const entries = await readdir(uploadsDir, { withFileTypes: true }).catch(() => []);
  const files: UploadFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isManagedUploadFileName(entry.name)) continue;
    const filePath = path.join(uploadsDir, entry.name);
    const metadata = await stat(filePath).catch(() => null);
    if (!metadata) continue;
    files.push({
      path: filePath,
      size: Math.max(0, metadata.size),
      mtimeMs: Number.isFinite(metadata.mtimeMs) ? metadata.mtimeMs : 0
    });
  }

  return files;
};

const enforceUploadStorageQuota = async (uploadsDir: string, incomingBytes: number) => {
  const maxStoredBytes = resolveMaxStoredUploadBytes();
  if (incomingBytes > maxStoredBytes) {
    throw new Error('upload_exceeds_storage_quota');
  }

  const files = await listUploadFiles(uploadsDir);
  let usedBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (usedBytes + incomingBytes <= maxStoredBytes) return;

  const filesByOldest = files.sort((left, right) => left.mtimeMs - right.mtimeMs);
  for (const file of filesByOldest) {
    if (usedBytes + incomingBytes <= maxStoredBytes) break;
    await unlink(file.path).catch(() => {});
    usedBytes = Math.max(0, usedBytes - file.size);
  }

  if (usedBytes + incomingBytes > maxStoredBytes) {
    throw new Error('upload_storage_quota_unavailable');
  }
};

const detectImageExtension = (buffer: Buffer) => {
  if (buffer.length < 12) return null;
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return '.png';
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  // GIF
  const header6 = buffer.subarray(0, 6).toString('ascii');
  if (header6 === 'GIF87a' || header6 === 'GIF89a') {
    return '.gif';
  }
  // WebP: "RIFF" .... "WEBP"
  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') {
    return '.webp';
  }

  return null;
};

export const POST = async ({ request }) => {
  const maxUploadBodyBytes = resolveMaxUploadBodyBytes();
  const contentLengthHeader = request.headers.get('content-length');
  const contentLength = Number(contentLengthHeader ?? NaN);
  if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength <= 0) {
    return json(
      {
        error: 'Content-Length header is required for uploads.'
      },
      { status: 411 }
    );
  }
  if (contentLength > maxUploadBodyBytes) {
    return json(
      {
        error: `Upload request is too large. Maximum request size is ${Math.round(maxUploadBodyBytes / (1024 * 1024))}MB.`
      },
      { status: 413 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return json({ error: 'No file provided' }, { status: 400 });
  }

  const maxUploadBytes = resolveMaxUploadBytes();
  if (file.size > maxUploadBytes) {
    return json(
      { error: `File is too large. Maximum upload size is ${Math.round(maxUploadBytes / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeExt = detectImageExtension(buffer);
  if (!safeExt) {
    return json({ error: 'Unsupported file type. Upload a PNG, JPEG, GIF, or WebP image.' }, { status: 415 });
  }
  const filename = `background-${randomUUID()}${safeExt}`;

  const uploadsDir = resolveUploadsDir();
  await mkdir(uploadsDir, { recursive: true });
  try {
    await enforceUploadStorageQuota(uploadsDir, buffer.byteLength);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'upload_exceeds_storage_quota' ||
        error.message === 'upload_storage_quota_unavailable')
    ) {
      return json(
        {
          error:
            'Upload storage quota reached. Delete older uploads or raise LANTERN_MAX_UPLOAD_STORAGE_MB.'
        },
        { status: 507 }
      );
    }
    throw error;
  }
  await writeFile(path.join(uploadsDir, filename), buffer);

  return json({ path: `/uploads/${filename}` });
};

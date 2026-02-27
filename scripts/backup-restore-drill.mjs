import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = new Set(process.argv.slice(2));

if (args.has('--help')) {
  process.stdout.write(`Usage: node scripts/backup-restore-drill.mjs [--keep-restore]\n`);
  process.stdout.write(`Creates a backup of widgets config + uploads, then verifies restore in a temp directory.\n`);
  process.exit(0);
}

const keepRestore = args.has('--keep-restore');
const readEnv = (key, legacyKey) => process.env[key] ?? (legacyKey ? process.env[legacyKey] : undefined);

const resolveConfigPath = () => {
  const override = String(readEnv('LANTERN_CONFIG_PATH', 'DASHBOARD_CONFIG_PATH') ?? '').trim();
  if (override) return path.resolve(override);
  const dockerMounted = '/config/widgets.json';
  if (existsSync(dockerMounted)) return dockerMounted;
  return path.resolve(process.cwd(), 'config/widgets.json');
};

const resolveUploadsDir = () => {
  const override = String(readEnv('LANTERN_UPLOADS_PATH', 'DASHBOARD_UPLOADS_PATH') ?? '').trim();
  if (override) return path.resolve(override);
  return path.resolve(process.cwd(), 'static/uploads');
};

const resolveBackupRoot = () => {
  const override = String(readEnv('LANTERN_BACKUP_DIR', 'DASHBOARD_BACKUP_DIR') ?? '').trim();
  if (override) return path.resolve(override);
  return path.resolve(process.cwd(), 'backups');
};

const hashBuffer = (value) => createHash('sha256').update(value).digest('hex');

const ensureUploadsBackup = async (uploadsDir, backupUploadsDir) => {
  if (!existsSync(uploadsDir)) {
    await mkdir(backupUploadsDir, { recursive: true });
    return;
  }
  await cp(uploadsDir, backupUploadsDir, { recursive: true, force: true });
};

const main = async () => {
  const configPath = resolveConfigPath();
  const uploadsDir = resolveUploadsDir();
  const backupRoot = resolveBackupRoot();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupRoot, `lantern-${timestamp}`);
  const backupConfigPath = path.join(backupDir, 'widgets.json');
  const backupUploadsDir = path.join(backupDir, 'uploads');

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  await mkdir(backupDir, { recursive: true });
  await copyFile(configPath, backupConfigPath);
  await ensureUploadsBackup(uploadsDir, backupUploadsDir);

  const backupConfigRaw = await readFile(backupConfigPath, 'utf-8');
  JSON.parse(backupConfigRaw);

  const restoreRoot = await mkdtemp(path.join(os.tmpdir(), 'lantern-restore-drill-'));
  const restoreConfigPath = path.join(restoreRoot, 'config/widgets.json');
  const restoreUploadsDir = path.join(restoreRoot, 'static/uploads');
  await mkdir(path.dirname(restoreConfigPath), { recursive: true });
  await copyFile(backupConfigPath, restoreConfigPath);
  await cp(backupUploadsDir, restoreUploadsDir, { recursive: true, force: true });

  const originalConfigHash = hashBuffer(await readFile(configPath));
  const restoredConfigHash = hashBuffer(await readFile(restoreConfigPath));
  if (originalConfigHash !== restoredConfigHash) {
    throw new Error('Restore verification failed: config hash mismatch.');
  }

  const result = {
    ok: true,
    backupDir,
    restoreVerified: true,
    restoredTo: restoreRoot
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);

  if (!keepRestore) {
    await rm(restoreRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
});

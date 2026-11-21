import { mkdir, readFile, writeFile, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { generateVAPIDKeys, setVapidDetails } from 'web-push';
import type { Env } from '../../config/env.js';

async function loadOrCreateKeys(directory: string) {
  const path = resolve(directory, 'vapid.json');
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ReturnType<typeof generateVAPIDKeys>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = resolve(directory, `vapid-${randomUUID()}.tmp`);
  const keys = generateVAPIDKeys();
  await writeFile(temp, JSON.stringify(keys), { flag: 'wx', mode: 0o600 });
  try {
    // Publish a complete file without overwriting keys created by another process.
    await link(temp, path);
    return keys;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return JSON.parse(await readFile(path, 'utf8')) as ReturnType<typeof generateVAPIDKeys>;
  } finally {
    await unlink(temp);
  }
}

export async function loadReminderVapid(env: Env) {
  const subject = env.WEB_PUSH_SUBJECT ?? env.FRONTEND_URL;
  const publicKey = env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = env.WEB_PUSH_PRIVATE_KEY;
  let keys;
  if (publicKey || privateKey) {
    if (!publicKey || !privateKey) throw new Error('Both Web Push keys are required');
    keys = { publicKey, privateKey };
  } else if (env.WEB_PUSH_KEY_DIR) {
    keys = await loadOrCreateKeys(env.WEB_PUSH_KEY_DIR);
  } else {
    return null;
  }

  setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return { ...keys, subject };
}

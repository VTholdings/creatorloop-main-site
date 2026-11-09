import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const artifact = 'https://api.github.com/repos/VTholdings/creatorloop-main-site/actions/artifacts/11317931861/zip';
const limit = 140 * 1024 * 1024;

export async function downloadHistory(token, destination, request = fetch) {
  if (!token) throw new Error('Missing GitHub credential');
  const signal = AbortSignal.timeout(90_000);
  const redirect = await request(artifact, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal,
  });
  if (redirect.status !== 302 || !redirect.headers.get('location')) {
    throw new Error('Unexpected artifact response');
  }
  const storage = new URL(redirect.headers.get('location'));
  await redirect.body?.cancel();
  if (storage.protocol !== 'https:' || storage.username || storage.password
      || storage.origin === new URL(artifact).origin) {
    throw new Error('Invalid artifact redirect');
  }
  const response = await request(storage, { redirect: 'error', signal });
  if (response.status !== 200 || !response.body) throw new Error('Artifact download failed');

  let size = 0;
  const bounded = new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;
      if (size > limit) callback(new Error('Artifact exceeds limit'));
      else callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), bounded,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await downloadHistory(process.env.GITHUB_TOKEN, process.argv[2]);
  } catch {
    console.error('BACKUP_HISTORY_DOWNLOAD_BLOCKED');
    process.exitCode = 1;
  }
}

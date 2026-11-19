import { randomBytes, timingSafeEqual } from 'crypto';
import http from 'http';
import type { WebContents } from 'electron';
import { storeManager } from './store';

// Remote control from other devices on the home network (an Apple Watch or iPhone
// shortcut, later a native app). A separate tiny listener, so none of the embedded
// Storytel API is reachable from the network. Every request needs the key, sent as
// "Authorization: Bearer <key>"; the key is created once and kept in the store.
//
//   POST /play-pause      POST /back      POST /forward      POST /speed/<rate>
//
// Replies 204 when the command reached the player window.
const REMOTE_PORT = 47820;
const REMOTE_KEY = 'remote.key';

/** Playback speeds the player accepts, shared with the read-along pop-out controls. */
export const isValidRate = (rate: unknown): rate is number =>
  typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= 4;

function remoteKey(): string {
  let key = storeManager.get<string>(REMOTE_KEY);
  if (!key) {
    key = randomBytes(24).toString('hex');
    storeManager.set(REMOTE_KEY, key);
  }
  return key;
}

function hasKey(header: string | undefined, key: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer /, '') ?? '');
  const expected = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function controlFor(path: string): ReadAlongControl | null {
  if (path === '/play-pause') return { type: 'toggle' };
  if (path === '/back') return { type: 'back' };
  if (path === '/forward') return { type: 'forward' };
  const speed = /^\/speed\/(\d+(?:\.\d+)?)$/.exec(path);
  const rate = speed ? Number(speed[1]) : NaN;
  return isValidRate(rate) ? { type: 'setSpeed', rate } : null;
}

type ReadAlongControl = { type: 'toggle' | 'back' | 'forward' } | { type: 'setSpeed'; rate: number };

export function startRemote(player: () => WebContents | null): void {
  const key = remoteKey();
  const server = http.createServer((req, res) => {
    const control = req.method === 'POST' ? controlFor(req.url ?? '') : null;
    let status = 204;
    if (!hasKey(req.headers.authorization, key)) status = 401;
    else if (!control) status = 404;
    else {
      const contents = player();
      if (contents) contents.send('readAlong:popout-control', control);
      else status = 503;
    }
    res.writeHead(status).end();
  });
  // A dev run next to the installed app finds the port taken: carry on without a remote.
  server.on('error', (error) => console.warn('Remote control unavailable:', error.message));
  server.listen(REMOTE_PORT, '0.0.0.0');
}

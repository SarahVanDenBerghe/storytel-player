import http from 'http';
import type { WebContents } from 'electron';

// Remote control from other devices on the home network (an Apple Watch or iPhone
// shortcut, later a native app). A separate tiny listener, so none of the embedded
// Storytel API is reachable from the network. No key, on purpose (the developer's
// choice): anyone on the same Wi-Fi can at most pause, skip or change the speed.
//
//   /play-pause      /back      /forward      /speed/<rate>      (GET or POST)
//
// Replies 204 when the command reached the player window.
const REMOTE_PORT = 47820;

/** Playback speeds the player accepts, shared with the read-along pop-out controls. */
export const isValidRate = (rate: unknown): rate is number =>
  typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= 4;

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
  const server = http.createServer((req, res) => {
    const control = controlFor(req.url ?? '');
    let status = 204;
    if (!control) status = 404;
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

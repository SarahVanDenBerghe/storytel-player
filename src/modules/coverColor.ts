import { app, nativeImage, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * Covers made outside the app, in <userData>/covers, the ISBN being the file name in
 * Storytel's cover URL: <ISBN>.png has no text at all, <ISBN>.tidy.png is the original
 * minus publisher logos. Books without one keep Storytel's cover.
 */
const OVERRIDES_DIR = path.join(app.getPath('userData'), 'covers');

/** ISBN (or ISBN.tidy) -> file URL. */
export function coverOverrides(): Record<string, string> {
  try {
    return Object.fromEntries(fs.readdirSync(OVERRIDES_DIR)
      .filter((file) => file.endsWith('.png'))
      .map((file) => [path.basename(file, '.png'), pathToFileURL(path.join(OVERRIDES_DIR, file)).href]));
  } catch {
    return {};
  }
}

/**
 * A cover's main colour, for tinting the home page's Up next block (the way
 * Apple Music tints by artwork). Read in the main process: the renderer may not
 * read pixels of cover images from Storytel's servers (a tainted canvas).
 *
 * The cover is shrunk to 24x24; vivid pixels (not near black, white or grey)
 * vote per hue, the strongest hue's average wins, and the result is darkened
 * so white text on it stays readable. Results are cached per URL.
 */
const SIZE = 24;
const HUE_BUCKETS = 12;
const cache = new Map<string, string | null>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The main colour of BGRA pixels, darkened for white text. */
export function mainColor(bgra: Buffer): string {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ score: 0, r: 0, g: 0, b: 0 }));
  let allR = 0, allG = 0, allB = 0, count = 0;
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    const b = bgra[i], g = bgra[i + 1], r = bgra[i + 2];
    allR += r; allG += g; allB += b; count++;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l < 0.12 || l > 0.92 || s < 0.18) continue;
    const score = s * (1 - Math.abs(l - 0.5) * 1.4);
    const bucket = buckets[Math.floor(h * HUE_BUCKETS) % HUE_BUCKETS];
    bucket.score += score;
    bucket.r += r * score; bucket.g += g * score; bucket.b += b * score;
  }
  const best = buckets.reduce((a, c) => (c.score > a.score ? c : a));
  const [r, g, b] = best.score > 0
    ? [best.r / best.score, best.g / best.score, best.b / best.score]
    : [allR / Math.max(count, 1), allG / Math.max(count, 1), allB / Math.max(count, 1)];
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToHex(h, Math.min(s, 0.7), Math.min(Math.max(l, 0.22), 0.42));
}

/** Only Storytel's cover hosts: the URL comes from the renderer. */
function isCoverUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === 'file:') return url.startsWith(pathToFileURL(OVERRIDES_DIR).href + '/');
    return protocol === 'https:' && (hostname === 'covers.storytel.com' || hostname.endsWith('.storytel.com'));
  } catch {
    return false;
  }
}

export async function coverColor(url: unknown): Promise<string | null> {
  if (!isCoverUrl(url)) return null;
  if (cache.has(url)) return cache.get(url) ?? null;
  let color: string | null = null;
  try {
    const response = await net.fetch(url);
    if (response.ok) {
      const image = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()));
      if (!image.isEmpty()) color = mainColor(image.resize({ width: SIZE, height: SIZE, quality: 'good' }).toBitmap());
    }
  } catch {
    color = null;
  }
  cache.set(url, color);
  return color;
}

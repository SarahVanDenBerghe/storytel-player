export interface EpubParagraph {
  text: string;
  heading: boolean;
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre']);
const HEADING_TAG = /^h[1-6]$/;

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

// Namespace-agnostic lookup: EPUB files mix default and prefixed namespaces.
function elementsByName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', localName));
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i + 1);
}

/** Resolves an href from a file in `baseDir` to a path inside the archive. */
function resolveHref(baseDir: string, href: string): string {
  let target = href.split('#')[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    // keep the raw href when it is not valid percent-encoding
  }
  const parts: string[] = [];
  for (const part of (baseDir + target).split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

function parseDocument(text: string): Document {
  const xhtml = new DOMParser().parseFromString(text, 'application/xhtml+xml');
  if (xhtml.getElementsByTagName('parsererror').length === 0) return xhtml;
  return new DOMParser().parseFromString(text, 'text/html');
}

function collectBlocks(doc: Document, out: EpubParagraph[]): void {
  const root = elementsByName(doc, 'body')[0] ?? doc.documentElement;
  if (!root) return;
  const blocks = Array.from(root.getElementsByTagName('*')).filter((el) =>
    BLOCK_TAGS.has(el.localName.toLowerCase()),
  );
  blocks.forEach((el, i) => {
    // Blocks are in document order, so a block that contains another block is
    // always directly followed by its first nested block: keep the innermost.
    const next = blocks[i + 1];
    if (next && el.contains(next)) return;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    out.push({ text, heading: HEADING_TAG.test(el.localName.toLowerCase()) });
  });
}

/**
 * Turns the text entries of an EPUB (path inside the archive → content) into
 * its block text in reading order (spine order). Throws when the package
 * structure cannot be found.
 */
export function parseEpub(entries: Record<string, string>): { paragraphs: EpubParagraph[] } {
  const byLowerPath = new Map(Object.keys(entries).map((k) => [k.toLowerCase(), k]));
  const lookup = (path: string): string | undefined =>
    entries[path] ?? entries[byLowerPath.get(path.toLowerCase()) ?? ''];

  const container = lookup('META-INF/container.xml');
  if (!container) throw new Error('EPUB has no META-INF/container.xml');
  const opfPath = elementsByName(parseXml(container), 'rootfile')[0]?.getAttribute('full-path');
  const opfText = opfPath ? lookup(opfPath) : undefined;
  if (!opfPath || !opfText) throw new Error('EPUB package document not found');

  const opf = parseXml(opfText);
  const opfDir = dirname(opfPath);
  const manifest = new Map<string, string>();
  for (const item of elementsByName(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, resolveHref(opfDir, href));
  }

  const paragraphs: EpubParagraph[] = [];
  for (const itemref of elementsByName(opf, 'itemref')) {
    const path = manifest.get(itemref.getAttribute('idref') ?? '');
    const text = path ? lookup(path) : undefined;
    if (text) collectBlocks(parseDocument(text), paragraphs);
  }
  return { paragraphs };
}

/**
 * Estimates which paragraph is being heard from the position in the audio,
 * assuming the narration advances evenly through the text: the fraction
 * (0–1, clamped) is mapped onto the cumulative character count.
 * Returns -1 for an empty list.
 */
export function estimateParagraph(fraction: number, paragraphLengths: number[]): number {
  const count = paragraphLengths.length;
  if (count === 0) return -1;
  const f = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;

  const cumulative: number[] = [];
  let total = 0;
  for (const length of paragraphLengths) {
    total += Math.max(0, length);
    cumulative.push(total);
  }
  if (total === 0) return Math.min(Math.floor(f * count), count - 1);

  // First paragraph whose end lies beyond the target character.
  const target = f * total;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] > target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

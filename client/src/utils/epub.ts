export interface EpubParagraph {
  text: string;
  heading: boolean;
  /** Titles of the EPUB's table-of-contents entries that start at this paragraph. */
  toc?: string[];
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
  let navPath: string | undefined;
  let ncxPath: string | undefined;
  for (const item of elementsByName(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (!id || !href) continue;
    const path = resolveHref(opfDir, href);
    manifest.set(id, path);
    if ((item.getAttribute('properties') ?? '').split(/\s+/).includes('nav')) navPath = path;
    if (item.getAttribute('media-type') === 'application/x-dtbncx+xml') ncxPath = path;
  }

  const paragraphs: EpubParagraph[] = [];
  // Where each spine file's text starts: a file without text (an image-only
  // part page) starts at the next file's first paragraph.
  const fileStart = new Map<string, number>();
  for (const itemref of elementsByName(opf, 'itemref')) {
    const path = manifest.get(itemref.getAttribute('idref') ?? '');
    const text = path ? lookup(path) : undefined;
    if (!path || !text) continue;
    if (!fileStart.has(path.toLowerCase())) fileStart.set(path.toLowerCase(), paragraphs.length);
    collectBlocks(parseDocument(text), paragraphs);
  }

  const tocAt = new Map<number, string[]>();
  for (const entry of readToc(lookup, navPath, ncxPath)) {
    const index = fileStart.get(entry.path.toLowerCase());
    if (index !== undefined && index < paragraphs.length) tocAt.set(index, [...(tocAt.get(index) ?? []), entry.title]);
  }
  return { paragraphs: withTocTitles(paragraphs, tocAt) };
}

const titleWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Marks where each contents entry starts and, when its title is not in the text (some
 * books set chapter titles as images), shows it there as a heading.
 */
function withTocTitles(paragraphs: EpubParagraph[], tocAt: Map<number, string[]>): EpubParagraph[] {
  const out: EpubParagraph[] = [];
  paragraphs.forEach((p, i) => {
    const titles = tocAt.get(i);
    if (!titles) {
      out.push(p);
      return;
    }
    const nearby = ` ${titleWords(paragraphs.slice(i, i + 3).map((q) => q.text).join(' '))} `;
    const found: string[] = [];
    for (const title of titles) {
      // "Chapter 1: Only the Dark" is in the text when "Only the Dark" is.
      const name = titleWords(title.replace(/^(?:(?:part|chapter)\s+)?(?:\d+|[ivxlcdm]+)\s*[:.]\s*/i, '')) || titleWords(title);
      if (nearby.includes(` ${name} `)) found.push(title);
      else out.push({ text: title, heading: true, toc: [title] });
    }
    out.push(found.length > 0 ? { ...p, toc: found } : p);
  });
  return out;
}

/**
 * The table of contents in reading order, as titles and the archive path they link to:
 * the EPUB 3 nav document (its toc nav only, not the landmarks), else the EPUB 2 NCX.
 */
function readToc(lookup: (path: string) => string | undefined, navPath?: string, ncxPath?: string): { title: string; path: string }[] {
  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const navText = navPath ? lookup(navPath) : undefined;
  if (navPath && navText) {
    const navs = elementsByName(parseDocument(navText), 'nav');
    const toc = navs.find((nav) => /\btoc\b/.test(nav.getAttribute('epub:type') ?? '')) ?? navs[0];
    const entries = toc ? elementsByName(toc, 'a').map((a) => ({
      title: clean(a.textContent),
      path: resolveHref(dirname(navPath), a.getAttribute('href') ?? ''),
    })) : [];
    if (entries.length > 0) return entries;
  }
  const ncxText = ncxPath ? lookup(ncxPath) : undefined;
  if (!ncxPath || !ncxText) return [];
  return elementsByName(parseXml(ncxText), 'navPoint').map((point) => {
    const own = (name: string) => Array.from(point.children).find((child) => child.localName === name);
    return {
      title: clean(own('navLabel')?.textContent),
      path: resolveHref(dirname(ncxPath), own('content')?.getAttribute('src') ?? ''),
    };
  });
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

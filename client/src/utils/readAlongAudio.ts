import api from './api';
import { BookShelfEntity } from '../interfaces/books';
import { otherBookParts } from './helpers';

const POLL_MS = 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read along transcribes the audio file, so the audio has to be on disk. This
 * downloads it when it isn't (asking for the download folder the first time),
 * reports the percentage, and resolves true once the file is there. A download
 * that is already running (e.g. started from the full player) is waited for.
 */
export async function ensureAudioDownloaded(
  bookId: string,
  consumableId: string | null | undefined,
  book: BookShelfEntity | null,
  onPercent: (percent: number) => void,
): Promise<boolean> {
  const status = async () =>
    (await api.get(`/download-status/${bookId}`)).data as { downloaded: boolean; downloading: boolean; percentage: number };

  const first = await status();
  if (first.downloaded) return true;

  if (first.downloading) {
    for (;;) {
      await sleep(POLL_MS);
      const now = await status().catch(() => null);
      if (!now) return false;
      onPercent(now.percentage);
      if (!now.downloading) return now.downloaded;
    }
  }

  if (window.electronDownloads && !(await window.electronDownloads.ensureFolder())) return false;
  onPercent(0);
  // The request only answers once the whole file is written; poll for progress meanwhile.
  const timer = setInterval(() => {
    status().then((now) => onPercent(now.percentage)).catch(() => undefined);
  }, POLL_MS);
  try {
    const response = await api.post('/download', { bookId, consumableId: consumableId || undefined, book });
    return !!(response as any)?.data?.success;
  } catch (err) {
    console.error('Read along: cannot download the audio', err);
    return false;
  } finally {
    clearInterval(timer);
  }
}

/**
 * Route ids (as in /player/:id) of the other parts of a split audiobook
 * ("Golden Son (1 of 2)" / "(2 of 2)"), found on the shelf: parts share one EPUB.
 */
async function otherPartIds(bookId: string): Promise<string[]> {
  const shelf: BookShelfEntity[] = await api.get('/bookshelf').then((res) => res.data?.books || []).catch(() => []);
  const routeId = (entry: BookShelfEntity) => String(entry.abook?.id || entry.id);
  const own = shelf.find((entry) => routeId(entry) === bookId);
  return own ? otherBookParts(own, shelf).map(routeId) : [];
}

/** After an EPUB is chosen for a book: give the same file to its other parts. */
export async function shareEpubWithOtherParts(bookId: string): Promise<void> {
  const epub = window.electronEpub;
  if (!epub) return;
  const parts = await otherPartIds(bookId);
  if (parts.length > 0) await epub.link(bookId, parts);
}

/** A book without an EPUB takes another part's; resolves true when it now has one. */
export async function takeEpubFromOtherParts(bookId: string): Promise<boolean> {
  const epub = window.electronEpub;
  if (!epub) return false;
  for (const partId of await otherPartIds(bookId)) {
    if (await epub.name(partId)) {
      await epub.link(partId, [bookId]);
      return true;
    }
  }
  return false;
}

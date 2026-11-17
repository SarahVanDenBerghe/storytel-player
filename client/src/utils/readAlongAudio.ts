import api from './api';
import { BookShelfEntity } from '../interfaces/books';

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

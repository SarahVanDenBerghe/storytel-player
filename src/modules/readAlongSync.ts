// Read along: transcribes a downloaded audiobook with local Whisper
// (whisper.cpp), 600 s at a time, so the text can later be matched to the EPUB.
// No Electron imports: this module also runs headless under plain Node.
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const CHUNK_SEC = 600;
// A manual anchor replaces any other one closer than this.
const ANCHOR_REPLACE_SEC = 60;

export type SyncState = 'idle' | 'running' | 'done' | 'error' | 'unavailable';

export interface SyncProgress {
  bookId: string;
  state: SyncState;
  chunksDone: number;
  chunksTotal: number;
  message?: string;
}

export interface TranscriptSegment {
  /** Seconds from the start of the audiobook. */
  start: number;
  end: number;
  text: string;
}

export interface ManualAnchor {
  timeSec: number;
  paragraphIndex: number;
}

/**
 * Stored per book in `<userData>/readAlong/<bookId>.json`. The transcript
 * fields are absent when only manual anchors have been saved so far.
 */
interface BookSyncFile {
  version: 1;
  audioPath?: string;
  audioSize?: number;
  durationSec?: number;
  chunkSec?: number;
  /** Indices of the 600 s chunks already transcribed. */
  chunksDone?: number[];
  /** Sorted by start. */
  segments?: TranscriptSegment[];
  manualAnchors?: ManualAnchor[];
}

export interface SyncSnapshot {
  progress: SyncProgress;
  transcript: { durationSec: number; segments: TranscriptSegment[] } | null;
  manualAnchors: ManualAnchor[];
}

export interface ReadAlongSyncOptions {
  userDataDir: string;
  /** Folders that may hold the downloaded audio (current folder first). */
  downloadsDirs: () => string[];
  onProgress: (progress: SyncProgress) => void;
}

interface Job {
  bookId: string;
  cancelled: boolean;
  child: ChildProcess | null;
  progress: SyncProgress;
  /** Called once the job is past its checks (unavailable, done, or running). */
  markReady: () => void;
}

export function isValidBookId(bookId: unknown): bookId is string {
  return typeof bookId === 'string' && /^\d+$/.test(bookId);
}

/** Absolute Homebrew paths first: an app opened from Finder has no Homebrew PATH. */
function findTool(name: string): string | null {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const dirs = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean),
  ];
  for (const dir of dirs) {
    const candidate = path.join(dir, exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Same lookup as findDownloadedFile in server/fastify-common.ts. */
function findDownloadedAudio(downloadsDirs: string[], bookId: string): string | null {
  const suffix = ` [${bookId}].mp3`;
  for (const dir of downloadsDirs) {
    const legacyPath = path.join(dir, `${bookId}.mp3`);
    if (fs.existsSync(legacyPath)) return legacyPath;
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const match = names.find((name) => name.endsWith(suffix));
    if (match) return path.join(dir, match);
  }
  return null;
}

/** Spawns without a shell (file names contain spaces and brackets). Resolves with stdout. */
function run(
  job: Job,
  command: string,
  args: string[],
  captureStdout = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    // A cancel during an earlier await found no child to kill: do not spawn.
    if (job.cancelled) {
      reject(new Error('Cancelled'));
      return;
    }
    const child = spawn(command, args, {
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
    });
    job.child = child;
    let stdout = '';
    let stderrTail = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000);
    });
    child.on('error', (err) => {
      if (job.child === child) job.child = null;
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (job.child === child) job.child = null;
      if (code === 0) resolve(stdout);
      else {
        const detail = stderrTail.trim().split('\n').slice(-3).join(' ');
        reject(new Error(`${path.basename(command)} failed (${signal ?? code}): ${detail}`));
      }
    });
  });
}

/** The chunk holding startAtSec first, then the rest to the end, then the earlier ones. */
function chunkOrder(chunksTotal: number, startAtSec: number): number[] {
  const first = Math.min(Math.max(0, Math.floor(startAtSec / CHUNK_SEC)), chunksTotal - 1);
  const order: number[] = [];
  for (let i = first; i < chunksTotal; i++) order.push(i);
  for (let i = 0; i < first; i++) order.push(i);
  return order;
}

function isFinished(file: BookSyncFile | null): boolean {
  if (!file || typeof file.durationSec !== 'number' || !file.chunksDone) return false;
  const total = Math.ceil(file.durationSec / (file.chunkSec || CHUNK_SEC));
  return new Set(file.chunksDone).size >= total;
}

export function createReadAlongSync(options: ReadAlongSyncOptions) {
  const { userDataDir, downloadsDirs, onProgress } = options;
  const dataDir = path.join(userDataDir, 'readAlong');
  const modelPath = path.join(userDataDir, 'whisper', 'ggml-base.en.bin');

  let current: Job | null = null;
  // Last error/unavailable result per book, so sync-get can still report it.
  const lastProblem = new Map<string, SyncProgress>();

  const filePath = (bookId: string) => path.join(dataDir, `${bookId}.json`);

  function readFile(bookId: string): BookSyncFile | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath(bookId), 'utf8'));
      return parsed && parsed.version === 1 ? (parsed as BookSyncFile) : null;
    } catch {
      return null;
    }
  }

  // Synchronous on purpose: chunk results and manual anchors share this file,
  // and a sync read-modify-write can never interleave with another one.
  function writeFile(bookId: string, data: BookSyncFile): void {
    fs.mkdirSync(dataDir, { recursive: true });
    // Temp file next to the target, so the rename never crosses volumes.
    const tmp = `${filePath(bookId)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, filePath(bookId));
  }

  function progressFromFile(bookId: string): SyncProgress {
    const file = readFile(bookId);
    if (!file || typeof file.durationSec !== 'number') {
      return { bookId, state: 'idle', chunksDone: 0, chunksTotal: 0 };
    }
    const chunksTotal = Math.ceil(file.durationSec / (file.chunkSec || CHUNK_SEC));
    const chunksDone = new Set(file.chunksDone || []).size;
    return { bookId, state: isFinished(file) ? 'done' : 'idle', chunksDone, chunksTotal };
  }

  function emit(progress: SyncProgress): void {
    if (progress.state === 'error' || progress.state === 'unavailable') {
      lastProblem.set(progress.bookId, progress);
    } else {
      lastProblem.delete(progress.bookId);
    }
    try {
      onProgress({ ...progress });
    } catch (err) {
      console.error('readAlong progress listener failed:', err);
    }
  }

  function cancel(): void {
    const job = current;
    if (!job) return;
    job.cancelled = true;
    job.child?.kill('SIGKILL');
    current = null;
    emit({ ...job.progress, state: 'idle', message: undefined });
  }

  async function transcribeChunk(
    job: Job,
    tools: { ffmpeg: string; whisper: string },
    audioPath: string,
    index: number
  ): Promise<TranscriptSegment[]> {
    const offset = index * CHUNK_SEC;
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'storytel-readalong-'));
    const wav = path.join(tmpDir, 'chunk.wav');
    const base = path.join(tmpDir, 'chunk');
    try {
      await run(job, tools.ffmpeg, [
        '-v', 'error', '-y',
        '-ss', String(offset), '-t', String(CHUNK_SEC),
        '-i', audioPath,
        '-ar', '16000', '-ac', '1', wav,
      ]);
      if (job.cancelled) return [];
      await run(job, tools.whisper, [
        '-m', modelPath, '-f', wav,
        '-t', '3', '-mc', '64',
        '-oj', '-of', base, '-np',
      ]);
      if (job.cancelled) return [];
      const json = JSON.parse(await fs.promises.readFile(`${base}.json`, 'utf8'));
      const items: any[] = Array.isArray(json?.transcription) ? json.transcription : [];
      const segments: TranscriptSegment[] = [];
      for (const item of items) {
        const text = typeof item?.text === 'string' ? item.text.trim() : '';
        const from = Number(item?.offsets?.from);
        const to = Number(item?.offsets?.to);
        if (!text || !Number.isFinite(from) || !Number.isFinite(to)) continue;
        segments.push({ start: offset + from / 1000, end: offset + to / 1000, text });
      }
      return segments;
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function runJob(job: Job, startAtSec: number): Promise<void> {
    const { bookId } = job;
    try {
      const ffmpeg = findTool('ffmpeg');
      const ffprobe = findTool('ffprobe');
      const whisper = findTool('whisper-cli');
      let reason: string | null = null;
      if (!ffmpeg || !ffprobe) reason = 'FFmpeg is not installed: brew install ffmpeg';
      else if (!whisper) reason = 'Whisper is not installed: brew install whisper-cpp';
      else if (!fs.existsSync(modelPath)) reason = `Whisper model not found: ${modelPath}`;
      const audioPath = reason ? null : findDownloadedAudio(downloadsDirs(), bookId);
      if (!reason && !audioPath) reason = 'Download this audiobook to sync the text';
      if (reason || !audioPath || !ffmpeg || !ffprobe || !whisper) {
        job.progress = { ...job.progress, state: 'unavailable', message: reason ?? undefined };
        emit(job.progress);
        return;
      }

      const audioSize = (await fs.promises.stat(audioPath)).size;
      const file = readFile(bookId);
      const sameAudio =
        !!file &&
        file.audioPath === audioPath &&
        file.audioSize === audioSize &&
        typeof file.durationSec === 'number';
      const durationSec =
        sameAudio && file
          ? (file.durationSec as number)
          : Number(
              (
                await run(
                  job,
                  ffprobe,
                  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', audioPath],
                  true
                )
              ).trim()
            );
      if (job.cancelled) return;
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw new Error('Could not read the audiobook duration');
      }

      // Start over when the audio file changed; manual anchors are kept.
      const base: BookSyncFile = sameAudio && file
        ? file
        : {
            version: 1,
            audioPath,
            audioSize,
            durationSec,
            chunkSec: CHUNK_SEC,
            chunksDone: [],
            segments: [],
            manualAnchors: file?.manualAnchors || [],
          };
      if (!sameAudio) writeFile(bookId, base);

      const chunksTotal = Math.ceil(durationSec / CHUNK_SEC);
      const done = new Set(base.chunksDone || []);
      job.progress = { bookId, state: 'running', chunksDone: done.size, chunksTotal };
      if (isFinished(base)) {
        job.progress = { ...job.progress, state: 'done' };
        emit(job.progress);
        return;
      }
      emit(job.progress);
      job.markReady();

      for (const index of chunkOrder(chunksTotal, startAtSec)) {
        if (done.has(index)) continue;
        const segments = await transcribeChunk(job, { ffmpeg, whisper }, audioPath, index);
        if (job.cancelled) return;

        // Re-read so manual anchors saved meanwhile are kept.
        const latest = readFile(bookId) || base;
        const merged = [...(latest.segments || []), ...segments].sort((a, b) => a.start - b.start);
        done.add(index);
        writeFile(bookId, {
          ...latest,
          version: 1,
          audioPath,
          audioSize,
          durationSec,
          chunkSec: CHUNK_SEC,
          chunksDone: [...done].sort((a, b) => a - b),
          segments: merged,
        });
        job.progress = { ...job.progress, chunksDone: done.size };
        emit(job.progress);
      }

      job.progress = { ...job.progress, state: 'done' };
      emit(job.progress);
    } catch (err) {
      if (job.cancelled) return;
      job.progress = { ...job.progress, state: 'error', message: (err as Error).message };
      emit(job.progress);
    } finally {
      if (current === job) current = null;
      job.markReady();
    }
  }

  /**
   * Starts or continues transcribing a book. One job runs at a time: starting
   * another book cancels the current one; starting the same book is a no-op.
   */
  async function start(bookId: string, startAtSec: number): Promise<SyncProgress> {
    if (!isValidBookId(bookId)) throw new Error('Invalid book id');
    if (!Number.isFinite(startAtSec) || startAtSec < 0) throw new Error('Invalid start time');
    if (current?.bookId === bookId) return { ...current.progress };
    cancel();

    let markReady = () => {};
    const ready = new Promise<void>((resolve) => { markReady = resolve; });
    const job: Job = {
      bookId,
      cancelled: false,
      child: null,
      progress: { ...progressFromFile(bookId), state: 'running' },
      markReady,
    };
    // Claimed before the first await, so a second start sees this job.
    current = job;
    void runJob(job, startAtSec);
    // Answer once the chunk count is known, without waiting for the first chunk.
    await ready;
    return { ...job.progress };
  }

  function get(bookId: string): SyncSnapshot {
    if (!isValidBookId(bookId)) throw new Error('Invalid book id');
    const file = readFile(bookId);
    const progress =
      current?.bookId === bookId
        ? { ...current.progress }
        : lastProblem.get(bookId) ?? progressFromFile(bookId);
    const transcript =
      file && typeof file.durationSec === 'number' && Array.isArray(file.segments)
        ? { durationSec: file.durationSec, segments: file.segments }
        : null;
    return { progress, transcript, manualAnchors: file?.manualAnchors || [] };
  }

  function setManualAnchor(bookId: string, timeSec: number, paragraphIndex: number): ManualAnchor[] {
    if (!isValidBookId(bookId)) throw new Error('Invalid book id');
    if (!Number.isFinite(timeSec) || timeSec < 0) throw new Error('Invalid time');
    if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
      throw new Error('Invalid paragraph index');
    }
    const file = readFile(bookId) || { version: 1 as const };
    const anchors = (file.manualAnchors || [])
      .filter((a) => Math.abs(a.timeSec - timeSec) >= ANCHOR_REPLACE_SEC)
      .concat({ timeSec, paragraphIndex })
      .sort((a, b) => a.timeSec - b.timeSec);
    writeFile(bookId, { ...file, manualAnchors: anchors });
    return anchors;
  }

  return { start, get, setManualAnchor, cancel };
}

export type ReadAlongSync = ReturnType<typeof createReadAlongSync>;

// Local books: audiobook files of the user's own (.m4b/.m4a/.mp3) shown in the
// library next to Storytel books. Metadata comes from ffprobe; the audio file
// and any EPUB next to it are only ever read, never moved or deleted.
//
// Store: `${USER_DATA_PATH}/local-books.json`. The Electron main process reads
// the same file for id -> filePath (src/modules/localBooks.ts, keep in step).
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export interface LocalChapter {
  title: string;
  startMs: number;
  endMs: number;
}

export interface LocalBook {
  id: string;
  filePath: string;
  title: string;
  authors: string[];
  narrators: string[];
  description: string;
  durationMs: number;
  chapters: LocalChapter[];
  coverPath?: string;
  addedAt: string;
  position?: { ms: number; updatedAt: string };
}

interface LocalBooksStore {
  version: 1;
  /** Next sequence number; ids are never reused, even after a removal. */
  nextSeq: number;
  books: LocalBook[];
}

/**
 * Local ids are digit strings (so every `isValidBookId` gate accepts them) in a
 * range Storytel ids never reach: 9000000000000 + n.
 */
const LOCAL_ID_BASE = 9_000_000_000_000;
export const AUDIO_EXTENSIONS = [".m4b", ".m4a", ".mp3"];

export function isLocalBookId(id: unknown): id is string {
  return typeof id === "string" && /^\d+$/.test(id) && Number(id) >= LOCAL_ID_BASE;
}

// Read on every use, as downloadsDir() does: main.ts sets it before the server loads.
function userDataDir(): string {
  return process.env.USER_DATA_PATH || path.join(__dirname, "user-data");
}
const storePath = () => path.join(userDataDir(), "local-books.json");
const coversDir = () => path.join(userDataDir(), "local-covers");

function readStore(): LocalBooksStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    if (parsed && Array.isArray(parsed.books) && typeof parsed.nextSeq === "number") {
      return parsed as LocalBooksStore;
    }
  } catch {
    // Missing or unreadable: start empty.
  }
  return { version: 1, nextSeq: 1, books: [] };
}

function writeStore(store: LocalBooksStore): void {
  fs.mkdirSync(userDataDir(), { recursive: true });
  // Temp file next to the target, so the rename never crosses volumes.
  const tmp = `${storePath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, storePath());
}

/**
 * Read-modify-write in one synchronous step, so a position save can never be
 * lost to an add that was awaiting ffprobe meanwhile.
 */
function updateStore<T>(change: (store: LocalBooksStore) => T): T {
  const store = readStore();
  const result = change(store);
  writeStore(store);
  return result;
}

export function listLocalBooks(): LocalBook[] {
  return readStore().books;
}

export function getLocalBook(id: string): LocalBook | null {
  return readStore().books.find((book) => book.id === id) ?? null;
}

/** The audio file of a local book, or null when unknown or the file is gone. */
export function localBookFile(id: string): string | null {
  const filePath = getLocalBook(id)?.filePath;
  return filePath && fs.existsSync(filePath) ? filePath : null;
}

export function setLocalBookPosition(id: string, ms: number): boolean {
  return updateStore((store) => {
    const book = store.books.find((b) => b.id === id);
    if (!book) return false;
    book.position = { ms: Math.max(0, Math.round(ms)), updatedAt: new Date().toISOString() };
    return true;
  });
}

/** Removes the entry and its extracted cover. The audio and EPUB files stay. */
export function removeLocalBook(id: string): boolean {
  const removed = updateStore((store) => {
    const index = store.books.findIndex((b) => b.id === id);
    if (index < 0) return null;
    return store.books.splice(index, 1)[0];
  });
  if (!removed) return false;
  // Only ever the cover this module wrote, inside local-covers.
  const cover = path.join(coversDir(), `${id}.jpg`);
  try {
    fs.unlinkSync(cover);
  } catch {
    // No cover was extracted.
  }
  return true;
}

/** Twin of findTool in src/modules/readAlongSync.ts (separate bundle). */
function findTool(name: string): string | null {
  const dirs = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean),
  ];
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // No shell: file names contain spaces and brackets.
    execFile(command, args, { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Tag lookup ignoring case (MP3 and MP4 tags differ in case). */
function tag(tags: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const key = Object.keys(tags).find((k) => k.toLowerCase() === name);
    const value = key ? tags[key] : undefined;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** "You Yeong-Gwang, Slin Jung - translator" -> ["You Yeong-Gwang"]: entries with a role are dropped. */
function people(value: string): string[] {
  return value
    .split(/\s*[,;]\s*/)
    .map((name) => name.trim())
    .filter((name) => name && !name.includes(" - "));
}

type ProbedBook = Omit<LocalBook, "id" | "filePath" | "coverPath" | "addedAt" | "position">;

export function parseProbe(json: any, filePath: string): ProbedBook {
  const format = json?.format ?? {};
  const tags: Record<string, unknown> = format.tags ?? {};
  const durationMs = Math.round(Number(format.duration) * 1000) || 0;
  const chapters: LocalChapter[] = (Array.isArray(json?.chapters) ? json.chapters : [])
    .map((chapter: any) => ({
      // Untitled chapters get the client's translated "Track N".
      title: tag(chapter?.tags ?? {}, "title"),
      startMs: Math.round(Number(chapter?.start_time) * 1000),
      endMs: Math.round(Number(chapter?.end_time) * 1000),
    }))
    .filter((c: LocalChapter) => Number.isFinite(c.startMs) && Number.isFinite(c.endMs) && c.endMs > c.startMs);
  return {
    title: tag(tags, "title", "album") || path.basename(filePath, path.extname(filePath)),
    authors: people(tag(tags, "artist", "album_artist")),
    narrators: people(tag(tags, "composer")),
    description: tag(tags, "description", "comment", "synopsis"),
    durationMs,
    chapters,
  };
}

/** Writes the embedded cover as JPEG; false when the file has none. */
async function extractCover(ffmpeg: string, filePath: string, outPath: string): Promise<boolean> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  try {
    await run(ffmpeg, ["-v", "error", "-y", "-i", filePath, "-an", "-map", "0:v:0", "-frames:v", "1", outPath]);
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 0;
  } catch {
    try {
      fs.unlinkSync(outPath);
    } catch {
      // Nothing written.
    }
    return false;
  }
}

/** Same base name, .epub, in a sibling "Ebooks" folder, else next to the audio. */
function findMatchingEpub(filePath: string): string | undefined {
  const base = path.basename(filePath, path.extname(filePath));
  const dir = path.dirname(filePath);
  const candidates = [path.join(path.dirname(dir), "Ebooks", `${base}.epub`), path.join(dir, `${base}.epub`)];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export class LocalBookError extends Error {
  statusCode = 400;
}

export async function addLocalBook(
  rawPath: unknown,
): Promise<{ id: string; added: boolean; epubPath?: string }> {
  if (typeof rawPath !== "string" || !path.isAbsolute(rawPath)) {
    throw new LocalBookError("filePath must be an absolute path");
  }
  const filePath = path.normalize(rawPath);
  if (!AUDIO_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
    throw new LocalBookError("Only .m4b, .m4a and .mp3 files can be added");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new LocalBookError("File not found");
  }
  const epubPath = findMatchingEpub(filePath);
  const existing = listLocalBooks().find((book) => book.filePath === filePath);
  if (existing) return { id: existing.id, added: false, ...(epubPath ? { epubPath } : {}) };

  const ffprobe = findTool("ffprobe");
  const ffmpeg = findTool("ffmpeg");
  if (!ffprobe || !ffmpeg) throw new LocalBookError("FFmpeg is not installed: brew install ffmpeg");

  let probed: ProbedBook;
  try {
    probed = parseProbe(
      JSON.parse(await run(ffprobe, ["-v", "error", "-show_format", "-show_chapters", "-of", "json", filePath])),
      filePath,
    );
  } catch (err: any) {
    throw new LocalBookError(`Cannot read the audio file: ${err.message}`);
  }

  // Allocate the id and save in one synchronous step (re-checking for a
  // concurrent add of the same file), then add the cover.
  const outcome = updateStore((store) => {
    const twin = store.books.find((book) => book.filePath === filePath);
    if (twin) return { id: twin.id, added: false };
    const id = String(LOCAL_ID_BASE + store.nextSeq);
    store.nextSeq += 1;
    store.books.push({ id, filePath, ...probed, addedAt: new Date().toISOString() });
    return { id, added: true };
  });
  if (outcome.added) {
    const coverPath = path.join(coversDir(), `${outcome.id}.jpg`);
    if (await extractCover(ffmpeg, filePath, coverPath)) {
      updateStore((store) => {
        const book = store.books.find((b) => b.id === outcome.id);
        if (book) book.coverPath = coverPath;
      });
    }
  }
  return { ...outcome, ...(epubPath ? { epubPath } : {}) };
}

function coverUrl(book: LocalBook): string {
  return book.coverPath && fs.existsSync(book.coverPath) ? pathToFileURL(book.coverPath).href : "";
}

function hoursMinutes(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

/** Shaped like the entities StorytelClient.getBookshelf returns (client BookShelfEntity). */
export function toBookshelfEntity(book: LocalBook) {
  const cover = coverUrl(book);
  const positionMs = book.position?.ms ?? 0;
  return {
    id: book.id,
    isLocal: true,
    status: 1,
    insertDate: book.addedAt,
    stateUpdateTime: book.addedAt,
    positionUpdatedTime: book.position?.updatedAt,
    book: {
      id: book.id,
      name: book.title,
      authorsAsString: book.authors.join(", "),
      authors: book.authors.map((name) => ({ name })),
      consumableId: book.id,
      largeCover: cover,
      cover,
      largeCoverE: "",
      category: { title: "" },
      language: { localizedName: "" },
    },
    abook: {
      id: book.id,
      time: book.durationMs * 1000, // microseconds, as the legacy shape expects
      narratorAsString: book.narrators.join(", "),
      description: book.description,
      lengthInHHMM: hoursMinutes(book.durationMs),
    },
    abookMark: { pos: positionMs * 1000 },
    ebook: null,
  };
}

/**
 * Shaped like Storytel's book details / playback metadata: PlayerView's fallback
 * and extractChaptersFromResponse (client/src/utils/chapters.ts) read it.
 */
export function toBookDetails(book: LocalBook) {
  const cover = { url: coverUrl(book), width: 0, height: 0 };
  return {
    id: book.id,
    isLocal: true,
    title: book.title,
    authors: book.authors.map((name) => ({ name })),
    narrators: book.narrators.map((name) => ({ name })),
    description: book.description,
    category: { name: "" },
    cover,
    formats: [
      {
        type: "abook",
        id: book.id,
        durationInMilliseconds: book.durationMs,
        cover,
        chapters: book.chapters.map((chapter, index) => ({
          number: index + 1,
          title: chapter.title,
          startPositionInMilliseconds: chapter.startMs,
          endPositionInMilliseconds: chapter.endMs,
          durationInMilliseconds: chapter.endMs - chapter.startMs,
        })),
      },
    ],
  };
}

/** Saved position in the shape of Storytel's positional bookmarks. */
export function toPositional(book: LocalBook) {
  return book.position
    ? [{ type: "abook", position: book.position.ms, updatedTime: book.position.updatedAt }]
    : [];
}

export function audioContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".m4b" || ext === ".m4a" ? "audio/mp4" : "audio/mpeg";
}

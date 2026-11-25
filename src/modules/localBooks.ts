// Local books (the user's own audiobook files): the main process only needs
// id -> audio file. Twin of the reader in server/localBooks.ts, which owns the
// store `<userData>/local-books.json`; the two bundles cannot share code.
// No Electron imports: readAlongSync.ts also runs headless under plain Node.
import fs from 'fs';
import path from 'path';

/** Local ids are 9000000000000 + n, a range Storytel ids never reach. */
export function isLocalBookId(id: unknown): id is string {
  return typeof id === 'string' && /^\d+$/.test(id) && Number(id) >= 9_000_000_000_000;
}

/** The audio file of a local book, or null when unknown or the file is gone. */
export function localBookFilePath(userDataDir: string, id: string): string | null {
  try {
    const store = JSON.parse(fs.readFileSync(path.join(userDataDir, 'local-books.json'), 'utf8'));
    const book = Array.isArray(store?.books) ? store.books.find((b: any) => b?.id === id) : null;
    const filePath = typeof book?.filePath === 'string' ? book.filePath : null;
    return filePath && fs.existsSync(filePath) ? filePath : null;
  } catch {
    return null;
  }
}

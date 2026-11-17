import { inflateRawSync } from 'zlib';

// Minimal ZIP reader for EPUB files: no Electron imports, so it can be run
// from plain Node as well. Only the text parts of the book are extracted.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const TEXT_EXTENSIONS = ['.xhtml', '.html', '.htm', '.xml', '.opf', '.ncx'];

function isTextEntry(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function findEndOfCentralDirectory(buf: Buffer): number {
  // The record is 22 bytes plus a comment of at most 65535 bytes.
  const stop = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new Error('Not a ZIP file: end of central directory not found');
}

/**
 * Returns the text entries (.xhtml .html .htm .xml .opf .ncx) of a ZIP archive,
 * decoded as UTF-8 and keyed by their path inside the archive. Sizes, method
 * and offsets come from the central directory, which is authoritative.
 */
export function readZipTextEntries(buf: Buffer): Record<string, string> {
  if (buf.length < 22) throw new Error('Not a ZIP file: too small');
  const eocd = findEndOfCentralDirectory(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || cdOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported');
  }

  const entries: Record<string, string> = {};
  let p = cdOffset;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIGNATURE) {
      throw new Error('Corrupt ZIP: bad central directory entry');
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/') || !isTextEntry(name)) continue;
    if (flags & 0x1) throw new Error(`Encrypted ZIP entry: ${name}`);
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported');
    }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new Error(`Corrupt ZIP: bad local header for ${name}`);
    }
    // Only the name and extra lengths are taken from the local header.
    const dataStart =
      localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > buf.length) {
      throw new Error(`Corrupt ZIP: ${name} runs past the end of the file`);
    }
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);

    entries[name] = data.toString('utf8').replace(/^﻿/, '');
  }
  return entries;
}

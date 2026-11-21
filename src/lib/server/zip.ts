import "server-only";
import { amsterdamParts } from "@/lib/shared/time";

/**
 * A small zip writer for the photo export: "stored" entries only (JPEG and
 * PNG do not get smaller anyway), UTF-8 file names, no ZIP64 (fine for a few
 * hundred photos). It streams, so the photos never all sit in memory.
 */

export type ZipEntry = { name: string; data: Uint8Array; date?: Date };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as used by zip and PNG. */
export function crc32(data: Uint8Array, start = 0xffffffff): number {
  let crc = start;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The MS-DOS time and date in a zip header, as the Amsterdam wall clock shows it. */
function dosDateTime(date: Date): { time: number; day: number } {
  const p = amsterdamParts(date);
  const year = Math.min(Math.max(p.year, 1980), 2107);
  return {
    time: (p.hour << 11) | (p.minute << 5) | Math.floor(p.second / 2),
    day: ((year - 1980) << 9) | (p.month << 5) | p.day,
  };
}

const UTF8_NAMES = 0x0800;
const VERSION = 20;

type ZipRecord = { name: Uint8Array; crc: number; size: number; offset: number; time: number; day: number };

function localHeader(record: ZipRecord): Uint8Array {
  const header = new Uint8Array(30 + record.name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, UTF8_NAMES, true);
  view.setUint16(8, 0, true); // stored
  view.setUint16(10, record.time, true);
  view.setUint16(12, record.day, true);
  view.setUint32(14, record.crc, true);
  view.setUint32(18, record.size, true);
  view.setUint32(22, record.size, true);
  view.setUint16(26, record.name.length, true);
  view.setUint16(28, 0, true);
  header.set(record.name, 30);
  return header;
}

function centralHeader(record: ZipRecord): Uint8Array {
  const header = new Uint8Array(46 + record.name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, VERSION, true);
  view.setUint16(8, UTF8_NAMES, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, record.time, true);
  view.setUint16(14, record.day, true);
  view.setUint32(16, record.crc, true);
  view.setUint32(20, record.size, true);
  view.setUint32(24, record.size, true);
  view.setUint16(28, record.name.length, true);
  view.setUint16(30, 0, true); // extra
  view.setUint16(32, 0, true); // comment
  view.setUint16(34, 0, true); // disk
  view.setUint16(36, 0, true); // internal attributes
  view.setUint32(38, 0, true); // external attributes
  view.setUint32(42, record.offset, true);
  header.set(record.name, 46);
  return header;
}

function endOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  view.setUint16(20, 0, true);
  return end;
}

/** A writer that hands out the zip piece by piece. */
function writer() {
  const encoder = new TextEncoder();
  const records: ZipRecord[] = [];
  let offset = 0;
  return {
    entry(entry: ZipEntry): Uint8Array[] {
      const { time, day } = dosDateTime(entry.date ?? new Date());
      const record: ZipRecord = { name: encoder.encode(entry.name), crc: crc32(entry.data), size: entry.data.length, offset, time, day };
      if (records.length >= 0xffff || offset + entry.data.length > 0xfffffff0) throw new Error("Te veel of te grote bestanden voor één zip.");
      records.push(record);
      const header = localHeader(record);
      offset += header.length + entry.data.length;
      return [header, entry.data];
    },
    end(): Uint8Array[] {
      const central = records.map(centralHeader);
      const size = central.reduce((total, part) => total + part.length, 0);
      return [...central, endOfCentralDirectory(records.length, size, offset)];
    },
  };
}

/** The whole zip at once (small exports and tests). */
export function zipBytes(entries: ZipEntry[]): Uint8Array {
  const zip = writer();
  const parts = [...entries.flatMap((entry) => zip.entry(entry)), ...zip.end()];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

/** The zip as a stream: each entry is fetched only when the previous one is sent. */
export function zipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const zip = writer();
  const iterator = entries[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          for (const part of zip.end()) controller.enqueue(part);
          controller.close();
          return;
        }
        for (const part of zip.entry(next.value)) controller.enqueue(part);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

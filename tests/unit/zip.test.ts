import { describe, expect, it } from "vitest";
import { samplePng } from "@/lib/server/funfacts";
import { crc32, zipBytes, zipStream, type ZipEntry } from "@/lib/server/zip";

const encoder = new TextEncoder();

/** Read a zip back through its central directory, as an unzip tool does. */
function readZip(bytes: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  const files: { name: string; data: Uint8Array; crc: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(position, true)).toBe(0x02014b50);
    const crc = view.getUint32(position + 16, true);
    const size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const offset = view.getUint32(position + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(position + 46, position + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 6, true) & 0x0800).toBe(0x0800); // UTF-8 names
    const localName = view.getUint16(offset + 26, true);
    const start = offset + 30 + localName + view.getUint16(offset + 28, true);
    files.push({ name, data: bytes.subarray(start, start + size), crc });
    position += 46 + nameLength;
  }
  return files;
}

const entries: ZipEntry[] = [
  { name: "24-sanne-valkenburg.jpg", data: encoder.encode("een echte foto"), date: new Date("2027-02-03T10:11:12+01:00") },
  { name: "24-oma-riët-ai.jpg", data: new Uint8Array([0, 1, 2, 255]), date: new Date("2027-02-03T10:11:12+01:00") },
];

describe("zip", () => {
  it("rekent de standaard CRC-32", () => {
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("schrijft een zip die terug te lezen is, met de juiste inhoud en controlegetallen", () => {
    const files = readZip(zipBytes(entries));
    expect(files.map((f) => f.name)).toEqual(["24-sanne-valkenburg.jpg", "24-oma-riët-ai.jpg"]);
    for (const [i, file] of files.entries()) {
      expect([...file.data]).toEqual([...entries[i].data]);
      expect(file.crc).toBe(crc32(entries[i].data));
    }
  });

  it("geeft gestreamd precies dezelfde bytes", async () => {
    async function* bron() {
      yield* entries;
    }
    const chunks: Uint8Array[] = [];
    const reader = zipStream(bron()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const streamed = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const chunk of chunks) {
      streamed.set(chunk, at);
      at += chunk.length;
    }
    expect([...streamed]).toEqual([...zipBytes(entries)]);
  });

  it("maakt ook een lege zip", () => {
    expect(readZip(zipBytes([]))).toEqual([]);
  });
});

describe("voorbeeldfoto voor de proef", () => {
  it("is een geldige PNG", () => {
    const png = samplePng(1, 40, 30);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(new TextDecoder().decode(png.subarray(12, 16))).toBe("IHDR");
    expect(view.getUint32(16)).toBe(40);
    expect(view.getUint32(20)).toBe(30);
    // Every chunk carries a correct CRC.
    let position = 8;
    while (position < png.length) {
      const length = view.getUint32(position);
      const crc = view.getUint32(position + 8 + length);
      expect(crc).toBe(crc32(png.subarray(position + 4, position + 8 + length)));
      position += 12 + length;
    }
    expect(position).toBe(png.length);
  });
});

const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const CENTRAL = Buffer.from([0x50, 0x4b, 0x01, 0x02]);

/** Reject pathological XLSX ZIP containers before SheetJS/ExcelJS sees them. */
export function isSafeXlsxContainer(buffer: Buffer): boolean {
  if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  const eocd = buffer.lastIndexOf(EOCD, buffer.length - 22);
  if (eocd < 0 || buffer.length - eocd > 22 + 65_535) return false;
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entries === 0 || entries > 1_000 || centralSize > 2 * 1024 * 1024) return false;
  if (centralOffset + centralSize > buffer.length) return false;

  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > buffer.length || !buffer.subarray(cursor, cursor + 4).equals(CENTRAL)) return false;
    const compressed = buffer.readUInt32LE(cursor + 20);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (compressed === 0 && uncompressed > 0) return false;
    if (compressed > 0 && uncompressed / compressed > 100) return false;
    totalUncompressed += uncompressed;
    if (totalUncompressed > 100 * 1024 * 1024) return false;
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return true;
}

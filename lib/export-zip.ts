type ZipEntry = {
  name: string;
  data: Uint8Array;
  crc: number;
  modTime: number;
  modDate: number;
  offset: number;
};

const encoder = new TextEncoder();

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }

  crcTable = table;
  return table;
}

function crc32(data: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i += 1) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const modTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const modDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return { modTime, modDate };
}

function writeUInt16LE(value: number) {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, value, true);
  return buffer;
}

function writeUInt32LE(value: number) {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, value >>> 0, true);
  return buffer;
}

function concatChunks(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

function toUint8Array(content: string | Uint8Array | ArrayBuffer) {
  if (typeof content === "string") return encoder.encode(content);
  if (content instanceof Uint8Array) return content;
  return new Uint8Array(content);
}

export class SimpleZipBuilder {
  private entries: ZipEntry[] = [];
  private localChunks: Uint8Array[] = [];
  private offset = 0;

  addFile(name: string, content: string | Uint8Array | ArrayBuffer) {
    const normalizedName = name.replace(/^\/+/, "").replace(/\\/g, "/");
    if (!normalizedName || normalizedName.endsWith("/")) return;

    const data = toUint8Array(content);
    const nameBytes = encoder.encode(normalizedName);
    const { modTime, modDate } = getDosDateTime();
    const crc = crc32(data);
    const localHeader = concatChunks([
      writeUInt32LE(0x04034b50),
      writeUInt16LE(20),
      writeUInt16LE(0x0800),
      writeUInt16LE(0),
      writeUInt16LE(modTime),
      writeUInt16LE(modDate),
      writeUInt32LE(crc),
      writeUInt32LE(data.length),
      writeUInt32LE(data.length),
      writeUInt16LE(nameBytes.length),
      writeUInt16LE(0),
      nameBytes,
    ]);

    const entry: ZipEntry = {
      name: normalizedName,
      data,
      crc,
      modTime,
      modDate,
      offset: this.offset,
    };

    this.entries.push(entry);
    this.localChunks.push(localHeader, data);
    this.offset += localHeader.length + data.length;
  }

  generate() {
    const centralChunks: Uint8Array[] = [];
    let centralSize = 0;

    for (const entry of this.entries) {
      const nameBytes = encoder.encode(entry.name);
      const centralHeader = concatChunks([
        writeUInt32LE(0x02014b50),
        writeUInt16LE(20),
        writeUInt16LE(20),
        writeUInt16LE(0x0800),
        writeUInt16LE(0),
        writeUInt16LE(entry.modTime),
        writeUInt16LE(entry.modDate),
        writeUInt32LE(entry.crc),
        writeUInt32LE(entry.data.length),
        writeUInt32LE(entry.data.length),
        writeUInt16LE(nameBytes.length),
        writeUInt16LE(0),
        writeUInt16LE(0),
        writeUInt16LE(0),
        writeUInt16LE(0),
        writeUInt32LE(0),
        writeUInt32LE(entry.offset),
        nameBytes,
      ]);

      centralChunks.push(centralHeader);
      centralSize += centralHeader.length;
    }

    const centralOffset = this.offset;
    const endRecord = concatChunks([
      writeUInt32LE(0x06054b50),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(this.entries.length),
      writeUInt16LE(this.entries.length),
      writeUInt32LE(centralSize),
      writeUInt32LE(centralOffset),
      writeUInt16LE(0),
    ]);

    return concatChunks([...this.localChunks, ...centralChunks, endRecord]);
  }
}

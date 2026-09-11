// @vitest-environment node
import { deflateRawSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { extractText } from "./parser";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function docx(): Buffer {
  const entries = {
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>TypeScript engineer with résumé experience.</w:t></w:r></w:p></w:body></w:document>',
  };
  const localParts: Buffer[] = [];
  const directoryParts: Buffer[] = [];
  let offset = 0;
  for (const [name, xml] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const data = Buffer.from(xml);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    localParts.push(local, filename, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    directoryParts.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(directoryParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, eocd]);
}

describe("real DOCX extraction", () => {
  it("extracts paragraph text through mammoth from a valid deflated archive", async () => {
    expect(await extractText(docx(), "cv.docx")).toBe("TypeScript engineer with résumé experience.");
  });

  it("rejects an EOCD entry count that disagrees with the central directory", async () => {
    const buffer = docx();
    buffer.writeUInt16LE(2, buffer.length - 22 + 8);
    buffer.writeUInt16LE(2, buffer.length - 22 + 10);
    await expect(extractText(buffer, "cv.docx")).rejects.toThrow("Invalid DOCX file.");
  });
});

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { bankRawColumns } from "@innova/contracts";

export const SYNTHETIC_MONTH = "2026-01";
export const SYNTHETIC_PDF_PASSWORD = "synthetic-e2e-pass";
export const FIXTURE_GENERATOR_VERSION = "1";

const FIXTURES_DIR = fileURLToPath(new URL("../.fixtures", import.meta.url));
const WEB_ROOT_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const TEST_RESULTS_DIR = path.join(WEB_ROOT_DIR, "test-results");
const PLAYWRIGHT_REPORT_DIR = path.join(WEB_ROOT_DIR, "playwright-report");

const PDF_PADDING = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

export type SyntheticFixturePaths = {
  directory: string;
  cardXlsx: string;
  bankPlainPdf: string;
  bankProtectedPdf: string;
  manifest: string;
};

type FixtureManifest = {
  version: string;
  files: {
    cardXlsx: { name: string; sha256: string };
    bankPlainPdf: { name: string; sha256: string };
    bankProtectedPdf: { name: string; sha256: string };
  };
};

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function md5(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("md5").update(data).digest());
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function rc4(key: Uint8Array, input: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 0xff;
    const tmp = s[i]!;
    s[i] = s[j]!;
    s[j] = tmp;
  }
  const out = new Uint8Array(input.length);
  let a = 0;
  let b = 0;
  for (let i = 0; i < input.length; i++) {
    a = (a + 1) & 0xff;
    b = (b + s[a]!) & 0xff;
    const tmp = s[a]!;
    s[a] = s[b]!;
    s[b] = tmp;
    out[i] = input[i]! ^ s[(s[a]! + s[b]!) & 0xff]!;
  }
  return out;
}

function padPdfPassword(password: string): Uint8Array {
  const raw = new TextEncoder().encode(password);
  const padded = new Uint8Array(32);
  const copyLen = Math.min(raw.length, 32);
  padded.set(raw.subarray(0, copyLen), 0);
  if (copyLen < 32) {
    padded.set(PDF_PADDING.subarray(0, 32 - copyLen), copyLen);
  }
  return padded;
}

function computePdfEncryption(password: string, fileId: Uint8Array) {
  const paddedUser = padPdfPassword(password);
  const paddedOwner = padPdfPassword(password);
  const perms = -4;
  const pBytes = new Uint8Array([
    perms & 0xff,
    (perms >> 8) & 0xff,
    (perms >> 16) & 0xff,
    (perms >> 24) & 0xff,
  ]);

  let oHash = md5(paddedOwner);
  for (let i = 0; i < 50; i++) {
    oHash = md5(oHash);
  }
  let oValue = rc4(oHash.subarray(0, 16), paddedUser);
  for (let i = 1; i <= 19; i++) {
    const iterKey = oHash.subarray(0, 16).map((byte) => byte ^ i);
    oValue = rc4(iterKey, oValue);
  }

  let fileKey = md5(concatBytes(paddedUser, oValue, pBytes, fileId));
  for (let i = 0; i < 50; i++) {
    fileKey = md5(fileKey.subarray(0, 16));
  }
  const encryptionKey = fileKey.subarray(0, 16);

  let uValue = rc4(encryptionKey, md5(concatBytes(PDF_PADDING, fileId)));
  for (let i = 1; i <= 19; i++) {
    const iterKey = encryptionKey.map((byte) => byte ^ i);
    uValue = rc4(iterKey, uValue);
  }
  const uPadded = concatBytes(uValue, new Uint8Array(16));

  return {
    encryptionKey,
    oHex: toHex(oValue),
    uHex: toHex(uPadded),
    pValue: perms,
  };
}

function objectRc4Key(encryptionKey: Uint8Array, objNum: number, genNum = 0): Uint8Array {
  const suffix = new Uint8Array([
    objNum & 0xff,
    (objNum >> 8) & 0xff,
    (objNum >> 16) & 0xff,
    genNum & 0xff,
    (genNum >> 8) & 0xff,
  ]);
  return md5(concatBytes(encryptionKey, suffix)).subarray(0, 16);
}

function encodeUtf16BeBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i * 2] = (code >> 8) & 0xff;
    bytes[i * 2 + 1] = code & 0xff;
  }
  return bytes;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textCell(ref: string, value: string): string {
  return `<c r="${ref}" t="str"><v xml:space="preserve">${escapeXml(value)}</v></c>`;
}

function numberCell(ref: string, value: number): string {
  return `<c r="${ref}"><v>${value}</v></c>`;
}

export function buildSyntheticCardXlsx(): Uint8Array {
  const sheetXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    "<sheetData>",
    `<row r="2">${textCell("B2", "이용일")}${textCell("C2", "이용카드")}${textCell("D2", "구분")}${textCell("E2", "가맹점명")}${textCell("G2", "이용금액")}${textCell("I2", "원금")}${textCell("J2", "수수료")}</row>`,
    `<row r="4">${textCell("B4", "26.01.12")}${textCell("C4", "합성KB카드")}${textCell("D4", "일시불")}${textCell("E4", "합성커피")}${numberCell("G4", 12500)}${numberCell("I4", 12500)}${numberCell("J4", 0)}</row>`,
    `<row r="5">${textCell("B5", "26.01.18")}${textCell("C5", "합성KB카드")}${textCell("D5", "일시불")}${textCell("E5", "합성마트")}${numberCell("G5", 35000)}${numberCell("I5", 35000)}${numberCell("J5", 0)}</row>`,
    `<row r="6">${textCell("B6", "합계")}${numberCell("I6", 47500)}</row>`,
    "</sheetData>",
    "</worksheet>",
  ].join("");

  const workbookXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets><sheet name="합성카드명세" sheetId="1" r:id="rId1"/></sheets>',
    "</workbook>",
  ].join("");

  const contentTypesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    "</Types>",
  ].join("");

  const rootRelsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    "</Relationships>",
  ].join("");

  const workbookRelsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    "</Relationships>",
  ].join("");

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml),
    "_rels/.rels": strToU8(rootRelsXml),
    "xl/workbook.xml": strToU8(workbookXml),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelsXml),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  });
}

function buildToUnicodeCMap(strings: string[]): Uint8Array {
  const codeUnits = new Set<number>();
  for (const text of strings) {
    for (let i = 0; i < text.length; i++) {
      codeUnits.add(text.charCodeAt(i));
    }
  }
  const sorted = [...codeUnits].sort((a, b) => a - b);
  const lines: string[] = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
  ];
  for (let i = 0; i < sorted.length; i += 100) {
    const chunk = sorted.slice(i, i + 100);
    lines.push(`${chunk.length} beginbfchar`);
    for (const code of chunk) {
      const hex = code.toString(16).toUpperCase().padStart(4, "0");
      lines.push(`<${hex}> <${hex}>`);
    }
    lines.push("endbfchar");
  }
  lines.push("endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end");
  return new TextEncoder().encode(lines.join("\n"));
}

export function buildSyntheticBankPdf(options?: { password?: string }): Uint8Array {
  const password = options?.password;
  const pageHeight = 842;
  const columns = [33, 110, 170, 252, 316, 380, 444, 529];

  const items: Array<{ text: string; x: number; yTop: number }> = [
    { text: "2026.01.01 ~ 2026.01.31", x: 33, yTop: 90 },
    { text: "합성월급통장", x: 170, yTop: 125 },
    { text: "000000-00-001234", x: 170, yTop: 140 },
    { text: "합성사용자", x: 440, yTop: 140 },
    { text: "2,500,000", x: 170, yTop: 156 },
    { text: "2,500,000", x: 440, yTop: 156 },
    { text: "3,000,000", x: 170, yTop: 172 },
    { text: "1,500,000", x: 440, yTop: 172 },
  ];

  bankRawColumns.forEach((label, colIndex) => {
    items.push({ text: label, x: columns[colIndex]!, yTop: 210 });
  });

  const rows = [
    ["2026.01.10 09:00:00", "급여", "합성고용주", "0", "3000000", "4000000", "", "합성지점"],
    ["2026.01.15 10:00:00", "KB국민카드", "합성카드결제", "1000000", "0", "3000000", "", "합성지점"],
    ["2026.01.20 14:30:00", "타계좌 이체", "합성수취인", "500000", "0", "2500000", "", "합성지점"],
  ];

  rows.forEach((row, rowIndex) => {
    const yTop = 240 + rowIndex * 24;
    row.forEach((value, colIndex) => {
      if (value) {
        items.push({ text: value, x: columns[colIndex]!, yTop });
      }
    });
  });

  const contentLines = ["BT", "/F1 8 Tf"];
  for (const item of items) {
    const pdfY = (pageHeight - item.yTop).toFixed(2);
    const hex = toHex(encodeUtf16BeBytes(item.text)).toUpperCase();
    contentLines.push(`1 0 0 1 ${item.x.toFixed(2)} ${pdfY} Tm`);
    contentLines.push(`<${hex}> Tj`);
  }
  contentLines.push("ET");

  const contentBytes = new TextEncoder().encode(contentLines.join("\n"));
  const toUnicodeBytes = buildToUnicodeCMap(items.map((item) => item.text));
  const fileId = md5(new TextEncoder().encode("innova-synthetic-bank-pdf-2026-01"));
  const encryption = password ? computePdfEncryption(password, fileId) : null;

  const encryptStream = (objNum: number, raw: Uint8Array): Uint8Array =>
    encryption ? rc4(objectRc4Key(encryption.encryptionKey, objNum), raw) : raw;

  const encryptPdfString = (objNum: number, text: string): string => {
    if (!encryption) return `(${text})`;
    const encrypted = rc4(objectRc4Key(encryption.encryptionKey, objNum), new TextEncoder().encode(text));
    return `<${toHex(encrypted).toUpperCase()}>`;
  };

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets: number[] = [0];
  let byteOffset = parts[0]!.length;

  const pushBytes = (chunk: Uint8Array) => {
    parts.push(chunk);
    byteOffset += chunk.length;
  };
  const pushStr = (text: string) => pushBytes(encoder.encode(text));

  const writeObject = (objNum: number, body: string) => {
    offsets[objNum] = byteOffset;
    pushStr(`${objNum} 0 obj\n${body}\nendobj\n`);
  };

  const writeStreamObject = (objNum: number, dictEntries: string, streamData: Uint8Array) => {
    const finalBytes = encryptStream(objNum, streamData);
    offsets[objNum] = byteOffset;
    pushStr(`${objNum} 0 obj\n<< ${dictEntries} /Length ${finalBytes.length} >>\nstream\n`);
    pushBytes(finalBytes);
    pushStr("\nendstream\nendobj\n");
  };

  writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  writeObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  writeObject(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  );
  writeStreamObject(4, "", contentBytes);
  writeObject(
    5,
    "<< /Type /Font /Subtype /Type0 /BaseFont /SyntheticGothic /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 8 0 R >>",
  );
  writeObject(
    6,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SyntheticGothic /CIDSystemInfo << /Registry ${encryptPdfString(6, "Adobe")} /Ordering ${encryptPdfString(6, "Identity")} /Supplement 0 >> /FontDescriptor 7 0 R /DW 350 /W [ 32 [250] ] >>`,
  );
  writeObject(
    7,
    "<< /Type /FontDescriptor /FontName /SyntheticGothic /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>",
  );
  writeStreamObject(8, "", toUnicodeBytes);

  if (encryption) {
    writeObject(
      9,
      `<< /Filter /Standard /V 2 /R 3 /Length 128 /P ${encryption.pValue} /O <${encryption.oHex.toUpperCase()}> /U <${encryption.uHex.toUpperCase()}> >>`,
    );
  }

  const totalObjects = encryption ? 10 : 9;
  const xrefOffset = byteOffset;
  const xrefLines = [`xref`, `0 ${totalObjects}`, `0000000000 65535 f `];
  for (let objNum = 1; objNum < totalObjects; objNum++) {
    xrefLines.push(`${String(offsets[objNum]).padStart(10, "0")} 00000 n `);
  }
  const fileIdHex = toHex(fileId).toUpperCase();
  const encryptEntry = encryption ? " /Encrypt 9 0 R" : "";
  xrefLines.push(
    `trailer`,
    `<< /Size ${totalObjects} /Root 1 0 R${encryptEntry} /ID [<${fileIdHex}> <${fileIdHex}>] >>`,
    `startxref`,
    `${xrefOffset}`,
    `%%EOF`,
  );
  pushStr(xrefLines.join("\n") + "\n");

  return concatBytes(...parts);
}

export function getSyntheticFixturePaths(): SyntheticFixturePaths {
  return {
    directory: FIXTURES_DIR,
    cardXlsx: path.join(FIXTURES_DIR, "synthetic-card-2026-01.xlsx"),
    bankPlainPdf: path.join(FIXTURES_DIR, "synthetic-bank-2026-01-plain.pdf"),
    bankProtectedPdf: path.join(FIXTURES_DIR, "synthetic-bank-2026-01-protected.pdf"),
    manifest: path.join(FIXTURES_DIR, "manifest.json"),
  };
}

function cacheIsValid(paths: SyntheticFixturePaths): boolean {
  if (
    !existsSync(paths.manifest) ||
    !existsSync(paths.cardXlsx) ||
    !existsSync(paths.bankPlainPdf) ||
    !existsSync(paths.bankProtectedPdf)
  ) {
    return false;
  }
  try {
    const manifest = JSON.parse(readFileSync(paths.manifest, "utf8")) as FixtureManifest;
    if (manifest.version !== FIXTURE_GENERATOR_VERSION) return false;
    return (
      sha256Hex(readFileSync(paths.cardXlsx)) === manifest.files.cardXlsx.sha256 &&
      sha256Hex(readFileSync(paths.bankPlainPdf)) === manifest.files.bankPlainPdf.sha256 &&
      sha256Hex(readFileSync(paths.bankProtectedPdf)) === manifest.files.bankProtectedPdf.sha256
    );
  } catch {
    return false;
  }
}

export function ensureSyntheticFixtures(options?: { force?: boolean }): SyntheticFixturePaths & {
  reused: boolean;
} {
  const paths = getSyntheticFixturePaths();
  if (!options?.force && cacheIsValid(paths)) {
    return { ...paths, reused: true };
  }

  mkdirSync(paths.directory, { recursive: true });
  const cardBytes = buildSyntheticCardXlsx();
  const bankPlainBytes = buildSyntheticBankPdf();
  const bankProtectedBytes = buildSyntheticBankPdf({ password: SYNTHETIC_PDF_PASSWORD });

  writeFileSync(paths.cardXlsx, cardBytes);
  writeFileSync(paths.bankPlainPdf, bankPlainBytes);
  writeFileSync(paths.bankProtectedPdf, bankProtectedBytes);

  const manifest: FixtureManifest = {
    version: FIXTURE_GENERATOR_VERSION,
    files: {
      cardXlsx: { name: path.basename(paths.cardXlsx), sha256: sha256Hex(cardBytes) },
      bankPlainPdf: { name: path.basename(paths.bankPlainPdf), sha256: sha256Hex(bankPlainBytes) },
      bankProtectedPdf: {
        name: path.basename(paths.bankProtectedPdf),
        sha256: sha256Hex(bankProtectedBytes),
      },
    },
  };
  writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return { ...paths, reused: false };
}

export function cleanE2eArtifacts(): void {
  for (const target of [FIXTURES_DIR, TEST_RESULTS_DIR, PLAYWRIGHT_REPORT_DIR]) {
    rmSync(target, { recursive: true, force: true });
  }
}

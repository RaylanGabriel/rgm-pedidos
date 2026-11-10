/**
 * Gerador mínimo de planilha Excel (.xlsx) sem biblioteca: XML do formato OpenXML + zip.
 * Números e datas saem como números de verdade (somam, filtram e ordenam no Excel/Google Planilhas),
 * e o separador decimal segue a configuração de quem abre — nada de colunas quebradas como no CSV.
 */
import "server-only"

import { deflateRawSync } from "node:zlib"

export type ColType = "text" | "int" | "brl" | "datetime" | "date" | "pct" | "minutes"
export interface Column {
  header: string
  type?: ColType
  width?: number
}
export type CellValue = string | number | null | undefined

/** Linha de uma aba "livre" (Resumo): cada célula diz o próprio estilo. */
export interface FreeCell {
  v: CellValue
  type?: ColType
  bold?: boolean
}

export type Sheet =
  | { name: string; kind: "table"; columns: Column[]; rows: CellValue[][] }
  | { name: string; kind: "free"; widths: number[]; rows: (FreeCell | null)[][] }

// Índices de estilo (cellXfs em styles.xml)
const S = { text: 0, header: 1, brl: 2, datetime: 3, date: 4, int: 5, bold: 6, boldBrl: 7, pct: 8, title: 9, minutes: 10, boldInt: 11 }
const styleOf = (t: ColType | undefined, bold = false) => {
  switch (t) {
    case "brl":
      return bold ? S.boldBrl : S.brl
    case "int":
      return bold ? S.boldInt : S.int
    case "datetime":
      return S.datetime
    case "date":
      return S.date
    case "pct":
      return S.pct
    case "minutes":
      return S.minutes
    default:
      return bold ? S.bold : S.text
  }
}

/** ISO (UTC) → número de série do Excel no horário de São Paulo (UTC-3). */
export function excelDate(iso: string) {
  return (Date.parse(iso) - 3 * 3600_000) / 86_400_000 + 25569
}

const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

function colName(i: number) {
  let s = ""
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function cellXml(ref: string, v: CellValue, style: number, type?: ColType) {
  if (v === null || v === undefined || v === "") return style ? `<c r="${ref}" s="${style}"/>` : ""
  const numeric = typeof v === "number" && Number.isFinite(v) && type !== "text"
  if (numeric) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`
  // texto inline: nunca vira fórmula, mesmo começando com "="
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
}

function sheetXml(sheet: Sheet) {
  const rows: string[] = []
  let cols: string
  let extra = ""
  let views = ""

  if (sheet.kind === "table") {
    const { columns } = sheet
    rows.push(`<row r="1">${columns.map((c, i) => cellXml(`${colName(i)}1`, c.header, S.header)).join("")}</row>`)
    sheet.rows.forEach((r, ri) => {
      const n = ri + 2
      rows.push(`<row r="${n}">${columns.map((c, ci) => cellXml(`${colName(ci)}${n}`, r[ci], styleOf(c.type), c.type)).join("")}</row>`)
    })
    cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`).join("")
    views = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    extra = `<autoFilter ref="A1:${colName(columns.length - 1)}${sheet.rows.length + 1}"/>`
  } else {
    sheet.rows.forEach((r, ri) => {
      const n = ri + 1
      if (!r || r.length === 0) return
      const cells = r.map((c, ci) => (c ? cellXml(`${colName(ci)}${n}`, c.v, ri === 0 ? S.title : styleOf(c.type, c.bold), c.type) : "")).join("")
      rows.push(`<row r="${n}"${ri === 0 ? ' ht="22" customHeight="1"' : ""}>${cells}</row>`)
    })
    cols = sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")
    views = `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>`
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `${views}<cols>${cols}</cols><sheetData>${rows.join("")}</sheetData>${extra}</worksheet>`
  )
}

function stylesXml(headerHex: string) {
  const fill = /^#[0-9a-f]{6}$/i.test(headerHex) ? `FF${headerHex.slice(1).toUpperCase()}` : "FF8D1A1E"
  const xf = (numFmt: number, font: number, fillId = 0) =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fillId}" borderId="0" xfId="0"${numFmt ? ' applyNumberFormat="1"' : ""}${font ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}/>`
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="4">` +
    `<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>` +
    `<numFmt numFmtId="165" formatCode="dd/mm/yyyy\\ hh:mm"/>` +
    `<numFmt numFmtId="166" formatCode="dd/mm/yyyy"/>` +
    `<numFmt numFmtId="167" formatCode="0\\ &quot;min&quot;"/>` +
    `</numFmts>` +
    `<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="15"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="${fill}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="12">` +
    xf(0, 0) + // 0 texto
    xf(0, 1, 2) + // 1 cabeçalho
    xf(164, 0) + // 2 R$
    xf(165, 0) + // 3 data e hora
    xf(166, 0) + // 4 data
    xf(1, 0) + // 5 inteiro
    xf(0, 2) + // 6 negrito
    xf(164, 2) + // 7 R$ negrito
    xf(9, 0) + // 8 %
    xf(0, 3) + // 9 título
    xf(167, 0) + // 10 minutos
    xf(1, 2) + // 11 inteiro negrito
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  )
}

/** Monta o arquivo .xlsx. Nomes de aba: até 31 caracteres, sem []:*?/\ */
export function buildXlsx(sheets: Sheet[], headerColor = "#8d1a1e"): Buffer {
  const names = sheets.map((s) => s.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31))
  const filters = sheets
    .map((s, i) =>
      s.kind === "table"
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!$A$1:$${colName(s.columns.length - 1)}$${s.rows.length + 1}</definedName>`
        : "",
    )
    .join("")

  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        (filters ? `<definedNames>${filters}</definedNames>` : "") +
        `</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", stylesXml(headerColor)],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]),
  ]
  return zip(files)
}

// ---------- zip (deflate) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(files: [string, string][]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, content] of files) {
    const raw = Buffer.from(content, "utf8")
    const data = deflateRawSync(raw)
    const nameBuf = Buffer.from(name, "utf8")
    const crc = crc32(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nomes em UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10) // hora
    local.writeUInt16LE(33, 12) // data: 01/01/1980
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(33, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

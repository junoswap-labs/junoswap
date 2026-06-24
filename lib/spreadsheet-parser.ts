/**
 * Minimal CSV + XLSX parser — no external dependencies.
 *
 * XLSX is a ZIP archive containing XML files. We use:
 *   - Native ZIP parsing (local file headers + raw DEFLATE via DecompressionStream)
 *   - DOMParser for XML
 *
 * Returns rows as { address: string; amount: string }[].
 * Caller is responsible for validation.
 */

export interface SpreadsheetRow {
    address: string
    amount: string
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetRow[]> {
    const name = file.name.toLowerCase()
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
        return parseCsvText(await file.text())
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        return parseXlsx(await file.arrayBuffer())
    }
    throw new Error('Unsupported file type. Please upload a .csv or .xlsx file.')
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function parseCsvText(text: string): SpreadsheetRow[] {
    const lines = text.trim().split(/\r?\n/)
    const rows: SpreadsheetRow[] = []

    for (const line of lines) {
        const [a, b] = splitCsvLine(line)
        if (!a || !b) continue
        // Skip header row
        if (a.toLowerCase() === 'address' && b.toLowerCase() === 'amount') continue
        rows.push({ address: a.trim(), amount: b.trim() })
    }

    return rows
}

/** Splits one CSV line respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (ch === ',' && !inQuotes) {
            fields.push(current)
            current = ''
        } else {
            current += ch
        }
    }
    fields.push(current)
    return fields
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

async function parseXlsx(buffer: ArrayBuffer): Promise<SpreadsheetRow[]> {
    const zip = await unzip(buffer)

    const sharedStrings = parseSharedStrings(zip.get('xl/sharedStrings.xml') ?? null)
    const sheetXml =
        zip.get('xl/worksheets/sheet1.xml') ?? zip.get('xl/worksheets/Sheet1.xml') ?? null

    if (!sheetXml) throw new Error('Could not find sheet1 in the Excel file.')

    const sheet = parseSheet(sheetXml, sharedStrings)
    return sheetToRows(sheet)
}

// ---------------------------------------------------------------------------
// ZIP parser — reads Central Directory first for correct sizes
// (local file headers may have size=0 when bit 3 / data descriptor is set)
// ---------------------------------------------------------------------------

interface ZipEntry {
    filename: string
    compression: number
    compressedSize: number
    uncompressedSize: number
    localHeaderOffset: number
}

function findEocd(bytes: Uint8Array, view: DataView): number {
    // Search backwards for End of Central Directory signature 0x06054b50
    for (let i = bytes.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) return i
    }
    throw new Error('Not a valid ZIP file (EOCD not found)')
}

function parseCentralDirectory(bytes: Uint8Array, view: DataView): ZipEntry[] {
    const eocdOffset = findEocd(bytes, view)
    const cdOffset = view.getUint32(eocdOffset + 16, true)
    const cdSize = view.getUint32(eocdOffset + 12, true)
    const decoder = new TextDecoder()
    const entries: ZipEntry[] = []
    let offset = cdOffset

    while (offset < cdOffset + cdSize) {
        if (view.getUint32(offset, true) !== 0x02014b50) break
        const compression = view.getUint16(offset + 10, true)
        const compressedSize = view.getUint32(offset + 20, true)
        const uncompressedSize = view.getUint32(offset + 24, true)
        const filenameLen = view.getUint16(offset + 28, true)
        const extraLen = view.getUint16(offset + 30, true)
        const commentLen = view.getUint16(offset + 32, true)
        const localHeaderOffset = view.getUint32(offset + 42, true)
        const filename = decoder.decode(bytes.subarray(offset + 46, offset + 46 + filenameLen))
        entries.push({ filename, compression, compressedSize, uncompressedSize, localHeaderOffset })
        offset += 46 + filenameLen + extraLen + commentLen
    }

    return entries
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, string>> {
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)
    const decoder = new TextDecoder()
    const files = new Map<string, string>()

    const entries = parseCentralDirectory(bytes, view)

    for (const entry of entries) {
        if (!entry.filename.endsWith('.xml')) continue

        // Skip past local file header to get to compressed data
        const lhOffset = entry.localHeaderOffset
        if (view.getUint32(lhOffset, true) !== 0x04034b50) continue
        const filenameLen = view.getUint16(lhOffset + 26, true)
        const extraLen = view.getUint16(lhOffset + 28, true)
        const dataStart = lhOffset + 30 + filenameLen + extraLen

        const compressedData = bytes.subarray(dataStart, dataStart + entry.compressedSize)

        let raw: Uint8Array
        if (entry.compression === 0) {
            raw = compressedData
        } else if (entry.compression === 8) {
            raw = await inflateRaw(compressedData)
        } else {
            continue
        }

        files.set(entry.filename, decoder.decode(raw))
    }

    return files
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate-raw')
    const writer = ds.writable.getWriter()
    const reader = ds.readable.getReader()

    // Write and close in parallel to avoid deadlock on large payloads
    const writePromise = writer.write(data.buffer as ArrayBuffer).then(() => writer.close())

    const chunks: Uint8Array[] = []
    const readPromise = (async () => {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
        }
    })()

    await Promise.all([writePromise, readPromise])

    const total = chunks.reduce((n, c) => n + c.length, 0)
    const out = new Uint8Array(total)
    let pos = 0
    for (const chunk of chunks) {
        out.set(chunk, pos)
        pos += chunk.length
    }
    return out
}

// ---------------------------------------------------------------------------
// XLSX XML parsers
// ---------------------------------------------------------------------------

function parseSharedStrings(xml: string | null): string[] {
    if (!xml) return []
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const strings: string[] = []
    for (const si of doc.getElementsByTagName('si')) {
        // Concatenate all <t> text inside <si> (handles rich text runs)
        let text = ''
        for (const t of si.getElementsByTagName('t')) {
            text += t.textContent ?? ''
        }
        strings.push(text)
    }
    return strings
}

type SheetCell = { col: number; value: string }
type SheetRow = SheetCell[]

function parseSheet(xml: string, sharedStrings: string[]): SheetRow[] {
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const rows: SheetRow[] = []

    for (const rowEl of doc.getElementsByTagName('row')) {
        const cells: SheetCell[] = []
        for (const c of rowEl.getElementsByTagName('c')) {
            const ref = c.getAttribute('r') ?? ''
            const type = c.getAttribute('t') ?? ''
            const vEl = c.getElementsByTagName('v')[0]
            const rawValue = vEl?.textContent ?? ''

            let value = rawValue
            if (type === 's') {
                // shared string index
                value = sharedStrings[parseInt(rawValue, 10)] ?? ''
            }

            cells.push({ col: colLetterToIndex(ref), value })
        }
        if (cells.length > 0) rows.push(cells)
    }

    return rows
}

function colLetterToIndex(ref: string): number {
    // Extract only leading letters from cell reference like "AB12"
    const letters = ref.replace(/[^A-Za-z]/g, '').toUpperCase()
    let index = 0
    for (const ch of letters) {
        index = index * 26 + (ch.charCodeAt(0) - 64)
    }
    return index // 1-based: A=1, B=2
}

function sheetToRows(rows: SheetRow[]): SpreadsheetRow[] {
    if (rows.length === 0) return []

    // Detect header row — look for "address" and "amount" in first row
    let dataStart = 0
    const firstRow = rows[0]!
    const values = firstRow.map((c) => c.value.toLowerCase().trim())
    if (values.includes('address') && values.includes('amount')) {
        dataStart = 1
    }

    // Figure out which column index holds address and amount
    // Default: col 1 = address, col 2 = amount (template format)
    let addrCol = 1
    let amtCol = 2

    if (dataStart === 1) {
        for (const cell of firstRow) {
            const v = cell.value.toLowerCase().trim()
            if (v === 'address') addrCol = cell.col
            if (v === 'amount') amtCol = cell.col
        }
    }

    const result: SpreadsheetRow[] = []
    for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i]!
        const addr = row.find((c) => c.col === addrCol)?.value.trim() ?? ''
        const amt = row.find((c) => c.col === amtCol)?.value.trim() ?? ''
        if (addr && amt) result.push({ address: addr, amount: amt })
    }
    return result
}

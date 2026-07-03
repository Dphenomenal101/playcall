// Ragie's own create-document endpoint documents a broad supported set
// (plain text: eml/html/json/md/msg/rst/rtf/txt/xml; images: png/webp/jpg/
// jpeg/tiff/bmp/heic; documents: csv/doc/docx/epub/odt/pdf/ppt/pptx/tsv/xlsx/
// xls; plus audio and video) and no per-file byte-size limit at all (only
// page-count caps - 2,000 pages for PDFs, 10,000 for other static documents -
// which aren't meaningfully checkable from a byte size anyway). Duplicating
// an extension allowlist here would just be a second, harder-to-keep-in-sync
// copy of Ragie's own validation, with no real benefit - Ragie already
// returns a clear rejection for a type it can't handle. So this only checks
// size, not type.

// Vercel Functions hard-cap the request body at 4.5MB regardless of any
// app-level config (not configurable for App Router route handlers) - a
// larger upload 413s at the platform level before this code ever runs.
// This stays comfortably under that so a legitimate near-the-limit upload
// gets OUR clear error message instead of a confusing platform 413, leaving
// headroom for the rest of the multipart payload (form fields, etc.) in the
// same request.
export const MAX_UPLOAD_FILE_SIZE_BYTES = 4 * 1024 * 1024

export function validateUploadedFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return { ok: false, error: `${file.name} is larger than the 4MB upload limit.` }
  }

  return { ok: true }
}

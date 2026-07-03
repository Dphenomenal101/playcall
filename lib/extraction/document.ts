// Plain-text extraction for simple formats (TXT, MD, CSV, etc.).
// PDFs, DOCX, PPTX, and images are handled by LlamaParse (lib/integrations/llamaparse.ts)
// which supports visual/complex layouts that local text extraction can't handle.

const MAX_CHARS_PER_DOC = 50_000

function extensionOf(fileName: string): string {
  return (fileName.split(".").pop() ?? "").toLowerCase()
}

export function isPlainTextFile(fileName: string): boolean {
  const ext = extensionOf(fileName)
  return ["txt", "md", "rst", "csv", "tsv", "html", "htm", "xml", "json"].includes(ext)
}

export async function extractTextFromUrl(url: string, _fileName: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  return text.slice(0, MAX_CHARS_PER_DOC).trim()
}

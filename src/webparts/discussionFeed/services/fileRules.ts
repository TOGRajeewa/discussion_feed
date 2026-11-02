/**
 * What a post may carry: PNG, JPEG or PDF, as the BA specified. Size is not
 * limited here; SharePoint's own limit applies and its refusal is shown.
 *
 * Checked before uploading, because the library keeps whatever reaches it,
 * whether or not the post is then submitted or approved. Like the role checks,
 * this is a check in the widget and not a boundary: authors need Add rights on
 * the library, and SharePoint has no per-library list of allowed types, only a
 * blocklist for the whole web application.
 */
interface IFileType {
  extensions: string[];
  /** The bytes a real file of this type starts with. */
  signature: number[];
}

const PNG: IFileType = { extensions: ['.png'], signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] };
const JPEG: IFileType = { extensions: ['.jpg', '.jpeg'], signature: [0xFF, 0xD8, 0xFF] };
const PDF: IFileType = { extensions: ['.pdf'], signature: [0x25, 0x50, 0x44, 0x46, 0x2D] };   // "%PDF-"

export interface IFileRule {
  types: IFileType[];
  /** The file dialog's filter. Only a hint: the dialog can be switched to "All files". */
  accept: string;
  /** Ends the sentence naming a refused file. */
  refused: string;
  /** Says what would have been accepted. */
  allowed: string;
}

/** The Add image button: these show in the post's image gallery, which a PDF cannot. */
export const IMAGE_RULE: IFileRule = {
  types: [PNG, JPEG],
  accept: '.png,.jpg,.jpeg',
  refused: 'was not added.',
  allowed: 'Only PNG or JPEG images can be added here. To attach a PDF, use the paperclip.'
};

/** The Attach button. */
export const ATTACHMENT_RULE: IFileRule = {
  types: [PNG, JPEG, PDF],
  accept: '.png,.jpg,.jpeg,.pdf',
  refused: 'was not attached.',
  allowed: 'Only PNG, JPEG or PDF files can be attached.'
};

function readStart(file: Blob, length: number): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve: (b: Uint8Array) => void, reject: (e: any) => void) => {
    const reader: FileReader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, length));
  });
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((b: number, i: number) => bytes[i] === b);
}

/**
 * Both the name and the content must pass: the name alone would let a program
 * renamed to .pdf through. The content may be any type the rule allows, not
 * only the one its name says, since a JPEG saved as .png is harmless and common.
 */
export function isFileAllowed(file: File, rule: IFileRule): Promise<boolean> {
  const name: string = (file.name || '').toLowerCase();
  const nameOk: boolean = rule.types.some((t: IFileType) =>
    t.extensions.some((ext: string) => name.slice(-ext.length) === ext));
  if (!nameOk) { return Promise.resolve(false); }

  const longest: number = Math.max.apply(null, rule.types.map((t: IFileType) => t.signature.length));
  return readStart(file, longest).then(
    (bytes: Uint8Array) => rule.types.some((t: IFileType) => startsWith(bytes, t.signature)),
    () => false
  );
}

/**
 * SharePoint's own words when it refuses an upload (a file over its size limit,
 * say), unescaped from the JSON error PnP puts in its message. IIS can refuse a
 * very large request before SharePoint sees it, with no such JSON.
 */
export function uploadFailureText(e: any): string {
  const m: RegExpExecArray = /"value"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(String((e && e.message) || ''));
  if (m) {
    try { return JSON.parse(m[1]); } catch (ignored) { /* fall through to the general note */ }
  }
  return 'The upload did not complete. The file may be too large for SharePoint, or the connection was lost.';
}

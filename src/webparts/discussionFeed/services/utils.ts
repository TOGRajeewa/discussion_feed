import * as DOMPurify from 'dompurify';
import { EMOJI_SET, IEmoji } from '../components/emojiSet';
import { IMentionUser } from '../models';

/** Strip tags for the mandatory list Title column (cannot hold HTML). */
export function stripHtml(html: string): string {
  const tmp: HTMLDivElement = document.createElement('div');
  tmp.innerHTML = html || '';
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

/** Sanitize stored editor HTML before we render it with dangerouslySetInnerHTML. */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html || '', {
    ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'td', 'th'],
    ADD_ATTR: ['data-mention-login', 'colspan', 'rowspan']
  });
}

let emojiByLabel: { [label: string]: IEmoji } = null;

/**
 * Put back emoji images that SharePoint stripped on save. Posts written before
 * the editor stopped converting URLs have <img class="df-emoji"> tags whose
 * relative src was dropped; the title still names the emoji, so the file is
 * looked up in the same table the picker uses. An unknown title becomes its
 * alt text rather than a broken image. Parsed with DOMParser, which neither
 * runs scripts nor fetches images; the result is still sanitised at render.
 */
export function repairEmoji(html: string, emojiBaseUrl: string): string {
  if (!html || html.indexOf('df-emoji') < 0) { return html; }
  if (!emojiByLabel) {
    emojiByLabel = {};
    EMOJI_SET.forEach((e: IEmoji) => { emojiByLabel[e.label.toLowerCase()] = e; });
  }

  const doc: Document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const imgs: HTMLImageElement[] = Array.prototype.slice.call(doc.body.querySelectorAll('img.df-emoji'));
  let changed: boolean = false;
  imgs.forEach((img: HTMLImageElement) => {
    if ((img.getAttribute('src') || '').trim()) { return; }
    changed = true;
    const label: string = img.getAttribute('title') || img.getAttribute('alt') || '';
    const e: IEmoji = emojiByLabel[label.trim().toLowerCase()];
    if (e && emojiBaseUrl) {
      img.setAttribute('src', emojiBaseUrl + e.file);
    } else {
      img.parentNode.replaceChild(doc.createTextNode(img.getAttribute('alt') || label), img);
    }
  });
  return changed ? doc.body.innerHTML : html;
}

/**
 * Separate the attached-image gallery (<div class="df-images">, appended by the
 * composer) from the rest of a sanitised body, so the card can place the
 * mention line between the text and the pictures.
 */
export function splitBodyImages(html: string): { text: string; images: string } {
  if (!html || html.indexOf('df-images') < 0) { return { text: html || '', images: '' }; }
  const doc: Document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const galleries: Element[] = Array.prototype.slice.call(doc.body.querySelectorAll('div.df-images'));
  const images: string = galleries.map((g: Element) => {
    g.parentNode.removeChild(g);
    return g.outerHTML;
  }).join('');
  return { text: doc.body.innerHTML, images };
}

/**
 * Highlight the names in a Praise post's lead line. The composer stores that
 * line as plain text -- <em>Praise for @Name, @Name</em> -- so the names are
 * wrapped here, at display time, which also covers posts saved earlier. Only
 * text nodes are created, so nothing from the body is re-parsed as HTML.
 */
export function highlightPraiseNames(html: string, className: string): string {
  const PREFIX: string = 'Praise for ';
  if (!html || html.indexOf(PREFIX) < 0) { return html; }
  const doc: Document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const em: Element = Array.prototype.slice.call(doc.body.querySelectorAll('em'))
    .filter((e: Element) => (e.textContent || '').indexOf(PREFIX + '@') === 0)[0];
  if (!em) { return html; }

  const names: string[] = em.textContent.substring(PREFIX.length).split(/,\s*(?=@)/);
  while (em.firstChild) { em.removeChild(em.firstChild); }
  em.appendChild(doc.createTextNode(PREFIX));
  names.forEach((n: string, i: number) => {
    if (i > 0) { em.appendChild(doc.createTextNode(', ')); }
    const span: HTMLElement = doc.createElement('span');
    span.className = className;
    span.textContent = n.trim();
    em.appendChild(span);
  });
  return doc.body.innerHTML;
}

/**
 * Unwrap an expanded MentionedUsers (UserMulti) column. With odata=verbose it
 * comes back as { results: [...] }; a post with nobody mentioned may give null.
 */
export function mentionsFrom(v: any): IMentionUser[] {
  const rows: any[] = !v ? [] : Array.isArray(v) ? v : (Array.isArray(v.results) ? v.results : []);
  return rows
    .filter((u: any) => u && u.Title)
    .map((u: any) => ({ title: u.Title, loginName: u.Name || '', email: u.EMail || '' }));
}

/** Local profile photo — userphoto.aspx, NOT Graph. */
export function localPhotoUrl(webUrl: string, email: string, size: 'S' | 'M' | 'L' = 'M'): string {
  if (!email) { return ''; }
  return `${webUrl}/_layouts/15/userphoto.aspx?size=${size}&accountname=${encodeURIComponent(email)}`;
}

/** Initials for the burgundy avatar fallback (matches the mockup: "KB", "AS"...). */
export function initials(displayName: string): string {
  if (!displayName) { return '?'; }
  const parts: string[] = displayName.replace(/^(Dr|Mr|Mrs|Ms)\.?\s+/i, '').trim().split(/\s+/);
  if (parts.length === 1) { return parts[0].substring(0, 2).toUpperCase(); }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "2 hours ago" / "Yesterday" relative time like the mockup. */
export function timeAgo(iso: string): string {
  const then: number = new Date(iso).getTime();
  const diff: number = Date.now() - then;
  const min: number = Math.floor(diff / 60000);
  if (min < 1) { return 'Just now'; }
  if (min < 60) { return `${min} minute${min === 1 ? '' : 's'} ago`; }
  const hrs: number = Math.floor(min / 60);
  if (hrs < 24) { return `${hrs} hour${hrs === 1 ? '' : 's'} ago`; }
  const days: number = Math.floor(hrs / 24);
  if (days === 1) { return 'Yesterday'; }
  if (days < 7) { return `${days} days ago`; }
  return new Date(iso).toLocaleDateString();
}

/**
 * Copy text to the clipboard; resolves true only if it actually got there.
 *
 * navigator.clipboard exists only in secure contexts (https or localhost), and
 * the intranet farms are also reached over plain http, so fall back to the
 * older select-and-copy route rather than claiming a copy that never happened.
 */
export function copyText(text: string): Promise<boolean> {
  const nav: any = navigator as any;
  if (nav.clipboard && (window as any).isSecureContext) {
    return nav.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  const ta: HTMLTextAreaElement = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok: boolean = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

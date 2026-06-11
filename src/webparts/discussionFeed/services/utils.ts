import * as DOMPurify from 'dompurify';

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

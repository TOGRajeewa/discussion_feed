/**
 * @jest-environment jsdom
 */
import { stripHtml, initials, timeAgo, localPhotoUrl } from '../utils';

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello&nbsp;<b>world</b></p>')).toBe('Hello world');
  });
  it('handles empty input', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('initials', () => {
  it('uses first + last initial', () => {
    expect(initials('K. Bandara')).toBe('KB');
    expect(initials('A. Silva')).toBe('AS');
    expect(initials('N. Peiris')).toBe('NP');
  });
  it('strips a leading title (Dr.)', () => {
    expect(initials('Dr. S. Weerasinghe')).toBe('SW');
  });
  it('falls back to two chars for a single name', () => {
    expect(initials('Madonna')).toBe('MA');
  });
  it('returns ? for empty', () => {
    expect(initials('')).toBe('?');
  });
});

describe('timeAgo', () => {
  const now: number = Date.now();
  it('formats minutes', () => {
    expect(timeAgo(new Date(now - 5 * 60000).toISOString())).toBe('5 minutes ago');
  });
  it('formats a single hour', () => {
    expect(timeAgo(new Date(now - 60 * 60000).toISOString())).toBe('1 hour ago');
  });
  it('formats yesterday', () => {
    expect(timeAgo(new Date(now - 25 * 3600000).toISOString())).toBe('Yesterday');
  });
});

describe('localPhotoUrl', () => {
  it('builds a userphoto.aspx url (no Graph)', () => {
    const url: string = localPhotoUrl('https://intranet/sites/x', 'a@b.com', 'M');
    expect(url).toContain('/_layouts/15/userphoto.aspx');
    expect(url).toContain('size=M');
    expect(url).toContain('accountname=a%40b.com');
  });
  it('returns empty when no email', () => {
    expect(localPhotoUrl('https://intranet', '')).toBe('');
  });
});

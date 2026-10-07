/**
 * @jest-environment jsdom
 */
import { stripHtml, initials, timeAgo, localPhotoUrl } from '../../src/webparts/discussionFeed/services/utils';

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

import { repairEmoji, splitBodyImages, mentionsFrom } from '../../src/webparts/discussionFeed/services/utils';

const BASE = '/SiteAssets/SiteComponents/discussion-feed/emoji/';

describe('repairEmoji', () => {
  it('rebuilds a src stripped by SharePoint from the title', () => {
    const stored = '<div class="ExternalClassX"><p>hi <img class="df-emoji" style="width&#58;1.3em;" title="Cat Face" alt="Cat Face" /></p></div>';
    const out = repairEmoji(stored, BASE);
    expect(out).toContain(`src="${BASE}cat_face_3d.png"`);
    expect(out).toContain('title="Cat Face"');
  });
  it('turns an unknown emoji into its alt text instead of a broken image', () => {
    const out = repairEmoji('<p><img class="df-emoji" title="No Such Thing" alt="No Such Thing" /></p>', BASE);
    expect(out).not.toContain('<img');
    expect(out).toContain('No Such Thing');
  });
  it('leaves emoji that still have a src, and other images, untouched', () => {
    const html = `<p><img class="df-emoji" src="${BASE}cat_face_3d.png" title="Cat Face" alt="Cat Face" /><img src="/x.png" alt="" /></p>`;
    expect(repairEmoji(html, BASE)).toBe(html);
  });
});

describe('splitBodyImages', () => {
  it('moves the image gallery out of the text', () => {
    const r = splitBodyImages('<div class="ExternalClassX"><p>text</p><div class="df-images" data-count="1"><img src="/a.png" alt="a"></div></div>');
    expect(r.text).toBe('<div class="ExternalClassX"><p>text</p></div>');
    expect(r.images).toBe('<div class="df-images" data-count="1"><img src="/a.png" alt="a"></div>');
  });
  it('returns the body unchanged when there are no images', () => {
    expect(splitBodyImages('<p>text</p>')).toEqual({ text: '<p>text</p>', images: '' });
  });
});

describe('mentionsFrom', () => {
  it('unwraps the odata=verbose results wrapper', () => {
    expect(mentionsFrom({ results: [{ Title: 'Test User2', Name: 'i:0#.w|ad-him\\testuser2', EMail: 't2@x' }] }))
      .toEqual([{ title: 'Test User2', loginName: 'i:0#.w|ad-him\\testuser2', email: 't2@x' }]);
  });
  it('treats a missing column as nobody mentioned', () => {
    expect(mentionsFrom(null)).toEqual([]);
    expect(mentionsFrom({ __deferred: {} })).toEqual([]);
  });
});

import { highlightPraiseNames } from '../../src/webparts/discussionFeed/services/utils';

describe('highlightPraiseNames', () => {
  it('wraps each praised name in the mention style', () => {
    const out = highlightPraiseNames('<div class="ExternalClassX"><p>🎉 <em>Praise for @SP user, @Test User2</em></p><p>well done</p></div>', 'm');
    expect(out).toBe('<div class="ExternalClassX"><p>🎉 <em>Praise for <span class="m">@SP user</span>, <span class="m">@Test User2</span></em></p><p>well done</p></div>');
  });
  it('treats names as text, never markup', () => {
    const out = highlightPraiseNames('<p><em>Praise for @a &lt;b&gt;x&lt;/b&gt;</em></p>', 'm');
    expect(out).toBe('<p><em>Praise for <span class="m">@a &lt;b&gt;x&lt;/b&gt;</span></em></p>');
  });
  it('leaves bodies without a Praise line alone', () => {
    expect(highlightPraiseNames('<p><em>Praise for</em> nobody</p>', 'm')).toBe('<p><em>Praise for</em> nobody</p>');
  });
});

import { idFromHash } from '../../src/webparts/discussionFeed/services/utils';

describe('idFromHash', () => {
  it('reads the id for its own key only', () => {
    expect(idFromHash('post', '#post=12')).toBe(12);
    expect(idFromHash('market', '#post=12')).toBeNull();
    expect(idFromHash('market', '#market=7')).toBe(7);
  });
  it('finds the key among other parameters, but not inside another name', () => {
    expect(idFromHash('market', '#tab=x&market=7')).toBe(7);
    expect(idFromHash('market', '#supermarket=7')).toBeNull();
    expect(idFromHash('post', '')).toBeNull();
  });
});
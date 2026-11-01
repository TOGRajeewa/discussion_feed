/**
 * @jest-environment jsdom
 */
import { reviewNoticeText } from '../../src/webparts/discussionFeed/components/reviewNotice';
import { IReviewNotice, IReviewConflict, ModerationStatus } from '../../src/webparts/discussionFeed/models';

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60000).toISOString();

function notice(action: 'approve' | 'reject', c: Partial<IReviewConflict>): IReviewNotice {
  const conflict: IReviewConflict = { status: ModerationStatus.Rejected, by: 'Comm Admin', when: minutesAgo(2), reason: '', latest: null, ...c };
  return { action, conflict, post: null };
}

describe('reviewNoticeText', () => {
  it('approve on a post someone else rejected (the QA report)', () => {
    const t = reviewNoticeText(notice('approve', { reason: 'sample reject reason' }));
    expect(t.title).toBe('Your approval was not saved.');
    expect(t.detail).toBe('Comm Admin already rejected this post 2 minutes ago.');
    expect(t.reason).toBe('sample reject reason');
  });

  it('approve on a post someone else approved', () => {
    const t = reviewNoticeText(notice('approve', { status: ModerationStatus.Approved }));
    expect(t.title).toBe('Your approval was not saved.');
    expect(t.detail).toBe('Comm Admin already approved this post 2 minutes ago. It is live in the feed.');
    expect(t.reason).toBe('');
  });

  it('reject on a post someone else approved', () => {
    const t = reviewNoticeText(notice('reject', { status: ModerationStatus.Approved, by: 'System Account' }));
    expect(t.title).toBe('Your rejection was not saved.');
    expect(t.detail).toBe('System Account already approved this post 2 minutes ago. It is live in the feed.');
  });

  it('reject on a post someone else rejected quotes their reason', () => {
    const t = reviewNoticeText(notice('reject', { reason: 'off topic' }));
    expect(t.title).toBe('Your rejection was not saved.');
    expect(t.detail).toBe('Comm Admin already rejected this post 2 minutes ago.');
    expect(t.reason).toBe('off topic');
  });

  it('a deleted post', () => {
    const t = reviewNoticeText(notice('approve', { status: null, by: '', when: '' }));
    expect(t.title).toBe('This post no longer exists.');
    expect(t.detail).toBe('It was deleted after you opened the queue.');
  });

  it('a post edited but still pending asks for another look', () => {
    const t = reviewNoticeText(notice('reject', { status: ModerationStatus.Pending }));
    expect(t.title).toBe('This post was changed after you opened the queue.');
    expect(t.detail).toBe('The latest version is shown above. Please review it again.');
  });

  it('fits timeAgo labels into the sentence', () => {
    expect(reviewNoticeText(notice('approve', { when: minutesAgo(0) })).detail)
      .toBe('Comm Admin already rejected this post just now.');
    expect(reviewNoticeText(notice('approve', { when: minutesAgo(36 * 60) })).detail)
      .toBe('Comm Admin already rejected this post yesterday.');
    expect(reviewNoticeText(notice('approve', { when: minutesAgo(14 * 24 * 60) })).detail)
      .toMatch(/^Comm Admin already rejected this post on \S+\.$/);
  });
});

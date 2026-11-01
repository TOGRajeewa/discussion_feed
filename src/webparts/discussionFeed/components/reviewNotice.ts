import { IReviewNotice, ModerationStatus } from '../models';
import { timeAgo } from '../services/utils';

export interface IReviewNoticeText {
  title: string;
  detail: string;
  /** The rejection reason to quote; empty when there is none. */
  reason: string;
}

/**
 * The words on a queue card whose approve or reject SharePoint refused because
 * the post changed after the queue was loaded: one message for each way that
 * can happen.
 */
export function reviewNoticeText(n: IReviewNotice): IReviewNoticeText {
  const c = n.conflict;
  if (c.status === null) {
    return { title: 'This post no longer exists.', detail: 'It was deleted after you opened the queue.', reason: '' };
  }
  if (c.status === ModerationStatus.Pending) {
    return {
      title: 'This post was changed after you opened the queue.',
      detail: 'The latest version is shown above. Please review it again.',
      reason: ''
    };
  }

  const title: string = `Your ${n.action === 'approve' ? 'approval' : 'rejection'} was not saved.`;
  const who: string = c.by || 'Someone';
  const when: string = whenPhrase(c.when);
  if (c.status === ModerationStatus.Approved) {
    return { title, detail: `${who} already approved this post ${when}. It is live in the feed.`, reason: '' };
  }
  if (c.status === ModerationStatus.Rejected) {
    return { title, detail: `${who} already rejected this post ${when}.`, reason: c.reason };
  }
  return { title, detail: `${who} changed this post's status ${when}.`, reason: '' };
}

/** timeAgo() is a label ("Just now", "2 minutes ago", a date); this fits it into a sentence. */
function whenPhrase(iso: string): string {
  const t: string = timeAgo(iso);
  if (t === 'Just now' || t === 'Yesterday') { return t.toLowerCase(); }
  return /ago$/.test(t) ? t : `on ${t}`;
}

import * as React from 'react';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';

export interface IEngagementBarProps {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  /** Super Admin only — see ThreadCard.canDelete. */
  canDelete: boolean;
  /** True briefly after a successful Share; swaps in a "Link copied" note. */
  shareCopied: boolean;
  onLike: () => void;
  onToggleComments: () => void;
  onShare: () => void;
  onDelete: () => void;
}

/**
 * Likes (count) | Comments (count) | Share — matches the mockup's bottom bar.
 * Delete sits here beside Share rather than in the card corner, which the
 * category badge already occupies.
 */
export function EngagementBar(props: IEngagementBarProps): JSX.Element {
  return (
    <div className={styles.engagement}>
      <div className={styles.engLeft}>
        <button
          type="button"
          className={`${styles.engItem} ${props.likedByMe ? styles.engItemActive : ''}`}
          onClick={props.onLike}
          aria-pressed={props.likedByMe}
        >
          <Icon iconName={props.likedByMe ? 'LikeSolid' : 'Like'} />
          <span>{props.likeCount}</span>
        </button>

        <button type="button" className={styles.engItem} onClick={props.onToggleComments}>
          <Icon iconName="Comment" />
          <span>{props.commentCount}</span>
        </button>
      </div>

      {/* The confirmation takes the Share button's place, right where the user
          clicked; aria-live announces it to screen readers. */}
      <button
        type="button"
        className={`${styles.engItem} ${styles.engShare}`}
        onClick={props.onShare}
        aria-live="polite"
      >
        {props.shareCopied
          ? <span className={styles.engShareDone}><Icon iconName="CheckMark" /><span>Link copied</span></span>
          : [<Icon key="i" iconName="Share" />, <span key="t">Share</span>]}
      </button>

      {/* Colour lives on the inner span: the portal forces the button's own
          colour with an id-scoped !important rule, which an element's own
          declaration still beats because the button's colour only reaches it
          by inheritance. */}
      {props.canDelete &&
        <button
          type="button"
          className={`${styles.engItem} ${styles.engDelete}`}
          title="Delete this post"
          onClick={props.onDelete}
        >
          <span className={styles.engDeleteLabel}><Icon iconName="Delete" /><span>Delete</span></span>
        </button>}
    </div>
  );
}

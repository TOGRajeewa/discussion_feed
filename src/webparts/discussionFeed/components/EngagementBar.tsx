import * as React from 'react';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';

export interface IEngagementBarProps {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  /** Super Admin only — see ThreadCard.canDelete. */
  canDelete: boolean;
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

      <button type="button" className={`${styles.engItem} ${styles.engShare}`} onClick={props.onShare}>
        <Icon iconName="Share" />
        <span>Share</span>
      </button>

      {props.canDelete &&
        <button
          type="button"
          className={`${styles.engItem} ${styles.engDelete}`}
          title="Delete this post"
          onClick={props.onDelete}
        >
          <Icon iconName="Delete" />
          <span>Delete</span>
        </button>}
    </div>
  );
}

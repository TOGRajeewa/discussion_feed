import * as React from 'react';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';

export interface IEngagementBarProps {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  onLike: () => void;
  onToggleComments: () => void;
  onShare: () => void;
}

/** Likes (count) | Comments (count) | Share — matches the mockup's bottom bar. */
export function EngagementBar(props: IEngagementBarProps): JSX.Element {
  return (
    <div className={styles.engagement}>
      <div className={styles.engLeft}>
        <button
          className={`${styles.engItem} ${props.likedByMe ? styles.engItemActive : ''}`}
          onClick={props.onLike}
          aria-pressed={props.likedByMe}
        >
          <Icon iconName={props.likedByMe ? 'LikeSolid' : 'Like'} />
          <span>{props.likeCount}</span>
        </button>

        <button className={styles.engItem} onClick={props.onToggleComments}>
          <Icon iconName="Comment" />
          <span>{props.commentCount}</span>
        </button>
      </div>

      <button className={`${styles.engItem} ${styles.engShare}`} onClick={props.onShare}>
        <Icon iconName="Share" />
        <span>Share</span>
      </button>
    </div>
  );
}

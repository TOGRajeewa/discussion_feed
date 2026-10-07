import * as React from 'react';
import { DefaultButton } from 'office-ui-fabric-react/lib/Button';
import { Spinner, SpinnerSize } from 'office-ui-fabric-react/lib/Spinner';
import styles from './DiscussionFeed.module.scss';
import { ThreadCard } from './ThreadCard';
import { ICategoryDef } from './categories';
import { IPost, IComment, IShareResult } from '../models';

export interface IFeedListProps {
  posts: IPost[];
  currentUserId: number;
  expandedPostId: number;
  commentsByPost: { [postId: number]: IComment[] };
  commentsLoading: { [postId: number]: boolean };
  hasNext: boolean;
  loadingMore: boolean;
  /** Who may delete what; see ThreadCard.canDelete. */
  canDeletePost: (p: IPost) => boolean;
  canDeleteComment: (c: IComment) => boolean;
  /** The feed's post types, for the badge labels. */
  categories?: ICategoryDef[];
  /** Shown instead of an empty list; nothing is shown when omitted. */
  emptyText?: string;
  /** Element id prefix of the cards; see ThreadCard.idPrefix. */
  idPrefix?: string;
  onLoadMore: () => void;
  onLike: (postId: number) => void;
  onToggleComments: (postId: number) => void;
  onAddComment: (postId: number, html: string) => void;
  onShare: (postId: number) => Promise<IShareResult>;
  onDeletePost: (postId: number) => void;
  onDeleteComment: (postId: number, commentId: number) => void;
}

export function FeedList(props: IFeedListProps): JSX.Element {
  return (
    <div>
      {props.posts.map((p: IPost) => (
        <ThreadCard
          key={p.id}
          post={p}
          currentUserId={props.currentUserId}
          expanded={props.expandedPostId === p.id}
          commentsLoading={!!props.commentsLoading[p.id]}
          comments={props.commentsByPost[p.id] || []}
          canDelete={props.canDeletePost(p)}
          canDeleteComment={props.canDeleteComment}
          categories={props.categories}
          idPrefix={props.idPrefix}
          onLike={props.onLike}
          onToggleComments={props.onToggleComments}
          onAddComment={props.onAddComment}
          onShare={props.onShare}
          onDeletePost={props.onDeletePost}
          onDeleteComment={props.onDeleteComment}
        />
      ))}

      {props.posts.length === 0 && props.emptyText && !props.loadingMore &&
        <div className={styles.emptyNote}>{props.emptyText}</div>}

      {props.loadingMore &&
        <div style={{ textAlign: 'center', padding: 12 }}>
          <Spinner size={SpinnerSize.medium} label="Loading more…" />
        </div>}

      {props.hasNext && !props.loadingMore &&
        <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
          <DefaultButton text="Load more" onClick={props.onLoadMore} />
        </div>}
    </div>
  );
}

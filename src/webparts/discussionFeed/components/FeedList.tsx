import * as React from 'react';
import { DefaultButton } from 'office-ui-fabric-react/lib/Button';
import { Spinner, SpinnerSize } from 'office-ui-fabric-react/lib/Spinner';
import { ThreadCard } from './ThreadCard';
import { IPost, IComment } from '../models';

export interface IFeedListProps {
  posts: IPost[];
  currentUserId: number;
  expandedPostId: number;
  commentsByPost: { [postId: number]: IComment[] };
  commentsLoading: { [postId: number]: boolean };
  hasNext: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onLike: (postId: number) => void;
  onToggleComments: (postId: number) => void;
  onAddComment: (postId: number, html: string) => void;
  onShare: (postId: number) => void;
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
          onLike={props.onLike}
          onToggleComments={props.onToggleComments}
          onAddComment={props.onAddComment}
          onShare={props.onShare}
        />
      ))}

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

import * as React from 'react';
import styles from './DiscussionFeed.module.scss';
import { CardHeader } from './CardHeader';
import { EngagementBar } from './EngagementBar';
import { CommentThread } from './CommentThread';
import { IPost, IComment } from '../models';
import { sanitize } from '../services/utils';

export interface IThreadCardProps {
  post: IPost;
  currentUserId: number;
  expanded: boolean;
  commentsLoading: boolean;
  comments: IComment[];
  onLike: (postId: number) => void;
  onToggleComments: (postId: number) => void;
  onAddComment: (postId: number, html: string) => void;
  onShare: (postId: number) => void;
}

export class ThreadCard extends React.Component<IThreadCardProps, {}> {
  public render(): JSX.Element {
    const p: IPost = this.props.post;
    const likedByMe: boolean = p.likeUserIds.indexOf(this.props.currentUserId) > -1;

    return (
      <div className={styles.card}>
        <CardHeader
          name={p.authorTitle}
          dept={p.authorDept}
          picUrl={p.authorPicUrl}
          created={p.created}
          category={p.category}
        />

        <div
          className={styles.body}
          dangerouslySetInnerHTML={{ __html: sanitize(p.bodyHtml) }}
        />

        <EngagementBar
          likeCount={p.likeUserIds.length}
          commentCount={p.commentCount}
          likedByMe={likedByMe}
          onLike={() => this.props.onLike(p.id)}
          onToggleComments={() => this.props.onToggleComments(p.id)}
          onShare={() => this.props.onShare(p.id)}
        />

        {this.props.expanded &&
          <CommentThread
            comments={this.props.comments}
            loading={this.props.commentsLoading}
            onAdd={(html: string) => this.props.onAddComment(p.id, html)}
          />
        }
      </div>
    );
  }
}

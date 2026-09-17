import * as React from 'react';
import styles from './DiscussionFeed.module.scss';
import { CardHeader } from './CardHeader';
import { EngagementBar } from './EngagementBar';
import { CommentThread } from './CommentThread';
import { IPost, IComment, IShareResult } from '../models';
import { sanitize } from '../services/utils';

export interface IThreadCardProps {
  post: IPost;
  currentUserId: number;
  expanded: boolean;
  commentsLoading: boolean;
  comments: IComment[];
  /**
   * Whether to offer delete. Only a Super Admin can actually delete -- the
   * permission level denies everyone else -- so this hides a control that
   * would fail rather than granting anything.
   */
  canDelete: boolean;
  onLike: (postId: number) => void;
  onToggleComments: (postId: number) => void;
  onAddComment: (postId: number, html: string) => void;
  onShare: (postId: number) => Promise<IShareResult>;
  onDeletePost: (postId: number) => void;
  onDeleteComment: (postId: number, commentId: number) => void;
}

export interface IThreadCardState {
  /** Result of the last Share click, shown inside this card; null when hidden. */
  share: IShareResult;
}

/** How long "Link copied" stays up. A failed copy stays until dismissed. */
const SHARE_NOTE_MS: number = 3000;

export class ThreadCard extends React.Component<IThreadCardProps, IThreadCardState> {
  private shareTimer: any = null;

  constructor(props: IThreadCardProps) {
    super(props);
    this.state = { share: null };
  }

  public componentWillUnmount(): void {
    if (this.shareTimer) { clearTimeout(this.shareTimer); }
  }

  private share = (): void => {
    if (this.shareTimer) { clearTimeout(this.shareTimer); this.shareTimer = null; }
    this.props.onShare(this.props.post.id).then((result: IShareResult) => {
      this.setState({ share: result });
      if (result.copied) {
        this.shareTimer = setTimeout(() => { this.shareTimer = null; this.setState({ share: null }); }, SHARE_NOTE_MS);
      }
    });
  }

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
          canDelete={this.props.canDelete}
          onLike={() => this.props.onLike(p.id)}
          onToggleComments={() => this.props.onToggleComments(p.id)}
          shareCopied={!!this.state.share && this.state.share.copied}
          onShare={this.share}
          onDelete={() => this.props.onDeletePost(p.id)}
        />

        {/* Copy failed (e.g. the browser blocked clipboard access): hand the
            link over for a manual copy instead of claiming success. */}
        {this.state.share && !this.state.share.copied &&
          <div className={styles.shareFallback} role="status">
            <span>Couldn't copy automatically. Copy this link:</span>
            <input
              className={styles.shareFallbackInput}
              readOnly={true}
              value={this.state.share.url}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target as HTMLInputElement).select()}
              autoFocus={true}
            />
            <button
              type="button"
              className={styles.shareFallbackX}
              title="Dismiss"
              onClick={() => this.setState({ share: null })}
            >×</button>
          </div>}

        {this.props.expanded &&
          <CommentThread
            comments={this.props.comments}
            loading={this.props.commentsLoading}
            canDelete={this.props.canDelete}
            onAdd={(html: string) => this.props.onAddComment(p.id, html)}
            onDelete={(commentId: number) => this.props.onDeleteComment(p.id, commentId)}
          />
        }
      </div>
    );
  }
}

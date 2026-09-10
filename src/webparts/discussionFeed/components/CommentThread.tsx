import * as React from 'react';
import { TextField } from 'office-ui-fabric-react/lib/TextField';
import { PrimaryButton } from 'office-ui-fabric-react/lib/Button';
import styles from './DiscussionFeed.module.scss';
import { Avatar } from './Avatar';
import { IComment } from '../models';
import { sanitize, timeAgo } from '../services/utils';

export interface ICommentThreadProps {
  comments: IComment[];
  loading: boolean;
  /** Super Admin only; see ThreadCard.canDelete. */
  canDelete: boolean;
  onAdd: (html: string) => void;
  onDelete: (commentId: number) => void;
}

export interface ICommentThreadState { draft: string; }

export class CommentThread extends React.Component<ICommentThreadProps, ICommentThreadState> {
  constructor(props: ICommentThreadProps) {
    super(props);
    this.state = { draft: '' };
  }

  private submit = (): void => {
    const text: string = this.state.draft.trim();
    if (!text) { return; }
    this.props.onAdd(`<p>${text.replace(/</g, '&lt;')}</p>`);
    this.setState({ draft: '' });
  }

  public render(): JSX.Element {
    return (
      <div className={styles.commentThread}>
        {this.props.loading && <span className={styles.commentMeta}>Loading comments…</span>}

        {this.props.comments.map((c: IComment) => (
          <div className={styles.commentItem} key={c.id}>
            <Avatar name={c.authorTitle} picUrl={c.authorPicUrl} small={true} />
            <div className={styles.commentBubble}>
              <div>
                <span className={styles.commentAuthor}>{c.authorTitle}</span>{' '}
                <span className={styles.commentMeta}>• {timeAgo(c.created)}</span>
                {this.props.canDelete &&
                  <button
                    type="button"
                    className={styles.commentDelete}
                    title="Delete this comment"
                    onClick={() => this.props.onDelete(c.id)}
                  >Delete</button>}
              </div>
              <div dangerouslySetInnerHTML={{ __html: sanitize(c.bodyHtml) }} />
            </div>
          </div>
        ))}

        <div className={styles.commentItem}>
          <div style={{ flex: 1, display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <TextField
                placeholder="Write a comment…"
                value={this.state.draft}
                onChanged={(v: string) => this.setState({ draft: v })}
              />
            </div>
            <PrimaryButton text="Send" onClick={this.submit} disabled={!this.state.draft.trim()} />
          </div>
        </div>
      </div>
    );
  }
}

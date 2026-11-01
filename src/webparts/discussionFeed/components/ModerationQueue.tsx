import * as React from 'react';
import { PrimaryButton } from 'office-ui-fabric-react/lib/Button';
import { TextField } from 'office-ui-fabric-react/lib/TextField';
import { Spinner, SpinnerSize } from 'office-ui-fabric-react/lib/Spinner';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';
import { CardHeader } from './CardHeader';
import { PostBody } from './PostBody';
import { reviewNoticeText, IReviewNoticeText } from './reviewNotice';
import { IPost, IDepartment, IModeratorRole, IReviewNotice, ModerationStatus } from '../models';

export interface IModerationQueueProps {
  role: IModeratorRole;
  posts: IPost[];
  loading: boolean;
  /** Department filter, Super Admins only. 0 = all departments. */
  departmentId: number;
  onDepartmentChange: (departmentId: number) => void;
  /** Each resolves true once the decision is saved, false when it was not. */
  onApprove: (post: IPost) => Promise<boolean>;
  onReject: (post: IPost, reason: string) => Promise<boolean>;
  onDelete: (postId: number) => Promise<void>;
  /** Decisions SharePoint refused, by post id, each shown on its card until OK. */
  notices: { [postId: number]: IReviewNotice };
  onDismissNotice: (postId: number) => void;
}

export interface IModerationQueueState {
  /** Post whose reject box is open; null when none is. */
  rejecting: IPost;
  reason: string;
  busyId: number;
}

/**
 * The review queue. Approving publishes the post; rejecting keeps it out of the
 * feed with a reason recorded against it.
 *
 * A department admin is shown only their own departments' posts. That scoping
 * is a convenience rather than a boundary -- Approve Items is a list-level
 * permission, so SharePoint does not itself distinguish one department's posts
 * from another's, and every approver here is trusted staff.
 */
export class ModerationQueue extends React.Component<IModerationQueueProps, IModerationQueueState> {
  constructor(props: IModerationQueueProps) {
    super(props);
    this.state = { rejecting: null, reason: '', busyId: null };
  }

  private approve = async (post: IPost): Promise<void> => {
    this.setState({ busyId: post.id });
    try { await this.props.onApprove(post); }
    finally { this.setState({ busyId: null }); }
  }

  private confirmReject = async (post: IPost): Promise<void> => {
    const reason: string = this.state.reason.trim();
    if (!reason) { return; }
    this.setState({ busyId: post.id });
    try {
      // Only a saved rejection closes the box; if it was refused, what they typed stays.
      if (await this.props.onReject(post, reason)) { this.setState({ rejecting: null, reason: '' }); }
    } finally {
      this.setState({ busyId: null });
    }
  }

  /**
   * OK on a refusal. A post decided elsewhere takes its card, and any reason
   * typed into it, away with it; a post that was only edited stays for review.
   */
  private dismiss = (post: IPost, held: boolean): void => {
    if (held && this.state.rejecting && this.state.rejecting.id === post.id) {
      this.setState({ rejecting: null, reason: '' });
    }
    this.props.onDismissNotice(post.id);
  }

  /**
   * The queue's posts, plus any card the moderator is in the middle of that a
   * reload has since dropped: one showing a refusal (until OK), or one with a
   * rejection reason being typed. The latter keeps their text, and its Confirm
   * then meets the version check, which explains what happened.
   */
  private shownPosts(): IPost[] {
    const ids: number[] = this.props.posts.map((p: IPost) => p.id);
    const kept: IPost[] = [];
    Object.keys(this.props.notices).forEach((k: string) => {
      const post: IPost = this.props.notices[Number(k)].post;
      if (ids.indexOf(post.id) < 0) { kept.push(post); ids.push(post.id); }
    });
    const r: IPost = this.state.rejecting;
    if (r && ids.indexOf(r.id) < 0) { kept.push(r); }
    if (kept.length === 0) { return this.props.posts; }

    // Same order as the queue query: oldest first.
    return this.props.posts.concat(kept)
      .sort((a: IPost, b: IPost) => new Date(a.created).getTime() - new Date(b.created).getTime());
  }

  private remove = async (postId: number): Promise<void> => {
    this.setState({ busyId: postId });
    try { await this.props.onDelete(postId); }
    finally { this.setState({ busyId: null }); }
  }

  private renderFilter(): JSX.Element {
    // Only a Super Admin reviews across departments, so only they get a filter.
    if (!this.props.role.isSuperAdmin || this.props.role.departments.length === 0) { return null; }

    // A native select rather than a Fabric Dropdown: Fabric paints itself white
    // and portals its option list to document.body, outside the widget, so
    // neither our styles nor the portal's theming reach it on a dark page.
    return (
      <div className={styles.modFilter}>
        <Icon iconName="Filter" />
        <select
          className={styles.select}
          value={this.props.departmentId || 0}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            // An open reject box belongs to the department being left.
            this.setState({ rejecting: null, reason: '' });
            this.props.onDepartmentChange(Number(e.target.value));
          }}
        >
          <option value={0}>All departments</option>
          {this.props.role.departments.map((d: IDepartment) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
      </div>
    );
  }

  private renderCard(p: IPost): JSX.Element {
    const notice: IReviewNotice = this.props.notices[p.id];
    // Decided elsewhere, or deleted: the card stays only so the notice can be read.
    const held: boolean = !!notice && notice.conflict.status !== ModerationStatus.Pending;
    const busy: boolean = this.state.busyId === p.id;
    const locked: boolean = busy || held;
    const rejecting: boolean = !!this.state.rejecting && this.state.rejecting.id === p.id;

    return (
      <div className={`${styles.card} ${styles.modCard}`} key={p.id}>
        <div className={styles.modBanner}>
          <Icon iconName="Clock" />
          <span>Awaiting review</span>
          {p.authorDept && <span className={styles.modDept}>• {p.authorDept}</span>}
        </div>

        <CardHeader
          name={p.authorTitle}
          dept={p.authorDept}
          picUrl={p.authorPicUrl}
          created={p.created}
          category={p.category}
        />

        <PostBody post={p} />

        <div className={styles.modActions}>
          <PrimaryButton
            className={styles.postButton}
            text={busy ? '…' : 'Approve'}
            disabled={locked}
            onClick={() => this.approve(p)}
          />
          <button
            type="button"
            className={styles.modBtn}
            disabled={locked}
            onClick={() => this.setState({ rejecting: rejecting ? null : p, reason: '' })}
          >Reject</button>
          <span className={styles.modSpacer} />
          {/* Deleting outright is a Super Admin power (requirements 13, 14); a
              department admin can only reject, which keeps the post for audit. */}
          {this.props.role.isSuperAdmin &&
            <button
              type="button"
              className={`${styles.modBtn} ${styles.modBtnDanger}`}
              title="Delete permanently"
              disabled={locked}
              onClick={() => this.remove(p.id)}
            >
              <Icon iconName="Delete" />
              <span>Delete</span>
            </button>}
        </div>

        {rejecting &&
          <div className={styles.modReject}>
            <div className={styles.modRejectInput}>
              <TextField
                placeholder="Reason for rejection (recorded against the post)"
                value={this.state.reason}
                multiline={true}
                rows={2}
                readOnly={held}
                onChanged={(v: string) => this.setState({ reason: v })}
              />
            </div>
            <PrimaryButton
              className={styles.postButton}
              text="Confirm"
              disabled={locked || !this.state.reason.trim()}
              onClick={() => this.confirmReject(p)}
            />
          </div>}

        {notice && this.renderNotice(p, notice, held)}
      </div>
    );
  }

  /** Why the decision was not saved, on the card that was clicked. */
  private renderNotice(p: IPost, n: IReviewNotice, held: boolean): JSX.Element {
    const t: IReviewNoticeText = reviewNoticeText(n);
    return (
      <div className={styles.modNotice} role="alert">
        <Icon iconName="Warning" className={styles.modNoticeIcon} />
        <div className={styles.modNoticeText}>
          <div className={styles.modNoticeTitle}>{t.title}</div>
          <div>{t.detail}</div>
          {t.reason && <div className={styles.modNoticeReason}>{`Reason: "${t.reason}"`}</div>}
        </div>
        <button
          type="button"
          className={`${styles.modBtn} ${styles.modNoticeOk}`}
          onClick={() => this.dismiss(p, held)}
        >OK</button>
      </div>
    );
  }

  public render(): JSX.Element {
    if (this.props.loading) {
      return <div style={{ padding: 24 }}><Spinner size={SpinnerSize.large} label="Loading queue…" /></div>;
    }

    const shown: IPost[] = this.shownPosts();
    return (
      <div>
        {this.renderFilter()}

        {shown.length === 0
          ? <div className={styles.modEmpty}>
              <Icon iconName="CheckMark" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
              Nothing waiting for review.
            </div>
          : shown.map((p: IPost) => this.renderCard(p))}
      </div>
    );
  }
}

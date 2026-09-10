import * as React from 'react';
import { PrimaryButton } from 'office-ui-fabric-react/lib/Button';
import { TextField } from 'office-ui-fabric-react/lib/TextField';
import { Dropdown, IDropdownOption } from 'office-ui-fabric-react/lib/Dropdown';
import { Spinner, SpinnerSize } from 'office-ui-fabric-react/lib/Spinner';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';
import { CardHeader } from './CardHeader';
import { IPost, IDepartment, IModeratorRole } from '../models';
import { sanitize } from '../services/utils';

export interface IModerationQueueProps {
  role: IModeratorRole;
  posts: IPost[];
  loading: boolean;
  /** Department filter, Super Admins only. 0 = all departments. */
  departmentId: number;
  onDepartmentChange: (departmentId: number) => void;
  onApprove: (postId: number) => Promise<void>;
  onReject: (postId: number, reason: string) => Promise<void>;
  onDelete: (postId: number) => Promise<void>;
}

export interface IModerationQueueState {
  /** Post whose reject box is open; null when none is. */
  rejectingId: number;
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
    this.state = { rejectingId: null, reason: '', busyId: null };
  }

  private approve = async (postId: number): Promise<void> => {
    this.setState({ busyId: postId });
    try { await this.props.onApprove(postId); }
    finally { this.setState({ busyId: null }); }
  }

  private confirmReject = async (postId: number): Promise<void> => {
    const reason: string = this.state.reason.trim();
    if (!reason) { return; }
    this.setState({ busyId: postId });
    try {
      await this.props.onReject(postId, reason);
      this.setState({ rejectingId: null, reason: '' });
    } finally {
      this.setState({ busyId: null });
    }
  }

  private remove = async (postId: number): Promise<void> => {
    this.setState({ busyId: postId });
    try { await this.props.onDelete(postId); }
    finally { this.setState({ busyId: null }); }
  }

  private renderFilter(): JSX.Element {
    // Only a Super Admin reviews across departments, so only they get a filter.
    if (!this.props.role.isSuperAdmin || this.props.role.departments.length === 0) { return null; }

    const options: IDropdownOption[] = [{ key: 0, text: 'All departments' }].concat(
      this.props.role.departments.map((d: IDepartment) => ({ key: d.id, text: d.title }))
    );

    return (
      <div className={styles.modFilter}>
        <Icon iconName="Filter" />
        <div style={{ minWidth: 260 }}>
          <Dropdown
            selectedKey={this.props.departmentId || 0}
            options={options}
            onChanged={(o: IDropdownOption) => this.props.onDepartmentChange(Number(o.key))}
          />
        </div>
      </div>
    );
  }

  private renderCard(p: IPost): JSX.Element {
    const busy: boolean = this.state.busyId === p.id;
    const rejecting: boolean = this.state.rejectingId === p.id;

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

        <div className={styles.body} dangerouslySetInnerHTML={{ __html: sanitize(p.bodyHtml) }} />

        <div className={styles.modActions}>
          <PrimaryButton
            className={styles.postButton}
            text={busy ? '…' : 'Approve'}
            disabled={busy}
            onClick={() => this.approve(p.id)}
          />
          <button
            type="button"
            className={styles.modBtn}
            disabled={busy}
            onClick={() => this.setState({ rejectingId: rejecting ? null : p.id, reason: '' })}
          >Reject</button>
          <span className={styles.modSpacer} />
          {/* Deleting outright is a Super Admin power (requirements 13, 14); a
              department admin can only reject, which keeps the post for audit. */}
          {this.props.role.isSuperAdmin &&
            <button
              type="button"
              className={`${styles.modBtn} ${styles.modBtnDanger}`}
              title="Delete permanently"
              disabled={busy}
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
                onChanged={(v: string) => this.setState({ reason: v })}
              />
            </div>
            <PrimaryButton
              className={styles.postButton}
              text="Confirm"
              disabled={busy || !this.state.reason.trim()}
              onClick={() => this.confirmReject(p.id)}
            />
          </div>}
      </div>
    );
  }

  public render(): JSX.Element {
    if (this.props.loading) {
      return <div style={{ padding: 24 }}><Spinner size={SpinnerSize.large} label="Loading queue…" /></div>;
    }

    return (
      <div>
        {this.renderFilter()}

        {this.props.posts.length === 0
          ? <div className={styles.modEmpty}>
              <Icon iconName="CheckMark" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
              Nothing waiting for review.
            </div>
          : this.props.posts.map((p: IPost) => this.renderCard(p))}
      </div>
    );
  }
}

import * as React from 'react';
import { Spinner, SpinnerSize } from 'office-ui-fabric-react/lib/Spinner';
import { MessageBar, MessageBarType } from 'office-ui-fabric-react/lib/MessageBar';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';
import { IDiscussionFeedProps } from './IDiscussionFeedProps';
import { PostSubmitBox } from './PostSubmitBox';
import { FeedList } from './FeedList';
import { ModerationQueue } from './ModerationQueue';
import { FeedService } from '../services/FeedService';
import { ModerationService } from '../services/ModerationService';
import { DepartmentService } from '../services/DepartmentService';
import {
  IPost, IComment, ICurrentUser, IPostDraft, IPagedPosts, IDepartment, IModeratorRole
} from '../models';

type FeedTab = 'feed' | 'queue';

export interface IDiscussionFeedState {
  loading: boolean;
  posts: IPost[];
  currentUser: ICurrentUser;
  expandedPostId: number;
  commentsByPost: { [postId: number]: IComment[] };
  commentsLoading: { [postId: number]: boolean };
  hasNext: boolean;
  loadingMore: boolean;
  error: string;
  // --- moderation ---
  tab: FeedTab;
  role: IModeratorRole;
  myDepartment: IDepartment;
  allDepartments: IDepartment[];
  pending: IPost[];
  pendingLoading: boolean;
  queueDeptId: number;
}

const NO_ROLE: IModeratorRole = { isSuperAdmin: false, departments: [], canModerate: false };

export default class DiscussionFeed extends React.Component<IDiscussionFeedProps, IDiscussionFeedState> {
  private svc: FeedService;
  private mod: ModerationService;
  private depts: DepartmentService;
  private pager: IPagedPosts = null;   // current tail of the server-side page chain

  constructor(props: IDiscussionFeedProps) {
    super(props);
    this.svc = new FeedService(props.config);
    this.mod = new ModerationService(props.config);
    this.depts = new DepartmentService(props.config);
    this.state = {
      loading: true,
      posts: [],
      currentUser: null,
      expandedPostId: null,
      commentsByPost: {},
      commentsLoading: {},
      hasNext: false,
      loadingMore: false,
      error: null,
      tab: 'feed',
      role: NO_ROLE,
      myDepartment: null,
      allDepartments: [],
      pending: [],
      pendingLoading: false,
      queueDeptId: 0
    };
  }

  public async componentDidMount(): Promise<void> {
    // Resolve the current user first and on its own — the composer and likes need it,
    // and a posts-query failure must not wipe it out.
    try {
      const currentUser = await this.svc.getCurrentUser();
      this.setState({ currentUser });
    } catch (e) {
      this.setState({ error: `Could not resolve current user: ${e.message || e}`, loading: false });
      return;
    }

    try {
      const page = await this.svc.getPostsFirstPage();
      this.pager = page;
      this.setState({ posts: page.posts, hasNext: page.hasNext, loading: false });
    } catch (e) {
      // Keep currentUser so the composer still works; just surface the feed error.
      this.setState({ error: `Failed to load posts: ${e.message || e}`, loading: false });
    }

    // Moderation context loads last and never blocks the feed: an ordinary user
    // gets no role and no queue, which is the common case.
    try {
      const role: IModeratorRole = await this.mod.getRole();
      this.setState({ role });
      if (role.canModerate) { await this.refreshQueue(role, 0); }
    } catch (e) {
      this.setState({ role: NO_ROLE });
    }

    // The composer only needs a department list when the profile lookup fails.
    try {
      const mine: IDepartment = await this.depts.resolveForCurrentUser();
      this.setState({ myDepartment: mine });
      if (!mine) {
        this.setState({ allDepartments: await this.depts.getDepartments() });
      }
    } catch (e) {
      try { this.setState({ allDepartments: await this.depts.getDepartments() }); }
      catch (e2) { /* composer will block on submit rather than misfile a post */ }
    }
  }

  private async refreshQueue(role: IModeratorRole, deptId: number): Promise<void> {
    this.setState({ pendingLoading: true });
    try {
      const pending: IPost[] = await this.mod.getPendingPosts(role, deptId || undefined);
      this.setState({ pending, pendingLoading: false });
    } catch (e) {
      this.setState({ pending: [], pendingLoading: false, error: `Could not load the review queue: ${e.message || e}` });
    }
  }

  private onLoadMore = async (): Promise<void> => {
    if (!this.pager || !this.state.hasNext || this.state.loadingMore) { return; }
    this.setState({ loadingMore: true });
    try {
      const next: IPagedPosts = await this.pager.loadNext();
      this.pager = next;
      this.setState({
        posts: this.state.posts.concat(next.posts),
        hasNext: next.hasNext,
        loadingMore: false
      });
    } catch (e) {
      this.setState({ error: 'Could not load more posts.', loadingMore: false });
    }
  }

  /**
   * The post lands as Pending, so there is deliberately no feed refresh here —
   * refetching would return the same list and read as "nothing happened". The
   * composer shows a confirmation instead. A moderator gets their queue count
   * bumped, since their own submission may be theirs to review.
   */
  private onSubmit = async (draft: IPostDraft): Promise<void> => {
    await this.svc.createPost(draft, this.props.pageUrl);
    if (this.state.role.canModerate) {
      await this.refreshQueue(this.state.role, this.state.queueDeptId);
    }
  }

  private onApprove = async (postId: number): Promise<void> => {
    try {
      await this.mod.approve(postId);
      // Drop it from the queue and pull the now-published post into the feed.
      this.setState({ pending: this.state.pending.filter((p: IPost) => p.id !== postId) });
      await this.reloadFeed();
    } catch (e) {
      this.setState({ error: `Could not approve that post: ${e.message || e}` });
    }
  }

  private onReject = async (postId: number, reason: string): Promise<void> => {
    try {
      await this.mod.reject(postId, reason);
      this.setState({ pending: this.state.pending.filter((p: IPost) => p.id !== postId) });
    } catch (e) {
      this.setState({ error: `Could not reject that post: ${e.message || e}` });
    }
  }

  private onDeletePost = async (postId: number): Promise<void> => {
    if (!window.confirm('Delete this post permanently? This cannot be undone.')) { return; }
    try {
      await this.mod.deletePost(postId);
      this.setState({
        posts: this.state.posts.filter((p: IPost) => p.id !== postId),
        pending: this.state.pending.filter((p: IPost) => p.id !== postId)
      });
    } catch (e) {
      this.setState({ error: `Could not delete that post: ${e.message || e}` });
    }
  }

  private onDeleteComment = async (postId: number, commentId: number): Promise<void> => {
    if (!window.confirm('Delete this comment permanently? This cannot be undone.')) { return; }
    try {
      await this.mod.deleteComment(commentId);
      const left: IComment[] = (this.state.commentsByPost[postId] || [])
        .filter((c: IComment) => c.id !== commentId);
      this.setState({
        commentsByPost: { ...this.state.commentsByPost, [postId]: left },
        posts: this.state.posts.map((p: IPost) =>
          p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p)
      });
    } catch (e) {
      this.setState({ error: `Could not delete that comment: ${e.message || e}` });
    }
  }

  private onQueueDepartmentChange = async (deptId: number): Promise<void> => {
    this.setState({ queueDeptId: deptId });
    await this.refreshQueue(this.state.role, deptId);
  }

  private async reloadFeed(): Promise<void> {
    const page: IPagedPosts = await this.svc.getPostsFirstPage();
    this.pager = page;
    this.setState({ posts: page.posts, hasNext: page.hasNext });
  }

  private onLike = async (postId: number): Promise<void> => {
    // optimistic toggle
    const uid: number = this.state.currentUser.id;
    this.setState({
      posts: this.state.posts.map((p: IPost) => {
        if (p.id !== postId) { return p; }
        const liked: boolean = p.likeUserIds.indexOf(uid) > -1;
        return { ...p, likeUserIds: liked ? p.likeUserIds.filter(i => i !== uid) : p.likeUserIds.concat([uid]) };
      })
    });
    try {
      const ids: number[] = await this.svc.toggleLike(postId, uid);
      this.setState({
        posts: this.state.posts.map((p: IPost) => p.id === postId ? { ...p, likeUserIds: ids } : p)
      });
    } catch (e) {
      this.setState({ error: 'Could not save your like.' });
    }
  }

  private onToggleComments = async (postId: number): Promise<void> => {
    if (this.state.expandedPostId === postId) {
      this.setState({ expandedPostId: null });
      return;
    }
    this.setState({ expandedPostId: postId });
    if (!this.state.commentsByPost[postId]) {
      this.setState({ commentsLoading: { ...this.state.commentsLoading, [postId]: true } });
      const comments: IComment[] = await this.svc.getComments(postId);
      this.setState({
        commentsByPost: { ...this.state.commentsByPost, [postId]: comments },
        commentsLoading: { ...this.state.commentsLoading, [postId]: false }
      });
    }
  }

  private onAddComment = async (postId: number, html: string): Promise<void> => {
    const comment: IComment = await this.svc.addComment(postId, html);
    this.setState({
      commentsByPost: {
        ...this.state.commentsByPost,
        [postId]: (this.state.commentsByPost[postId] || []).concat([comment])
      },
      posts: this.state.posts.map((p: IPost) =>
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)
    });
  }

  private onShare = (postId: number): void => {
    const url: string = `${this.props.pageUrl}#post=${postId}`;
    if ((navigator as any).clipboard) { (navigator as any).clipboard.writeText(url); }
    this.setState({ error: 'Link copied to clipboard.' });
  }

  public render(): JSX.Element {
    if (this.state.loading) {
      return <div className={styles.feed}><Spinner size={SpinnerSize.large} label="Loading feed…" /></div>;
    }

    // If the current user couldn't be resolved (e.g. a load error), show the error
    // instead of crashing on currentUser.id. The feed needs the user id for likes.
    if (!this.state.currentUser) {
      return (
        <div className={styles.feed}>
          <h1 className={styles.pageHeading}>Social Feed</h1>
          <MessageBar messageBarType={MessageBarType.error}>
            {this.state.error || 'Could not load the feed. Please refresh.'}
          </MessageBar>
        </div>
      );
    }

    const role: IModeratorRole = this.state.role;

    return (
      <div className={styles.feed}>
        <h1 className={styles.pageHeading}>Social Feed</h1>

        {role.canModerate && this.renderTabs()}

        {this.state.error &&
          <MessageBar
            messageBarType={MessageBarType.info}
            onDismiss={() => this.setState({ error: null })}
          >{this.state.error}</MessageBar>}

        {this.state.tab === 'queue'
          ? <ModerationQueue
              role={role}
              posts={this.state.pending}
              loading={this.state.pendingLoading}
              departmentId={this.state.queueDeptId}
              onDepartmentChange={this.onQueueDepartmentChange}
              onApprove={this.onApprove}
              onReject={this.onReject}
              onDelete={this.onDeletePost}
            />
          : <div>
              <PostSubmitBox
                currentUser={this.state.currentUser}
                config={this.props.config}
                spHttpClient={this.props.spHttpClient}
                department={this.state.myDepartment}
                departmentOptions={this.state.allDepartments}
                onSubmit={this.onSubmit}
              />

              <FeedList
                posts={this.state.posts}
                currentUserId={this.state.currentUser.id}
                expandedPostId={this.state.expandedPostId}
                commentsByPost={this.state.commentsByPost}
                commentsLoading={this.state.commentsLoading}
                hasNext={this.state.hasNext}
                loadingMore={this.state.loadingMore}
                canDelete={role.isSuperAdmin}
                onLoadMore={this.onLoadMore}
                onLike={this.onLike}
                onToggleComments={this.onToggleComments}
                onAddComment={this.onAddComment}
                onShare={this.onShare}
                onDeletePost={this.onDeletePost}
                onDeleteComment={this.onDeleteComment}
              />
            </div>}
      </div>
    );
  }

  private renderTabs(): JSX.Element {
    const count: number = this.state.pending.length;
    const tab = (key: FeedTab, label: string, icon: string, badge?: number): JSX.Element => (
      <button
        type="button"
        className={`${styles.modTab} ${this.state.tab === key ? styles.modTabActive : ''}`}
        onClick={() => this.setState({ tab: key })}
      >
        <Icon iconName={icon} />
        <span>{label}</span>
        {!!badge && <span className={styles.modTabCount}>{badge}</span>}
      </button>
    );

    return (
      <div className={styles.modTabs}>
        {tab('feed', 'Feed', 'News')}
        {tab('queue', 'Pending review', 'ClipboardList', count)}
      </div>
    );
  }
}

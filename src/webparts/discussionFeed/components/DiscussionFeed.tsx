import * as React from 'react';
import { Spinner, SpinnerSize } from 'office-ui-fabric-react/lib/Spinner';
import { MessageBar, MessageBarType } from 'office-ui-fabric-react/lib/MessageBar';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';
import { IDiscussionFeedProps } from './IDiscussionFeedProps';
import { PostSubmitBox } from './PostSubmitBox';
import { FeedList } from './FeedList';
import { ThreadCard } from './ThreadCard';
import { ModerationQueue } from './ModerationQueue';
import { IFeedKind, SOCIAL_KIND } from './feedKinds';
import { FeedService } from '../services/FeedService';
import { ModerationService } from '../services/ModerationService';
import { DepartmentService } from '../services/DepartmentService';
import { copyText, idFromHash } from '../services/utils';
import {
  IPost, IComment, ICurrentUser, IPostDraft, IPagedPosts, IDepartment, IModeratorRole, IShareResult
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
  // --- shared-post link (#post=<id>, #market=<id>) ---
  focusPostId: number;
  /** The shared post when it is not already in `posts` (e.g. older than page one). */
  focusPost: IPost;
  focusStatus: 'loading' | 'ready' | 'missing';
  // --- Market Place ---
  /** "My posts": only the current user's posts. */
  mineOnly: boolean;
  /** The list below the composer is being refetched (filter changed). */
  reloading: boolean;
  /** The feed's list does not exist on this site (not provisioned yet). */
  unavailable: boolean;
}

const NO_ROLE: IModeratorRole = { isSuperAdmin: false, departments: [], canModerate: false };

export default class DiscussionFeed extends React.Component<IDiscussionFeedProps, IDiscussionFeedState> {
  private svc: FeedService;
  private mod: ModerationService;
  private depts: DepartmentService;
  private pager: IPagedPosts = null;   // current tail of the server-side page chain
  private feedSeq: number = 0;          // drops page-one responses a newer request superseded

  constructor(props: IDiscussionFeedProps) {
    super(props);
    const kind: IFeedKind = props.kind || SOCIAL_KIND;
    this.svc = new FeedService(props.config, kind.moderated, kind.expires);
    this.mod = new ModerationService(props.config);
    this.depts = new DepartmentService(props.config);
    const sharedId: number = props.mode === 'moderation' ? null : (idFromHash(kind.hashKey) || null);
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
      // Honoured only once the role resolves; a non-moderator is put back on
      // the feed rather than left staring at an empty queue.
      tab: props.mode === 'moderation' ? 'queue' : 'feed',
      role: NO_ROLE,
      myDepartment: null,
      allDepartments: [],
      pending: [],
      pendingLoading: false,
      queueDeptId: 0,
      // Start in the single-post view when opened from a share link, so the
      // full feed never flashes up before the post loads.
      focusPostId: sharedId,
      focusPost: null,
      focusStatus: sharedId ? 'loading' : null,
      mineOnly: false,
      reloading: false,
      unavailable: false
    };
  }

  private get kind(): IFeedKind { return this.props.kind || SOCIAL_KIND; }

  public componentWillUnmount(): void {
    window.removeEventListener('hashchange', this.onHashChange);
  }

  private onHashChange = (): void => {
    const id: number = idFromHash(this.kind.hashKey);
    if (id && id !== this.state.focusPostId) { this.openSharedPost(id); }
  }

  /**
   * Show only the post named in a share link, with its comments open. It is
   * looked up by id rather than searched for in the loaded page, so a post
   * older than the first page still opens.
   */
  private async openSharedPost(id: number): Promise<void> {
    this.setState({ tab: 'feed', focusPostId: id, focusPost: null, focusStatus: 'loading' });

    const inList: IPost = this.state.posts.filter((p: IPost) => p.id === id)[0];
    const post: IPost = inList || await this.svc.getPostById(id);
    if (this.state.focusPostId !== id) { return; }   // superseded by another link

    if (!post) {
      this.setState({ focusStatus: 'missing' });
      return;
    }
    this.setState({ focusPost: inList ? null : post, focusStatus: 'ready' });
    if (this.state.expandedPostId !== id) { this.onToggleComments(id); }
  }

  private closeSharedPost = (): void => {
    this.setState({ focusPostId: null, focusPost: null, focusStatus: null });
    // Drop the hash so a reload shows the normal feed.
    if (idFromHash(this.kind.hashKey) && window.history && window.history.replaceState) {
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
  }

  /** Apply a change to a post wherever it is shown: the feed and/or the pinned card. */
  private updatePost(postId: number, change: (p: IPost) => IPost): void {
    this.setState({
      posts: this.state.posts.map((p: IPost) => p.id === postId ? change(p) : p),
      focusPost: this.state.focusPost && this.state.focusPost.id === postId
        ? change(this.state.focusPost) : this.state.focusPost
    });
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
      // A list that does not exist yet means the feed was deployed before its
      // lists were provisioned (Provision-Marketplace.ps1). Say so plainly
      // rather than offering a composer whose posts would fail to save.
      const missing: boolean = !this.kind.moderated &&
        (e.status === 404 || /does not exist/i.test(String(e.message || e)));
      if (missing) {
        this.setState({ unavailable: true, loading: false });
        return;
      }
      // Keep currentUser so the composer still works; just surface the feed error.
      this.setState({ error: `Failed to load posts: ${e.message || e}`, loading: false });
    }

    // A shared link (#post=<id>, #market=<id>): open that post now, and again
    // whenever the hash changes without a reload (a second link in the same tab).
    window.addEventListener('hashchange', this.onHashChange);
    const sharedId: number = idFromHash(this.kind.hashKey);
    if (sharedId && this.props.mode !== 'moderation') { this.openSharedPost(sharedId); }

    // The Market Place has no approvers: the only role that matters there is
    // Super Admin, who may delete anyone's post.
    if (!this.kind.moderated) {
      const isSuperAdmin: boolean = await this.mod.isSiteAdmin();
      this.setState({ role: { ...NO_ROLE, isSuperAdmin } });
      // Only shown on the card, so a failed lookup just leaves it blank.
      try { this.setState({ myDepartment: await this.depts.resolveForCurrentUser() }); } catch (e) { /* optional */ }
      return;
    }

    // Moderation context loads last and never blocks the feed: an ordinary user
    // gets no role and no queue, which is the common case.
    try {
      const role: IModeratorRole = await this.mod.getRole();
      this.setState({ role, tab: role.canModerate ? this.state.tab : 'feed' });
      if (role.canModerate) { await this.refreshQueue(role, 0); }
    } catch (e) {
      this.setState({ role: NO_ROLE, tab: 'feed' });
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
   * In Social Corner the post lands as Pending, so there is deliberately no
   * feed refresh here — refetching would return the same list and read as
   * "nothing happened". The composer shows a confirmation instead. A moderator
   * gets their queue count bumped, since their own submission may be theirs to
   * review.
   *
   * A Market Place post is live at once, so it goes straight to the top of
   * the feed -- under "My posts" too, since it is the author's own.
   */
  private onSubmit = async (draft: IPostDraft): Promise<void> => {
    const kind: IFeedKind = this.kind;
    const newId: number = await this.svc.createPost(
      draft, (id: number) => `${this.props.pageUrl}#${kind.hashKey}=${id}`, kind.mail);

    if (!kind.moderated) {
      try {
        const post: IPost = await this.svc.getPostById(newId);
        if (post) { this.setState({ posts: [post].concat(this.state.posts) }); }
        else { await this.reloadFeed(); }
      } catch (e) {
        // Saved regardless; the next load shows it.
      }
      return;
    }
    if (this.state.role.canModerate) {
      await this.refreshQueue(this.state.role, this.state.queueDeptId);
    }
  }

  /** Delete is offered to Super Admins everywhere, and to authors in the Market Place. */
  private canDeletePost = (p: IPost): boolean =>
    this.state.role.isSuperAdmin || (this.kind.authorsDelete && p.authorId === this.state.currentUser.id)

  private canDeleteComment = (c: IComment): boolean =>
    this.state.role.isSuperAdmin || (this.kind.authorsDelete && c.authorId === this.state.currentUser.id)

  /** All posts / My posts. Refetches page one, since paging runs server-side. */
  private setMineOnly = async (mineOnly: boolean): Promise<void> => {
    if (mineOnly === this.state.mineOnly) { return; }
    this.setState({ mineOnly, reloading: true });
    try {
      await this.reloadFeed(mineOnly);
    } catch (e) {
      this.setState({ error: `Could not load posts: ${e.message || e}` });
    }
    // A quicker second click owns the spinner now; leave it to clear it.
    if (this.state.mineOnly === mineOnly) { this.setState({ reloading: false }); }
  }

  private onApprove = async (postId: number): Promise<void> => {
    try {
      await this.mod.approve(postId, this.state.currentUser.id);
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
      if (this.state.focusPostId === postId) { this.closeSharedPost(); }
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
      this.setState({ commentsByPost: { ...this.state.commentsByPost, [postId]: left } });
      this.updatePost(postId, (p: IPost) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
    } catch (e) {
      this.setState({ error: `Could not delete that comment: ${e.message || e}` });
    }
  }

  private onQueueDepartmentChange = async (deptId: number): Promise<void> => {
    this.setState({ queueDeptId: deptId });
    await this.refreshQueue(this.state.role, deptId);
  }

  private async reloadFeed(mineOnly: boolean = this.state.mineOnly): Promise<void> {
    const seq: number = ++this.feedSeq;
    const page: IPagedPosts = await this.svc.getPostsFirstPage(mineOnly ? this.state.currentUser.id : undefined);
    if (seq !== this.feedSeq) { return; }   // the filter changed again meanwhile
    this.pager = page;
    this.setState({ posts: page.posts, hasNext: page.hasNext });
  }

  private onLike = async (postId: number): Promise<void> => {
    // optimistic toggle
    const uid: number = this.state.currentUser.id;
    this.updatePost(postId, (p: IPost) => {
      const liked: boolean = p.likeUserIds.indexOf(uid) > -1;
      return { ...p, likeUserIds: liked ? p.likeUserIds.filter(i => i !== uid) : p.likeUserIds.concat([uid]) };
    });
    try {
      const ids: number[] = await this.svc.toggleLike(postId, uid);
      this.updatePost(postId, (p: IPost) => ({ ...p, likeUserIds: ids }));
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
      }
    });
    this.updatePost(postId, (p: IPost) => ({ ...p, commentCount: p.commentCount + 1 }));
  }

  /**
   * Copies the post's link and reports the outcome back to the card that was
   * clicked, which shows the confirmation in place -- not in the banner at the
   * top of the widget, which may be scrolled far out of view.
   */
  private onShare = (postId: number): Promise<IShareResult> => {
    const url: string = `${this.props.pageUrl}#${this.kind.hashKey}=${postId}`;
    return copyText(url).then((copied: boolean) => ({ copied, url }));
  }

  public render(): JSX.Element {
    // The Social Corner / Market Place switch, when this feed sits under one.
    const topBar: JSX.Element = this.props.topBar || null;

    if (this.state.loading) {
      return <div className={styles.feed}>{topBar}<Spinner size={SpinnerSize.large} label="Loading feed…" /></div>;
    }

    // If the current user couldn't be resolved (e.g. a load error), show the error
    // instead of crashing on currentUser.id. The feed needs the user id for likes.
    if (!this.state.currentUser) {
      return (
        <div className={styles.feed}>
          <h1 className={styles.pageHeading}>Social Feed</h1>
          {topBar}
          <MessageBar messageBarType={MessageBarType.error}>
            {this.state.error || 'Could not load the feed. Please refresh.'}
          </MessageBar>
        </div>
      );
    }

    if (this.state.unavailable) {
      return (
        <div className={styles.feed}>
          {topBar}
          <div className={styles.emptyNote}>
            The {this.kind.label} isn't set up on this site yet. Please try again later.
          </div>
        </div>
      );
    }

    const role: IModeratorRole = this.state.role;
    const queueOnly: boolean = this.props.mode === 'moderation' && role.canModerate;

    if (this.props.mode === 'moderation' && !role.canModerate) {
      return (
        <div className={styles.feed}>
          <h1 className={styles.pageHeading}>Pending review</h1>
          <div className={styles.modEmpty}>You do not have permission to review posts.</div>
        </div>
      );
    }

    // A share link shows that one post and nothing else: no composer, no
    // review tabs, no feed. "Show all posts" leaves this view.
    if (this.state.focusStatus && !queueOnly) {
      return (
        <div className={styles.feed}>
          <h1 className={styles.pageHeading}>Social Feed</h1>
          {topBar}
          {this.state.error &&
            <MessageBar
              messageBarType={MessageBarType.info}
              onDismiss={() => this.setState({ error: null })}
            >{this.state.error}</MessageBar>}
          {this.renderSharedPost()}
        </div>
      );
    }

    return (
      <div className={styles.feed}>
        <h1 className={styles.pageHeading}>{queueOnly ? 'Pending review' : 'Social Feed'}</h1>

        {!queueOnly && topBar}

        {role.canModerate && !queueOnly && this.renderTabs()}

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
                categories={this.kind.categories}
                prompt={this.kind.prompt}
                reviewed={this.kind.moderated}
              />

              {this.kind.mineFilter && this.renderMineFilter()}

              {this.state.reloading
                ? <div style={{ textAlign: 'center', padding: 24 }}><Spinner size={SpinnerSize.medium} /></div>
                : <FeedList
                posts={this.state.posts}
                currentUserId={this.state.currentUser.id}
                expandedPostId={this.state.expandedPostId}
                commentsByPost={this.state.commentsByPost}
                commentsLoading={this.state.commentsLoading}
                hasNext={this.state.hasNext}
                loadingMore={this.state.loadingMore}
                canDeletePost={this.canDeletePost}
                canDeleteComment={this.canDeleteComment}
                categories={this.kind.categories}
                idPrefix={this.kind.cardIdPrefix}
                emptyText={this.kind.mineFilter
                  ? (this.state.mineOnly
                      ? `You haven't posted anything in the ${this.kind.label} yet.`
                      : `Nothing in the ${this.kind.label} yet. Be the first to post.`)
                  : undefined}
                onLoadMore={this.onLoadMore}
                onLike={this.onLike}
                onToggleComments={this.onToggleComments}
                onAddComment={this.onAddComment}
                onShare={this.onShare}
                onDeletePost={this.onDeletePost}
                onDeleteComment={this.onDeleteComment}
              />}
            </div>}
      </div>
    );
  }

  /** All posts / My posts (Market Place). Plain buttons: the portal hides Fabric's DefaultButton on the home page. */
  private renderMineFilter(): JSX.Element {
    const chip = (mine: boolean, label: string, icon?: string): JSX.Element => (
      <button
        type="button"
        className={`${styles.mineChip} ${this.state.mineOnly === mine ? styles.mineChipActive : ''}`}
        aria-pressed={this.state.mineOnly === mine}
        onClick={() => this.setMineOnly(mine)}
      >
        {icon && <Icon iconName={icon} />}
        <span>{label}</span>
      </button>
    );
    return (
      <div className={styles.mineFilter} role="group" aria-label="Show">
        {chip(false, 'All posts')}
        {chip(true, 'My posts', 'Contact')}
      </div>
    );
  }

  /** The post a share link pointed at, shown on its own. */
  private renderSharedPost(): JSX.Element {
    const s = this.state;
    if (!s.focusStatus) { return null; }

    if (s.focusStatus === 'loading') {
      return <div className={styles.sharedNote}><Spinner size={SpinnerSize.small} /><span>Opening shared post…</span></div>;
    }

    if (s.focusStatus === 'missing') {
      return (
        <div className={styles.sharedNote} role="status">
          <Icon iconName="Info" />
          <span className={styles.sharedNoteText}>
            {this.kind.moderated
              ? "This post isn't available. It may have been removed or expired, or it may still be waiting for approval."
              : "This post isn't available. It may have been removed."}
          </span>
          <button type="button" className={styles.sharedClose} onClick={this.closeSharedPost}>Show all posts</button>
        </div>
      );
    }

    const post: IPost = s.focusPost || s.posts.filter((p: IPost) => p.id === s.focusPostId)[0];
    if (!post) { return null; }

    return (
      <div className={styles.sharedWrap}>
        <div className={styles.sharedHead}>
          <span className={styles.sharedLabel}><Icon iconName="Link" /><span>Shared post</span></span>
          <button type="button" className={styles.sharedClose} onClick={this.closeSharedPost}>Show all posts</button>
        </div>
        <ThreadCard
          post={post}
          highlight={true}
          currentUserId={s.currentUser.id}
          expanded={s.expandedPostId === post.id}
          commentsLoading={!!s.commentsLoading[post.id]}
          comments={s.commentsByPost[post.id] || []}
          canDelete={this.canDeletePost(post)}
          canDeleteComment={this.canDeleteComment}
          categories={this.kind.categories}
          idPrefix={this.kind.cardIdPrefix}
          onLike={this.onLike}
          onToggleComments={this.onToggleComments}
          onAddComment={this.onAddComment}
          onShare={this.onShare}
          onDeletePost={this.onDeletePost}
          onDeleteComment={this.onDeleteComment}
        />
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

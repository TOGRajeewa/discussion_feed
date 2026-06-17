import * as React from 'react';
import { Spinner, SpinnerSize } from 'office-ui-fabric-react/lib/Spinner';
import { MessageBar, MessageBarType } from 'office-ui-fabric-react/lib/MessageBar';
import styles from './DiscussionFeed.module.scss';
import { IDiscussionFeedProps } from './IDiscussionFeedProps';
import { PostSubmitBox } from './PostSubmitBox';
import { FeedList } from './FeedList';
import { FeedService } from '../services/FeedService';
import { IPost, IComment, ICurrentUser, IPostDraft, IPagedPosts } from '../models';

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
}

export default class DiscussionFeed extends React.Component<IDiscussionFeedProps, IDiscussionFeedState> {
  private svc: FeedService;
  private pager: IPagedPosts = null;   // current tail of the server-side page chain

  constructor(props: IDiscussionFeedProps) {
    super(props);
    this.svc = new FeedService(props.config);
    this.state = {
      loading: true,
      posts: [],
      currentUser: null,
      expandedPostId: null,
      commentsByPost: {},
      commentsLoading: {},
      hasNext: false,
      loadingMore: false,
      error: null
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

  private onSubmit = async (draft: IPostDraft): Promise<void> => {
    await this.svc.createPost(draft, this.props.pageUrl);
    const page: IPagedPosts = await this.svc.getPostsFirstPage();   // reset to newest page
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

    return (
      <div className={styles.feed}>
        <h1 className={styles.pageHeading}>Social Feed</h1>

        {this.state.error &&
          <MessageBar
            messageBarType={MessageBarType.info}
            onDismiss={() => this.setState({ error: null })}
          >{this.state.error}</MessageBar>}

        <PostSubmitBox
          currentUser={this.state.currentUser}
          config={this.props.config}
          spHttpClient={this.props.spHttpClient}
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
          onLoadMore={this.onLoadMore}
          onLike={this.onLike}
          onToggleComments={this.onToggleComments}
          onAddComment={this.onAddComment}
          onShare={this.onShare}
        />
      </div>
    );
  }
}

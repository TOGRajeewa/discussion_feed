import { sp } from '@pnp/sp';
import {
  IFeedConfig, IPost, IComment, IPostDraft, ICurrentUser, IPagedPosts, ModerationStatus
} from '../models';
import { stripHtml, localPhotoUrl, repairEmoji, mentionsFrom } from './utils';
import { notifyMentions } from './MailService';

/**
 * Build an OData filter matching any of `ids` on `field`. SharePoint on-prem
 * has no `in` operator, so this expands to a chain of `or` clauses.
 */
function anyOf(field: string, ids: number[]): string {
  return ids.map((id: number) => `${field} eq ${id}`).join(' or ');
}

/**
 * Unwrap an expanded multi-value column. With the odata=verbose header an
 * expanded collection (e.g. Likes) comes back as { results: [...] }, not a
 * bare array — so callers must not assume `.map` exists on it directly.
 */
function toArray(v: any): any[] {
  if (!v) { return []; }
  if (Array.isArray(v)) { return v; }
  if (v.results && Array.isArray(v.results)) { return v.results; }
  return [];
}

export class FeedService {
  constructor(private cfg: IFeedConfig) { }

  /** Current user for the submit-box Persona. */
  public async getCurrentUser(): Promise<ICurrentUser> {
    const u = await sp.web.currentUser.get();
    return {
      id: u.Id,
      title: u.Title,
      email: u.Email,
      loginName: u.LoginName,
      picUrl: localPhotoUrl(this.cfg.webUrl, u.Email, 'M')
    };
  }

  /**
   * Load the first page of the feed (newest first) with likes + author in one
   * round-trip. Returns a pager so the UI can "Load more" via server-side
   * skip-tokens (getPaged) — correct for large lists where $skip is unreliable.
   */
  public async getPostsFirstPage(): Promise<IPagedPosts> {
    const page: any = await sp.web.lists.getByTitle(this.cfg.postsListTitle).items
      .select(
        'Id', 'Title', 'Body', 'Category', 'Created', 'Department', 'DepartmentId',
        'Author/Title', 'Author/EMail',
        'MentionedUsers/Title', 'MentionedUsers/Name', 'MentionedUsers/EMail'
      )
      .expand('Author', 'MentionedUsers')
      // Belt and braces: SharePoint already trims unapproved items out of the
      // response for anyone without Approve Items, but an approver browsing the
      // ordinary feed would otherwise see pending posts mixed in with live ones.
      .filter(`OData__ModerationStatus eq ${ModerationStatus.Approved}`)
      .orderBy('Created', false)
      .top(this.cfg.pageSize)
      .getPaged();

    return this.wrapPage(page);
  }

  /**
   * One post, for a shared "#post=<id>" link. Returns null when the post does
   * not exist, cannot be read, or is not approved -- SharePoint already hides
   * unapproved posts from non-approvers, and an approver following a share
   * link should not see a pending post presented as if it were published.
   */
  public async getPostById(id: number): Promise<IPost> {
    let it: any;
    try {
      it = await sp.web.lists.getByTitle(this.cfg.postsListTitle).items.getById(id)
        .select(
          'Id', 'Title', 'Body', 'Category', 'Created', 'Department', 'DepartmentId',
          'OData__ModerationStatus', 'Author/Title', 'Author/EMail',
          'MentionedUsers/Title', 'MentionedUsers/Name', 'MentionedUsers/EMail'
        )
        .expand('Author', 'MentionedUsers')
        .get();
    } catch (e) {
      return null;   // 404 (deleted) or access denied (not approved, not an approver)
    }
    if (!it || it.OData__ModerationStatus !== ModerationStatus.Approved) { return null; }
    const post: IPost = this.mapPost(it);
    await this.attachEngagement([post]);
    return post;
  }

  private async wrapPage(page: any): Promise<IPagedPosts> {
    const posts: IPost[] = (page.results || []).map((it: any) => this.mapPost(it));
    await this.attachEngagement(posts);
    return {
      posts,
      hasNext: !!page.hasNext,
      loadNext: page.hasNext
        ? async () => this.wrapPage(await page.getNext())
        : async () => ({ posts: [], hasNext: false, loadNext: null })
    };
  }

  /**
   * Fill in likes and comment counts for a page of posts, two queries for the
   * whole page rather than two per post.
   *
   * Both now live outside the post item. That is a requirement of content
   * approval, not a preference: SharePoint returns an item to Pending whenever
   * someone without Approve Items writes to it, so storing a like on the post
   * would unpublish the post the moment anybody liked it.
   */
  private async attachEngagement(posts: IPost[]): Promise<void> {
    if (posts.length === 0) { return; }
    const ids: number[] = posts.map((p: IPost) => p.id);

    const [likeRows, commentRows] = await Promise.all([
      sp.web.lists.getByTitle(this.cfg.likesListTitle).items
        .select('PostId', 'LikedBy/Id', 'Author/Id')
        .expand('LikedBy', 'Author')
        .filter(anyOf('PostId', ids))
        .top(4000)
        .get()
        .catch(() => [] as any[]),
      sp.web.lists.getByTitle(this.cfg.commentsListTitle).items
        .select('PostLookupId')
        .filter(anyOf('PostLookupId', ids))
        .top(4000)
        .get()
        .catch(() => [] as any[])
    ]);

    const likesByPost: { [id: number]: number[] } = {};
    (likeRows as any[]).forEach((r: any) => {
      // The widget never writes LikedBy, so Author is the liker. LikedBy is
      // only set on rows the one-off migration created on someone's behalf.
      const uid: number = (r.LikedBy && r.LikedBy.Id) || (r.Author && r.Author.Id) || 0;
      if (!uid) { return; }
      (likesByPost[r.PostId] = likesByPost[r.PostId] || []).push(uid);
    });

    const countByPost: { [id: number]: number } = {};
    (commentRows as any[]).forEach((r: any) => {
      countByPost[r.PostLookupId] = (countByPost[r.PostLookupId] || 0) + 1;
    });

    posts.forEach((p: IPost) => {
      p.likeUserIds = likesByPost[p.id] || [];
      p.commentCount = countByPost[p.id] || 0;
    });
  }

  private mapPost(it: any): IPost {
    return {
      id: it.Id,
      title: it.Title,
      bodyHtml: repairEmoji(it.Body || '', this.cfg.emojiBaseUrl),
      category: (it.Category || 'Discussion'),
      authorTitle: it.Author ? it.Author.Title : 'Unknown',
      authorDept: it.Department || '',
      authorDeptId: it.DepartmentId || 0,
      authorEmail: it.Author ? it.Author.EMail : '',
      authorPicUrl: it.Author ? localPhotoUrl(this.cfg.webUrl, it.Author.EMail, 'M') : '',
      created: it.Created,
      likeUserIds: [],        // filled in by attachEngagement
      commentCount: 0,
      status: ModerationStatus.Approved,
      moderationNote: '',
      mentions: mentionsFrom(it.MentionedUsers)
    };
  }

  /**
   * Submit a rich-text post for review. The item is created as Pending by
   * SharePoint's content approval — the author has no way to publish it
   * directly (requirements 1 and 5) — so this returns the id of something that
   * is not yet, and may never be, visible to anyone else.
   */
  public async createPost(draft: IPostDraft, postUrlBase: string): Promise<number> {
    const snippet: string = stripHtml(draft.html).substring(0, 80) || 'Discussion';

    const mentionIds: number[] = [];
    for (let i = 0; i < draft.mentions.length; i++) {
      const ensured = await sp.web.ensureUser(draft.mentions[i].loginName);
      mentionIds.push(ensured.data.Id);
    }

    const payload: any = {
      Title: snippet,
      Body: draft.html,                                  // Enhanced Rich Text column
      Category: draft.category,
      MentionedUsersId: { results: mentionIds }          // people multi -> {results:[]}
    };
    // Stamped now rather than looked up at review time, so that a later change
    // to the author's profile cannot move a post between queues mid-review.
    if (draft.department) {
      payload.Department = draft.department.title;
      payload.DepartmentId = draft.department.id;
    }

    const add = await sp.web.lists.getByTitle(this.cfg.postsListTitle).items.add(payload);

    const newId: number = add.data.Id;
    // Mentions are notified on submission, as before. Whether the post is ever
    // approved is a separate question the recipient will discover by following
    // the link -- an unapproved post is not readable by them.
    await notifyMentions(draft.mentions, newId, snippet, `${postUrlBase}#post=${newId}`);
    return newId;
  }

  /**
   * Toggle the current user's like by adding or removing a row in the likes
   * list. Deliberately does NOT touch the post item: that would reset its
   * approval status and pull an approved post out of the feed.
   *
   * Also fixes a lost update in the previous implementation, which read the
   * whole roster and wrote it back — two people liking at once would drop one
   * of the likes.
   */
  public async toggleLike(postId: number, userId: number): Promise<number[]> {
    const list = sp.web.lists.getByTitle(this.cfg.likesListTitle);

    const mine: any[] = await list.items
      .select('Id')
      .filter(`PostId eq ${postId} and AuthorId eq ${userId}`)
      .top(10)
      .get();

    if (mine.length > 0) {
      for (let i = 0; i < mine.length; i++) {
        await list.items.getById(mine[i].Id).delete();
      }
    } else {
      await list.items.add({ Title: `Post ${postId}`, PostId: postId });
    }

    return this.getLikeUserIds(postId);
  }

  private async getLikeUserIds(postId: number): Promise<number[]> {
    const rows: any[] = await sp.web.lists.getByTitle(this.cfg.likesListTitle).items
      .select('LikedBy/Id', 'Author/Id')
      .expand('LikedBy', 'Author')
      .filter(`PostId eq ${postId}`)
      .top(4000)
      .get();
    return rows
      .map((r: any) => (r.LikedBy && r.LikedBy.Id) || (r.Author && r.Author.Id) || 0)
      .filter((id: number) => !!id);
  }

  /** Lazy-load a thread's comments when a card is expanded. */
  public async getComments(postId: number): Promise<IComment[]> {
    const items: any[] = await sp.web.lists.getByTitle(this.cfg.commentsListTitle).items
      .select('Id', 'Body', 'Created', 'Author/Title', 'Author/EMail')
      .expand('Author')
      .filter(`PostLookupId eq ${postId}`)
      .orderBy('Created', true)
      .get();

    return items.map((it: any) => ({
      id: it.Id,
      bodyHtml: it.Body || '',
      authorTitle: it.Author ? it.Author.Title : 'Unknown',
      authorEmail: it.Author ? it.Author.EMail : '',
      authorPicUrl: it.Author ? localPhotoUrl(this.cfg.webUrl, it.Author.EMail, 'S') : '',
      created: it.Created
    }));
  }

  /**
   * Add a comment. The denormalized CommentCount bump this used to do has been
   * removed: it was a write to the post item by an ordinary user, which under
   * content approval would send the post back to Pending and make it vanish
   * from the feed. Counts are derived in attachEngagement instead.
   */
  public async addComment(postId: number, html: string): Promise<IComment> {
    const add = await sp.web.lists.getByTitle(this.cfg.commentsListTitle).items.add({
      Title: stripHtml(html).substring(0, 60),
      Body: html,
      PostLookupId: postId
    });

    const created: any = await add.item.select('Id', 'Created', 'Author/Title', 'Author/EMail')
      .expand('Author').get();
    return {
      id: created.Id,
      bodyHtml: html,
      authorTitle: created.Author ? created.Author.Title : 'You',
      authorEmail: created.Author ? created.Author.EMail : '',
      authorPicUrl: created.Author ? localPhotoUrl(this.cfg.webUrl, created.Author.EMail, 'S') : '',
      created: created.Created
    };
  }
}

import { sp } from '@pnp/sp';
import { IFeedConfig, IPost, IComment, IPostDraft, ICurrentUser, IPagedPosts } from '../models';
import { stripHtml, localPhotoUrl } from './utils';
import { notifyMentions } from './MailService';

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
        'Id', 'Title', 'Body', 'Category', 'Created', 'CommentCount',
        'Author/Title', 'Author/EMail', 'Author/JobTitle', 'Likes/Id'
      )
      .expand('Author', 'Likes')
      .orderBy('Created', false)
      .top(this.cfg.pageSize)
      .getPaged();

    return this.wrapPage(page);
  }

  private wrapPage(page: any): IPagedPosts {
    return {
      posts: (page.results || []).map((it: any) => this.mapPost(it)),
      hasNext: !!page.hasNext,
      loadNext: page.hasNext
        ? async () => this.wrapPage(await page.getNext())
        : async () => ({ posts: [], hasNext: false, loadNext: null })
    };
  }

  private mapPost(it: any): IPost {
    return {
      id: it.Id,
      title: it.Title,
      bodyHtml: it.Body || '',
      category: (it.Category || 'Discussion'),
      authorTitle: it.Author ? it.Author.Title : 'Unknown',
      authorDept: (it.Author && it.Author.JobTitle) || '',
      authorEmail: it.Author ? it.Author.EMail : '',
      authorPicUrl: it.Author ? localPhotoUrl(this.cfg.webUrl, it.Author.EMail, 'M') : '',
      created: it.Created,
      likeUserIds: (it.Likes || []).map((l: any) => l.Id),
      commentCount: it.CommentCount || 0
    };
  }

  /**
   * Save a rich-text post, resolve mentions to SP user ids, fire the email.
   * Returns the new post id.
   */
  public async createPost(draft: IPostDraft, postUrlBase: string): Promise<number> {
    const snippet: string = stripHtml(draft.html).substring(0, 80) || 'Discussion';

    const mentionIds: number[] = [];
    for (let i = 0; i < draft.mentions.length; i++) {
      const ensured = await sp.web.ensureUser(draft.mentions[i].loginName);
      mentionIds.push(ensured.data.Id);
    }

    const add = await sp.web.lists.getByTitle(this.cfg.postsListTitle).items.add({
      Title: snippet,
      Body: draft.html,                                  // Enhanced Rich Text column
      Category: draft.category,
      MentionedUsersId: { results: mentionIds },         // people multi -> {results:[]}
      CommentCount: 0
    });

    const newId: number = add.data.Id;
    await notifyMentions(draft.mentions, newId, snippet, `${postUrlBase}#post=${newId}`);
    return newId;
  }

  /** Toggle the current user's like; returns the updated id roster for the UI. */
  public async toggleLike(postId: number, userId: number): Promise<number[]> {
    const item = sp.web.lists.getByTitle(this.cfg.postsListTitle).items.getById(postId);
    const cur: any = await item.select('Likes/Id').expand('Likes').get();
    const ids: number[] = (cur.Likes || []).map((u: any) => u.Id);
    const next: number[] = ids.indexOf(userId) > -1
      ? ids.filter((i: number) => i !== userId)
      : ids.concat([userId]);
    await item.update({ LikesId: { results: next } });
    return next;
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

  /** Add a comment + bump the denormalized counter. */
  public async addComment(postId: number, html: string): Promise<IComment> {
    const add = await sp.web.lists.getByTitle(this.cfg.commentsListTitle).items.add({
      Title: stripHtml(html).substring(0, 60),
      Body: html,
      PostLookupId: postId
    });

    const post = sp.web.lists.getByTitle(this.cfg.postsListTitle).items.getById(postId);
    const c: any = await post.select('CommentCount').get();
    await post.update({ CommentCount: (c.CommentCount || 0) + 1 });

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

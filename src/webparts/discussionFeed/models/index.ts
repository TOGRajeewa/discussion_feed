export type PostCategory = 'Discussion' | 'Praise' | 'Question';

export interface IMentionUser {
  loginName: string;   // i:0#.w|domain\user
  title: string;
  email: string;
}

export interface ICurrentUser {
  id: number;
  title: string;
  email: string;
  loginName: string;
  picUrl: string;
}

export interface IPost {
  id: number;
  title: string;
  bodyHtml: string;
  category: PostCategory;
  authorTitle: string;
  authorDept: string;
  authorEmail: string;
  authorPicUrl: string;
  created: string;          // ISO
  likeUserIds: number[];
  commentCount: number;
  comments?: IComment[];
}

export interface IComment {
  id: number;
  bodyHtml: string;
  authorTitle: string;
  authorEmail: string;
  authorPicUrl: string;
  created: string;
}

export interface IPostDraft {
  html: string;
  category: PostCategory;
  mentions: IMentionUser[];
}

/** Web part property-pane config, surfaced to every service. */
export interface IFeedConfig {
  webUrl: string;
  postsListTitle: string;     // e.g. "DiscussionPosts"
  commentsListTitle: string;  // e.g. "DiscussionComments"
  assetLibraryServerRelUrl: string; // e.g. "/sites/Intranet/FeedImages"
  tinymceSkinUrl: string;           // e.g. "/sites/Intranet/SiteAssets/tinymce/skins/lightgray"
  pageSize: number;
}

export interface IPagedPosts {
  posts: IPost[];
  hasNext: boolean;
  loadNext: () => Promise<IPagedPosts>;
}

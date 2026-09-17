export type PostCategory = 'Discussion' | 'Praise' | 'Question';

/**
 * SharePoint's built-in _ModerationStatus values. Only Approved (0) is ever
 * rendered in the feed; the other states are security-trimmed away for anyone
 * without the Approve Items permission, so a non-approver never receives them.
 */
export enum ModerationStatus {
  Approved = 0,
  Rejected = 1,
  Pending = 2,
  Draft = 3
}

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
  /** Department the post was filed under, stamped at submission time. */
  authorDept: string;
  authorDeptId: number;
  authorEmail: string;
  authorPicUrl: string;
  created: string;          // ISO
  likeUserIds: number[];
  commentCount: number;
  comments?: IComment[];
  /** Only ever non-Approved on items fetched through the moderation queue. */
  status: ModerationStatus;
  /** _ModerationComments — the reason captured when a post is rejected. */
  moderationNote: string;
}

/** A department, as listed in the Departments list. */
export interface IDepartment {
  id: number;
  title: string;
}

/**
 * What the signed-in user is allowed to do. Derived from the user's Site
 * Collection Administrator flag (Super Admin) and "Dept Admins - …" group
 * membership, so it mirrors what the server will actually permit — the UI uses
 * it to decide what to render, never as the enforcement itself.
 */
export interface IModeratorRole {
  isSuperAdmin: boolean;
  /** Departments this user is an admin for; empty for an ordinary user. */
  departments: IDepartment[];
  /** True for a Super Admin or any department admin. */
  canModerate: boolean;
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
  /**
   * Department to file the post under. Normally resolved from the author's
   * User Profile; the composer only asks when that lookup comes back empty or
   * fails to match a Departments row, so a post is never left unroutable.
   */
  department?: IDepartment;
}

/** Web part property-pane config, surfaced to every service. */
export interface IFeedConfig {
  webUrl: string;
  postsListTitle: string;     // e.g. "DiscussionPosts"
  commentsListTitle: string;  // e.g. "DiscussionComments"
  likesListTitle: string;     // e.g. "DiscussionLikes"
  departmentsListTitle: string; // e.g. "Departments"
  assetLibraryServerRelUrl: string; // e.g. "/sites/Intranet/FeedImages"
  tinymceSkinUrl: string;           // e.g. "/sites/Intranet/SiteAssets/tinymce/skins/lightgray"
  emojiBaseUrl: string;             // e.g. "/sites/Intranet/SiteAssets/emoji/" (trailing slash)
  pageSize: number;
}

export interface IPagedPosts {
  posts: IPost[];
  hasNext: boolean;
  loadNext: () => Promise<IPagedPosts>;
}

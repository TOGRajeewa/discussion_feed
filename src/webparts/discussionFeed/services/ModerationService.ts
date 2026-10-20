import { sp } from '@pnp/sp';
import { IFeedConfig, IDepartment, IModeratorRole, IPost, ModerationStatus } from '../models';
import { repairEmoji, mentionsFrom } from './utils';

/**
 * Departments already carry a per-department SharePoint group named with this
 * prefix (e.g. "Dept Admins - Currency"), and Provision-Moderation.ps1 grants
 * each of them the Feed Approve permission level on DiscussionPosts. Group
 * membership is therefore the same thing the server checks, not a parallel
 * notion of "admin" that could drift away from the real permissions.
 */
const DEPT_ADMIN_GROUP_PREFIX = 'Dept Admins - ';

/**
 * Resolves what the signed-in user may moderate, and drives approve/reject.
 *
 * Everything here is advisory: it decides what the UI offers. The refusal that
 * matters comes from SharePoint, which trims unapproved items out of query
 * results and rejects an unauthorised approve or delete outright.
 */
export class ModerationService {
  private roleCache: IModeratorRole = null;

  constructor(private cfg: IFeedConfig) { }

  /**
   * Super Admin = a Site Collection Administrator (requirements 3, 13, 14).
   *
   * SharePoint exempts site collection administrators from list permissions,
   * so they can already delete and approve anything; keying the role off the
   * same flag keeps the Delete buttons in step with what the server allows.
   * Provision-Moderation.ps1 correspondingly gives nobody else Delete Items on
   * the feed lists.
   */
  public async getRole(): Promise<IModeratorRole> {
    if (this.roleCache) { return this.roleCache; }

    const isSuperAdmin: boolean = await this.isSiteAdmin();

    let groupTitles: string[] = [];
    try {
      const groups: any[] = await sp.web.currentUser.groups.select('Id', 'Title').get();
      groupTitles = (groups || []).map((g: any) => g.Title || '');
    } catch (e) {
      // A user with no group memberships at all can 404 here on-prem; that is
      // an ordinary user, not an error worth surfacing.
      groupTitles = [];
    }

    // A Super Admin reviews across the whole platform, so they get every
    // department; a department admin gets only the ones they administer.
    const adminDeptNames: string[] = groupTitles
      .filter((t: string) => t.indexOf(DEPT_ADMIN_GROUP_PREFIX) === 0)
      .map((t: string) => t.substring(DEPT_ADMIN_GROUP_PREFIX.length));

    let departments: IDepartment[] = [];
    if (isSuperAdmin) {
      departments = await this.getAllDepartments();
    } else if (adminDeptNames.length > 0) {
      const all: IDepartment[] = await this.getAllDepartments();
      departments = all.filter((d: IDepartment) => adminDeptNames.indexOf(d.title) > -1);
    }

    this.roleCache = {
      isSuperAdmin,
      departments,
      canModerate: isSuperAdmin || departments.length > 0
    };
    return this.roleCache;
  }

  /**
   * Is the signed-in user a Site Collection Administrator (a Super Admin)?
   * All the Market Place needs: it has no approvers, only authors and Super
   * Admins who may delete.
   */
  public async isSiteAdmin(): Promise<boolean> {
    try {
      const me: any = await sp.web.currentUser.select('IsSiteAdmin').get();
      return !!(me && me.IsSiteAdmin);
    } catch (e) {
      return false;
    }
  }

  public async getAllDepartments(): Promise<IDepartment[]> {
    const items: any[] = await sp.web.lists.getByTitle(this.cfg.departmentsListTitle).items
      .select('Id', 'Title')
      .orderBy('Title', true)
      .top(500)
      .get();
    return items.map((it: any) => ({ id: it.Id, title: it.Title }));
  }

  /**
   * Posts awaiting review. Scoped to the caller's departments so a department
   * admin sees only their own queue; a Super Admin passes every department.
   *
   * Note this scoping is a convenience, not a security boundary: Approve Items
   * is a list-level permission, so SharePoint itself does not distinguish one
   * department's posts from another's. All approvers are trusted staff.
   */
  public async getPendingPosts(role: IModeratorRole, departmentId?: number): Promise<IPost[]> {
    if (!role.canModerate) { return []; }

    const clauses: string[] = [`OData__ModerationStatus eq ${ModerationStatus.Pending}`];
    if (departmentId) {
      clauses.push(`DepartmentId eq ${departmentId}`);
    } else if (!role.isSuperAdmin) {
      const ids: number[] = role.departments.map((d: IDepartment) => d.id);
      if (ids.length === 0) { return []; }
      clauses.push('(' + ids.map((id: number) => `DepartmentId eq ${id}`).join(' or ') + ')');
    }

    const items: any[] = await sp.web.lists.getByTitle(this.cfg.postsListTitle).items
      .select(
        'Id', 'Title', 'Body', 'Category', 'Created', 'Department', 'DepartmentId',
        'OData__ModerationStatus', 'OData__ModerationComments', 'AuthorId',
        'Author/Title', 'Author/EMail',
        'MentionedUsers/Title', 'MentionedUsers/Name', 'MentionedUsers/EMail'
      )
      .expand('Author', 'MentionedUsers')
      .filter(clauses.join(' and '))
      .orderBy('Created', true)     // oldest first: longest-waiting gets reviewed first
      .top(100)
      .get();

    return items.map((it: any) => this.mapPending(it));
  }

  private mapPending(it: any): IPost {
    return {
      id: it.Id,
      title: it.Title,
      bodyHtml: repairEmoji(it.Body || '', this.cfg.emojiBaseUrl),
      category: (it.Category || 'Discussion'),
      authorTitle: it.Author ? it.Author.Title : 'Unknown',
      authorDept: it.Department || '',
      authorDeptId: it.DepartmentId || 0,
      authorEmail: it.Author ? it.Author.EMail : '',
      authorId: it.AuthorId || 0,
      authorPicUrl: '',
      created: it.Created,
      likeUserIds: [],
      commentCount: 0,
      status: it.OData__ModerationStatus,
      moderationNote: it.OData__ModerationComments || '',
      mentions: mentionsFrom(it.MentionedUsers)
    };
  }

  /**
   * Approve, recording when and by whom: Expire-SocialPosts.ps1 counts a post's
   * month from PublishedOn. These must go in the SAME write as the status --
   * written on their own they would send the post straight back to Pending
   * (checked on dev). On a site where Provision-Expiry.ps1 has not run yet
   * the columns do not exist, so approve without them.
   */
  public async approve(postId: number, approverId?: number): Promise<void> {
    const fields: any = {
      OData__ModerationStatus: ModerationStatus.Approved,
      OData__ModerationComments: '',
      PublishedOn: new Date().toISOString()
    };
    if (approverId) { fields.ApprovedById = approverId; }
    try {
      await sp.web.lists.getByTitle(this.cfg.postsListTitle).items.getById(postId).update(fields);
    } catch (e) {
      if (!/PublishedOn|ApprovedBy/.test(String((e && e.message) || e))) { throw e; }
      await this.setStatus(postId, ModerationStatus.Approved, '');
    }
  }

  public async reject(postId: number, reason: string): Promise<void> {
    await this.setStatus(postId, ModerationStatus.Rejected, reason);
  }

  /**
   * Writing _ModerationStatus requires the Approve Items permission. For a user
   * without it SharePoint refuses the call, so an ordinary user cannot publish
   * their own post even by issuing this request by hand (requirement 5).
   */
  private async setStatus(postId: number, status: ModerationStatus, note: string): Promise<void> {
    await sp.web.lists.getByTitle(this.cfg.postsListTitle).items.getById(postId).update({
      OData__ModerationStatus: status,
      OData__ModerationComments: (note || '').substring(0, 1000)
    });
  }

  /** Requirement 13/14 — refused by SharePoint for anyone but a Super Admin. */
  public async deletePost(postId: number): Promise<void> {
    await sp.web.lists.getByTitle(this.cfg.postsListTitle).items.getById(postId).delete();
  }

  public async deleteComment(commentId: number): Promise<void> {
    await sp.web.lists.getByTitle(this.cfg.commentsListTitle).items.getById(commentId).delete();
  }
}

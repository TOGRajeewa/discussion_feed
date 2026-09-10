import { sp } from '@pnp/sp';
import { IFeedConfig, IDepartment } from '../models';

/**
 * Works out which department a post should be filed under, so the right
 * department admin sees it in their queue (requirement 2).
 *
 * The source of truth is the author's User Profile "Department" property,
 * matched against the Departments list. That match can fail -- a profile with
 * the property left blank, or holding a spelling the list does not use (one
 * account on this farm reads "Bank Supervision Department edited"). When it
 * fails the composer asks the author to pick instead, so a post is never
 * stranded in a queue nobody owns. Check-DepartmentMapping.ps1 reports which
 * profiles are in that state.
 */
export class DepartmentService {
  private all: IDepartment[] = null;

  constructor(private cfg: IFeedConfig) { }

  public async getDepartments(): Promise<IDepartment[]> {
    if (this.all) { return this.all; }
    const items: any[] = await sp.web.lists.getByTitle(this.cfg.departmentsListTitle).items
      .select('Id', 'Title')
      .orderBy('Title', true)
      .top(500)
      .get();
    this.all = items.map((it: any) => ({ id: it.Id, title: it.Title }));
    return this.all;
  }

  /** The current user's User Profile Department, or '' when unset. */
  public async getProfileDepartmentName(): Promise<string> {
    try {
      const props: any = await sp.profiles.myProperties.get();
      const bag: any = (props && props.UserProfileProperties) || [];
      const list: any[] = bag.results || bag || [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].Key === 'Department') { return (list[i].Value || '').trim(); }
      }
    } catch (e) {
      // User Profile Service can be unreachable; fall back to asking the user.
    }
    return '';
  }

  /**
   * Resolve the current user's department, or null when it cannot be matched
   * confidently. Callers must treat null as "ask the author", never as a
   * reason to file the post under nothing.
   */
  public async resolveForCurrentUser(): Promise<IDepartment> {
    const name: string = await this.getProfileDepartmentName();
    if (!name) { return null; }
    return this.match(name, await this.getDepartments());
  }

  /**
   * Exact match first. Failing that, compare with a trailing "Department"
   * dropped from either side, which is the one systematic difference seen
   * between profile values and list titles. Anything looser risks filing a
   * post with the wrong department's admins, so we stop there and ask.
   */
  public match(profileName: string, departments: IDepartment[]): IDepartment {
    const want: string = (profileName || '').trim().toLowerCase();
    if (!want) { return null; }

    for (let i = 0; i < departments.length; i++) {
      if (departments[i].title.trim().toLowerCase() === want) { return departments[i]; }
    }

    const strip = (s: string): string => s.replace(/\s+department\s*$/i, '').trim().toLowerCase();
    const wantStripped: string = strip(profileName);
    if (!wantStripped) { return null; }

    const hits: IDepartment[] = departments.filter(
      (d: IDepartment) => strip(d.title) === wantStripped
    );
    return hits.length === 1 ? hits[0] : null;
  }
}

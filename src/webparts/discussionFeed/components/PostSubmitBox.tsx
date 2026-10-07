import * as React from 'react';
import { PrimaryButton } from 'office-ui-fabric-react/lib/Button';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import { SPHttpClient } from '@microsoft/sp-http';
import styles from './DiscussionFeed.module.scss';
import { Avatar } from './Avatar';
import { TinyMceEditor } from './TinyMceEditor';
import { ComposerToolbar } from './ComposerToolbar';
import { PeoplePickerField } from './PeoplePickerField';
import { CATEGORY_DEFS, categoryDef, ICategoryDef } from './categories';
import { uploadFeedImage } from '../services/UploadService';
import { stripHtml } from '../services/utils';
import {
  ICurrentUser, IMentionUser, IPostDraft, PostCategory, IFeedConfig, IDepartment
} from '../models';

export interface IPostSubmitBoxProps {
  currentUser: ICurrentUser;
  config: IFeedConfig;
  spHttpClient: SPHttpClient;
  /** Resolved from the author's User Profile; null when it could not be matched. */
  department: IDepartment;
  /** Offered only when `department` is null, so a post is never left unroutable. */
  departmentOptions: IDepartment[];
  onSubmit: (draft: IPostDraft) => Promise<void>;
  /** Post types this feed offers; Social Corner's when omitted. */
  categories?: ICategoryDef[];
  /** Placeholder of the collapsed box. */
  prompt?: string;
  /**
   * Posts go for approval (Social Corner, the default): the button reads
   * "Submit for review", a department is required to route the post, and the
   * author is told it is not live yet. False for the Market Place.
   */
  reviewed?: boolean;
}

export interface IPostSubmitBoxState {
  expanded: boolean;
  category: PostCategory;
  html: string;
  questionTitle: string;
  addedPeople: IMentionUser[];
  praisePeople: IMentionUser[];
  attachedImages: { url: string; name: string }[];
  activeFormats: { [cmd: string]: boolean };
  submitting: boolean;
  /** Author's choice when their profile department could not be resolved. */
  pickedDeptId: number;
  /** Set after a successful submit so the author knows it is not live yet. */
  submitted: boolean;
}

export class PostSubmitBox extends React.Component<IPostSubmitBoxProps, IPostSubmitBoxState> {
  private editor: any = null;

  constructor(props: IPostSubmitBoxProps) {
    super(props);
    this.state = this.empty('Discussion');
  }

  private empty(category: PostCategory, submitted?: boolean): IPostSubmitBoxState {
    return {
      expanded: false, category, html: '', questionTitle: '',
      addedPeople: [], praisePeople: [], attachedImages: [], activeFormats: {}, submitting: false,
      pickedDeptId: this.state ? this.state.pickedDeptId : 0,
      submitted: !!submitted
    };
  }

  /** The department to file under: the profile match, else the author's pick. */
  private get chosenDepartment(): IDepartment {
    if (this.props.department) { return this.props.department; }
    const picked: IDepartment[] = (this.props.departmentOptions || [])
      .filter((d: IDepartment) => d.id === this.state.pickedDeptId);
    return picked.length === 1 ? picked[0] : null;
  }

  private get needsDepartmentPick(): boolean {
    return this.reviewed && !this.props.department && (this.props.departmentOptions || []).length > 0;
  }

  private get defs(): ICategoryDef[] { return this.props.categories || CATEGORY_DEFS; }
  private get reviewed(): boolean { return this.props.reviewed !== false; }

  private expand = (category: PostCategory): void => {
    this.setState({ expanded: true, category });
  }

  private collapse = (): void => { this.setState(this.empty('Discussion')); }

  // ---- editor wiring ----
  private onReady = (ed: any): void => { this.editor = ed; };
  private exec = (cmd: string, value?: any): void => {
    if (this.editor) { this.editor.execCommand(cmd, false, value); }
  }
  private insert = (html: string): void => {
    if (this.editor) { this.editor.insertContent(html); }
  }

  private pickFile(accept: string, cb: (f: File) => void): void {
    const input: HTMLInputElement = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => { if (input.files && input.files[0]) { cb(input.files[0]); } };
    input.click();
  }

  private onImage = (): void => {
    this.pickFile('image/*', async (f: File) => {
      const url: string = await uploadFeedImage(this.props.config.assetLibraryServerRelUrl, f);
      // collect as an attachment gallery (rendered as a grid), not inline in the text
      this.setState({ attachedImages: this.state.attachedImages.concat([{ url, name: f.name }]) });
    });
  }

  private removeImage = (url: string): void => {
    this.setState({ attachedImages: this.state.attachedImages.filter((im) => im.url !== url) });
  }

  private onAttach = (): void => {
    this.pickFile('*/*', async (f: File) => {
      const url: string = await uploadFeedImage(this.props.config.assetLibraryServerRelUrl, f);
      this.insert(`<p>📎 <a href="${url}">${f.name}</a></p>`);
    });
  }

  // ---- submit ----
  private get recipients(): IMentionUser[] {
    const map: { [k: string]: IMentionUser } = {};
    this.state.addedPeople.concat(this.state.praisePeople)
      .forEach((p: IMentionUser) => { map[p.loginName] = p; });
    return Object.keys(map).map((k: string) => map[k]);
  }

  private get canSubmit(): boolean {
    if (this.state.submitting) { return false; }
    // Without a department the post would sit in a queue no admin owns, so it
    // cannot be submitted until one is resolved or chosen. Unreviewed posts
    // only show the department on the card, so they do not need one.
    if (this.reviewed && !this.chosenDepartment) { return false; }
    if (this.state.category === 'Question') { return !!this.state.questionTitle.trim(); }
    if (this.state.category === 'Praise') { return this.state.praisePeople.length > 0; }
    return !!stripHtml(this.state.html) || this.state.attachedImages.length > 0;
  }

  private imageGallery(): string {
    const imgs = this.state.attachedImages;
    if (imgs.length === 0) { return ''; }
    const tags: string = imgs.map((im) => `<img src="${im.url}" alt="${im.name}" />`).join('');
    return `<div class="df-images" data-count="${imgs.length}">${tags}</div>`;
  }

  private composeBody(): string {
    const body: string = this.state.html || '';
    let lead: string = body;
    if (this.state.category === 'Question') {
      const t: string = (this.state.questionTitle || '').replace(/</g, '&lt;');
      lead = `<p><strong>${t}</strong></p>${body}`;
    } else if (this.state.category === 'Praise') {
      const names: string = this.state.praisePeople.map((p: IMentionUser) => `@${p.title}`).join(', ');
      lead = `<p>🎉 <em>Praise for ${names}</em></p>${body}`;
    }
    return lead + this.imageGallery();
  }

  private submit = async (): Promise<void> => {
    if (!this.canSubmit) { return; }
    this.setState({ submitting: true });
    try {
      await this.props.onSubmit({
        html: this.composeBody(),
        category: this.state.category,
        mentions: this.recipients,
        department: this.chosenDepartment
      });
      // Collapse to the confirmation rather than to the feed: the post is
      // Pending, so there is nothing for the author to see yet. An unreviewed
      // post is already at the top of the feed, which says enough.
      this.setState(this.empty('Discussion', this.reviewed));
    } catch (e) {
      this.setState({ submitting: false });
    }
  }

  // ---- render ----
  /**
   * Every post now goes for review, so the author gets no optimistic insert
   * into the feed. Saying so explicitly avoids the obvious support question:
   * "I posted and nothing happened."
   */
  private renderSubmitted(): JSX.Element {
    if (!this.state.submitted) { return null; }
    return (
      <div className={styles.submittedNote}>
        <Icon iconName="Send" />
        <div style={{ flex: 1 }}>
          Sent for review. Your post will appear in the feed once an administrator approves it.
        </div>
        <button
          type="button"
          className={styles.submittedNoteX}
          title="Dismiss"
          onClick={() => this.setState({ submitted: false })}
        >×</button>
      </div>
    );
  }

  private renderDepartmentPrompt(): JSX.Element {
    if (!this.needsDepartmentPick) { return null; }
    // Native select — see the note in ModerationQueue.renderFilter().
    return (
      <div className={styles.deptPrompt}>
        <Icon iconName="Info" />
        <span>We could not tell which department you are in. Please choose one so the right administrator reviews your post.</span>
        <select
          className={`${styles.select} ${styles.deptPromptSelect}`}
          value={this.state.pickedDeptId || ''}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            this.setState({ pickedDeptId: Number(e.target.value) })}
        >
          <option value="" disabled={true}>Select department</option>
          {this.props.departmentOptions.map((d: IDepartment) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
      </div>
    );
  }

  private renderCollapsed(): JSX.Element {
    return (
      <div className={`${styles.card} ${styles.submitBox}`}>
        {this.renderSubmitted()}
        <div className={styles.collapsedRow}>
          <Avatar name={this.props.currentUser.title} picUrl={this.props.currentUser.picUrl} />
          <div className={styles.collapsedPlaceholder} onClick={() => this.expand('Discussion')}>
            {this.props.prompt || 'Share thoughts, ideas, or updates'}
          </div>
        </div>
        <div className={styles.typeTabs}>
          {this.defs.map(c => (
            <button type="button" key={c.key} className={styles.typeTab} onClick={() => this.expand(c.key)}>
              <Icon iconName={c.iconName} style={{ color: c.color }} />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  private renderExpanded(): JSX.Element {
    const def = categoryDef(this.state.category, this.defs);
    const cfg: IFeedConfig = this.props.config;
    return (
      <div className={`${styles.card} ${styles.submitBox}`}>
        <div className={styles.composerTop}>
          <span className={styles.collapseLink} onClick={this.collapse}>Collapse</span>
        </div>

        {this.renderDepartmentPrompt()}

        <div className={styles.composerArea} style={{ borderColor: def.color }}>
          {this.state.category !== 'Discussion' &&
            <span className={styles.typePill} style={{ background: def.color }}>
              {def.label.toUpperCase()}
            </span>}

          {/* Question title */}
          {this.state.category === 'Question' &&
            <div className={styles.qTitleWrap}>
              <input
                className={styles.qTitle}
                placeholder={def.titlePlaceholder}
                maxLength={def.titleMax}
                value={this.state.questionTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.setState({ questionTitle: e.target.value })}
              />
              <span className={styles.qCount}>{this.state.questionTitle.length}/{def.titleMax}</span>
            </div>}

          {/* Praise people */}
          {this.state.category === 'Praise' &&
            <PeoplePickerField
              spHttpClient={this.props.spHttpClient}
              webUrl={cfg.webUrl}
              selected={this.state.praisePeople}
              onChange={(p: IMentionUser[]) => this.setState({ praisePeople: p })}
              placeholder={def.peoplePlaceholder}
              variant="box"
            />}

          <TinyMceEditor
            value={this.state.html}
            assetLibraryServerRelUrl={cfg.assetLibraryServerRelUrl}
            skinUrl={cfg.tinymceSkinUrl}
            placeholder={def.bodyPlaceholder}
            onChange={(html: string) => this.setState({ html })}
            onReady={this.onReady}
            onFormatState={(s: { [cmd: string]: boolean }) => this.setState({ activeFormats: s })}
          />

          {this.state.attachedImages.length > 0 &&
            <div className={styles.composerImages}>
              {this.state.attachedImages.map((im) => (
                <div className={styles.composerImageThumb} key={im.url}>
                  <img src={im.url} alt={im.name} />
                  <button
                    type="button"
                    className={styles.composerImageX}
                    title="Remove"
                    onClick={() => this.removeImage(im.url)}
                  >×</button>
                </div>
              ))}
            </div>}
        </div>

        {/* Add people */}
        <PeoplePickerField
          spHttpClient={this.props.spHttpClient}
          webUrl={cfg.webUrl}
          selected={this.state.addedPeople}
          onChange={(p: IMentionUser[]) => this.setState({ addedPeople: p })}
          placeholder="@mention people"
          variant="inline"
        />

        {/* bottom bar: toolbar + submit */}
        <div className={styles.composerBottom}>
          <ComposerToolbar
            category={this.state.category}
            categories={this.defs}
            onCategoryChange={(c: PostCategory) => this.setState({ category: c })}
            exec={this.exec}
            insert={this.insert}
            onImage={this.onImage}
            onAttach={this.onAttach}
            activeFormats={this.state.activeFormats}
            emojiBaseUrl={cfg.emojiBaseUrl}
          />
          <PrimaryButton
            className={styles.postButton}
            // "Post"/"Ask" would overpromise in Social Corner: the author is
            // submitting for review, not publishing (requirement 5).
            text={this.state.submitting ? '…' : (this.reviewed ? 'Submit for review' : def.submitLabel)}
            title={this.reviewed
              ? `${def.submitLabel} — sent to your department administrator for approval`
              : `${def.submitLabel} — visible to everyone straight away`}
            disabled={!this.canSubmit}
            onClick={this.submit}
          />
        </div>
      </div>
    );
  }

  public render(): JSX.Element {
    return this.state.expanded ? this.renderExpanded() : this.renderCollapsed();
  }
}

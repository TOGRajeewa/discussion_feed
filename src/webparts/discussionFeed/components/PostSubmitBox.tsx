import * as React from 'react';
import { PrimaryButton } from 'office-ui-fabric-react/lib/Button';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import { SPHttpClient } from '@microsoft/sp-http';
import styles from './DiscussionFeed.module.scss';
import { Avatar } from './Avatar';
import { TinyMceEditor } from './TinyMceEditor';
import { ComposerToolbar } from './ComposerToolbar';
import { PeoplePickerField } from './PeoplePickerField';
import { CATEGORY_DEFS, categoryDef } from './categories';
import { uploadFeedImage } from '../services/UploadService';
import { stripHtml } from '../services/utils';
import { ICurrentUser, IMentionUser, IPostDraft, PostCategory, IFeedConfig } from '../models';

export interface IPostSubmitBoxProps {
  currentUser: ICurrentUser;
  config: IFeedConfig;
  spHttpClient: SPHttpClient;
  onSubmit: (draft: IPostDraft) => Promise<void>;
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
}

export class PostSubmitBox extends React.Component<IPostSubmitBoxProps, IPostSubmitBoxState> {
  private editor: any = null;

  constructor(props: IPostSubmitBoxProps) {
    super(props);
    this.state = this.empty('Discussion');
  }

  private empty(category: PostCategory): IPostSubmitBoxState {
    return {
      expanded: false, category, html: '', questionTitle: '',
      addedPeople: [], praisePeople: [], attachedImages: [], activeFormats: {}, submitting: false
    };
  }

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
        mentions: this.recipients
      });
      this.setState(this.empty('Discussion'));
    } catch (e) {
      this.setState({ submitting: false });
    }
  }

  // ---- render ----
  private renderCollapsed(): JSX.Element {
    return (
      <div className={`${styles.card} ${styles.submitBox}`}>
        <div className={styles.collapsedRow}>
          <Avatar name={this.props.currentUser.title} picUrl={this.props.currentUser.picUrl} />
          <div className={styles.collapsedPlaceholder} onClick={() => this.expand('Discussion')}>
            Share thoughts, ideas, or updates
          </div>
        </div>
        <div className={styles.typeTabs}>
          {CATEGORY_DEFS.map(c => (
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
    const def = categoryDef(this.state.category);
    const cfg: IFeedConfig = this.props.config;
    return (
      <div className={`${styles.card} ${styles.submitBox}`}>
        <div className={styles.composerTop}>
          <span className={styles.collapseLink} onClick={this.collapse}>Collapse</span>
        </div>

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
          placeholder="Add people"
          variant="inline"
        />

        {/* bottom bar: toolbar + submit */}
        <div className={styles.composerBottom}>
          <ComposerToolbar
            category={this.state.category}
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
            text={this.state.submitting ? '…' : def.submitLabel}
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

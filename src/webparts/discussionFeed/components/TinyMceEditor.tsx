import * as React from 'react';

// TinyMCE 4 core + the pieces we bundle for an on-prem (no-CDN) build.
import * as tinymce from 'tinymce/tinymce';
import 'tinymce/themes/modern/theme';
import 'tinymce/plugins/table';        // <-- the reason we moved off Quill: real tables
import 'tinymce/plugins/lists';
import 'tinymce/plugins/link';
import 'tinymce/plugins/image';
import 'tinymce/plugins/paste';
import 'tinymce/plugins/autolink';

import { SPHttpClient } from '@microsoft/sp-http';
import { Callout, DirectionalHint } from 'office-ui-fabric-react/lib/Callout';
import { Persona, PersonaSize } from 'office-ui-fabric-react/lib/Persona';
import styles from './DiscussionFeed.module.scss';
import { searchPeople } from '../services/PeopleService';
import { uploadFeedImage } from '../services/UploadService';
import { IMentionUser } from '../models';

export interface ITinyMceEditorProps {
  value: string;
  spHttpClient: SPHttpClient;
  webUrl: string;
  assetLibraryServerRelUrl: string;
  /**
   * Folder (deployed to the site) that holds the TinyMCE 'lightgray' skin.
   * On-prem there is no CDN — the skin must be served from SharePoint.
   * e.g. "/sites/Intranet/SiteAssets/tinymce/skins/lightgray"
   */
  skinUrl: string;
  onChange: (html: string) => void;
  onMentionsChange: (mentions: IMentionUser[]) => void;
}

interface ITinyMceEditorState {
  mentionOpen: boolean;
  mentionQuery: string;
  mentionResults: IMentionUser[];
  calloutX: number;
  calloutY: number;
}

let editorSeq: number = 0;

export class TinyMceEditor extends React.Component<ITinyMceEditorProps, ITinyMceEditorState> {
  private editorId: string = `dfeed-tinymce-${editorSeq++}`;
  private editor: any = null;
  private mentioned: { [login: string]: IMentionUser } = {};
  private mentionAnchor: HTMLDivElement = null;

  constructor(props: ITinyMceEditorProps) {
    super(props);
    this.state = {
      mentionOpen: false, mentionQuery: '', mentionResults: [], calloutX: 0, calloutY: 0
    };
  }

  public componentDidMount(): void {
    tinymce.init({
      selector: `#${this.editorId}`,
      skin_url: this.props.skinUrl,             // served from SharePoint, not a CDN
      menubar: false,
      statusbar: false,
      branding: false,
      height: 160,
      plugins: 'table lists link image paste autolink',
      toolbar:
        'bold italic underline | bullist numlist | link image | table | removeformat',
      table_toolbar:
        'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | ' +
        'tableinsertcolbefore tableinsertcolafter tabledeletecol',
      paste_data_images: false,
      // Toolbar "image": pick a local file and upload to the asset library.
      file_picker_types: 'image',
      file_picker_callback: this.onFilePick,
      // Pasted / dragged images also land in the local asset library.
      images_upload_handler: this.onImageUpload,
      setup: (ed: any) => {
        this.editor = ed;
        ed.on('init', () => ed.setContent(this.props.value || ''));
        ed.on('keyup change', () => {
          this.props.onChange(ed.getContent());
          this.detectMention(ed);
          this.reconcileMentions(ed.getContent());
        });
      }
    });
  }

  public componentWillUnmount(): void {
    if (this.editor) { tinymce.remove(`#${this.editorId}`); this.editor = null; }
  }

  // ---- image upload (toolbar) ----
  private onFilePick = (callback: (url: string, meta?: any) => void): void => {
    const input: HTMLInputElement = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      if (!input.files || !input.files[0]) { return; }
      const url: string = await uploadFeedImage(this.props.assetLibraryServerRelUrl, input.files[0]);
      callback(url, { alt: input.files[0].name });   // server-relative URL into the HTML
    };
    input.click();
  }

  // ---- image upload (paste/drag) ----
  private onImageUpload = (blobInfo: any, success: (url: string) => void, failure: (err: string) => void): void => {
    const file: File = new File([blobInfo.blob()], blobInfo.filename(), { type: blobInfo.blob().type });
    uploadFeedImage(this.props.assetLibraryServerRelUrl, file)
      .then((url: string) => success(url))
      .catch((e: any) => failure(`Upload failed: ${e.message || e}`));
  }

  // ---- @mention detection against the LOCAL People Picker ----
  private async detectMention(ed: any): Promise<void> {
    const rng: Range = ed.selection.getRng();
    const node: Node = rng.startContainer;
    if (!node || node.nodeType !== 3) { this.closeMention(); return; }

    const text: string = (node.textContent || '').substring(0, rng.startOffset);
    const match: RegExpMatchArray = text.match(/@([A-Za-z][A-Za-z .'-]{1,30})$/);
    if (!match) { this.closeMention(); return; }

    const query: string = match[1];
    const people: IMentionUser[] = await searchPeople(this.props.spHttpClient, this.props.webUrl, query);

    // position the callout under the caret (iframe offset + caret rect)
    const iframeRect: ClientRect = ed.getContentAreaContainer
      ? ed.getContentAreaContainer().getBoundingClientRect()
      : ed.iframeElement.getBoundingClientRect();
    let caret: ClientRect = { left: 0, top: 0, bottom: 0 } as any;
    try { caret = ed.selection.getBoundingClientRect() || caret; } catch (e) { /* noop */ }

    this.setState({
      mentionOpen: people.length > 0,
      mentionQuery: query,
      mentionResults: people,
      calloutX: iframeRect.left + (caret.left || 0),
      calloutY: iframeRect.top + (caret.bottom || 18)
    });
  }

  private closeMention(): void {
    if (this.state.mentionOpen) { this.setState({ mentionOpen: false, mentionResults: [] }); }
  }

  private pickMention = (user: IMentionUser): void => {
    const ed: any = this.editor;
    const rng: Range = ed.selection.getRng();
    const node: Node = rng.startContainer;
    const offset: number = rng.startOffset;
    const text: string = node.textContent || '';
    const at: number = text.lastIndexOf('@', offset - 1);
    if (at < 0) { return; }

    // replace "@query" with a mention chip carrying the login for later extraction
    const newRange: Range = ed.dom.createRng();
    newRange.setStart(node, at);
    newRange.setEnd(node, offset);
    ed.selection.setRng(newRange);
    ed.selection.setContent(
      `<span class="mention" data-mention-login="${user.loginName}">@${user.title}</span>&nbsp;`
    );

    this.mentioned[user.loginName] = user;
    this.closeMention();
    this.props.onChange(ed.getContent());
    this.reconcileMentions(ed.getContent());
  }

  /** Keep only mentions whose chip is still present in the HTML. */
  private reconcileMentions(html: string): void {
    const present: IMentionUser[] = Object.keys(this.mentioned)
      .filter((login: string) => html.indexOf(`data-mention-login="${login}"`) > -1)
      .map((login: string) => this.mentioned[login]);
    this.props.onMentionsChange(present);
  }

  public render(): JSX.Element {
    return (
      <div className={styles.editorWrap}>
        <textarea id={this.editorId} />
        <div
          ref={(r: HTMLDivElement) => { this.mentionAnchor = r; }}
          style={{ position: 'fixed', left: this.state.calloutX, top: this.state.calloutY }}
        />
        {this.state.mentionOpen &&
          <Callout
            target={this.mentionAnchor}
            directionalHint={DirectionalHint.bottomLeftEdge}
            isBeakVisible={false}
            gapSpace={2}
            onDismiss={() => this.closeMention()}
          >
            <div style={{ minWidth: 240, padding: 4 }}>
              {this.state.mentionResults.map((u: IMentionUser) => (
                <div
                  key={u.loginName}
                  style={{ padding: '6px 8px', cursor: 'pointer' }}
                  onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => { e.preventDefault(); this.pickMention(u); }}
                >
                  <Persona text={u.title} secondaryText={u.email} size={PersonaSize.size28} />
                </div>
              ))}
            </div>
          </Callout>}
      </div>
    );
  }
}

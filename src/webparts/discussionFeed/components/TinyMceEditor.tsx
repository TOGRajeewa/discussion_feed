import * as React from 'react';

import * as tinymce from 'tinymce/tinymce';
import 'tinymce/themes/modern/theme';
import 'tinymce/plugins/table';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/link';
import 'tinymce/plugins/image';
import 'tinymce/plugins/paste';
import 'tinymce/plugins/autolink';

import styles from './DiscussionFeed.module.scss';
import { uploadFeedImage } from '../services/UploadService';

export interface ITinyMceEditorProps {
  value: string;
  assetLibraryServerRelUrl: string;
  skinUrl: string;
  placeholder: string;
  onChange: (html: string) => void;
  /** Hands the live TinyMCE instance to the parent so the custom toolbar can drive it. */
  onReady: (editor: any) => void;
  /** Reports active format state (Bold/Italic/lists) so the toolbar can highlight. */
  onFormatState?: (state: { [cmd: string]: boolean }) => void;
}

const TRACKED_COMMANDS: string[] = ['Bold', 'Italic', 'InsertUnorderedList', 'InsertOrderedList'];

let edSeq: number = 0;

/**
 * TinyMCE with its built-in toolbar hidden — formatting is driven by our own
 * React ComposerToolbar via the exposed editor instance. The placeholder lives
 * INSIDE the editor (CSS :before) so the caret and placeholder text align.
 */
export class TinyMceEditor extends React.Component<ITinyMceEditorProps, {}> {
  private editorId: string = `dfeed-tinymce-${edSeq++}`;
  private editor: any = null;

  public componentDidMount(): void {
    tinymce.init({
      selector: `#${this.editorId}`,
      skin_url: this.props.skinUrl,
      menubar: false,
      toolbar: false,
      statusbar: false,
      branding: false,
      height: 150,
      plugins: 'table lists link image paste autolink',
      table_default_attributes: { border: '1' },
      table_toolbar: '',
      paste_data_images: false,
      images_upload_handler: this.onImageUpload,
      content_style:
        'body{font-family:Segoe UI,Arial,sans-serif;font-size:14.5px;color:#242424;line-height:1.5;margin:0;padding:10px 12px;position:relative;} ' +
        'table{border-collapse:collapse;} td,th{border:1px solid #e1e1e1;padding:6px 8px;} img{max-width:100%;} ' +
        '.df-empty:before{content:attr(data-mce-placeholder);color:#8a8886;position:absolute;top:10px;left:12px;pointer-events:none;}',
      setup: (ed: any) => {
        this.editor = ed;
        ed.on('init', () => {
          ed.setContent(this.props.value || '');
          ed.getBody().setAttribute('data-mce-placeholder', this.props.placeholder || '');
          this.togglePlaceholder(ed);
          this.props.onReady(ed);
        });
        ed.on('keyup change input SetContent NodeChange focus blur', () => {
          this.props.onChange(ed.getContent());
          this.togglePlaceholder(ed);
          if (this.props.onFormatState) {
            const state: { [cmd: string]: boolean } = {};
            TRACKED_COMMANDS.forEach((c: string) => { state[c] = ed.queryCommandState(c); });
            this.props.onFormatState(state);
          }
        });
      }
    });
  }

  public componentDidUpdate(prev: ITinyMceEditorProps): void {
    if (this.editor && prev.placeholder !== this.props.placeholder) {
      this.editor.getBody().setAttribute('data-mce-placeholder', this.props.placeholder || '');
      this.togglePlaceholder(this.editor);
    }
  }

  public componentWillUnmount(): void {
    if (this.editor) { tinymce.remove(`#${this.editorId}`); this.editor = null; }
  }

  private togglePlaceholder(ed: any): void {
    const txt: string = (ed.getContent({ format: 'text' }) || '').trim();
    const hasMedia: boolean = /<(img|table)/i.test(ed.getContent());
    ed.dom.toggleClass(ed.getBody(), 'df-empty', !txt && !hasMedia);
  }

  private onImageUpload = (blobInfo: any, success: (url: string) => void, failure: (err: string) => void): void => {
    const file: File = new File([blobInfo.blob()], blobInfo.filename(), { type: blobInfo.blob().type });
    uploadFeedImage(this.props.assetLibraryServerRelUrl, file)
      .then((url: string) => success(url))
      .catch((e: any) => failure(`Upload failed: ${e.message || e}`));
  }

  public render(): JSX.Element {
    return (
      <div className={styles.editorHost}>
        <textarea id={this.editorId} />
      </div>
    );
  }
}

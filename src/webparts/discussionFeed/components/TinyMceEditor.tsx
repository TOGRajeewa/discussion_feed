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
import { stripHtml } from '../services/utils';

export interface ITinyMceEditorProps {
  value: string;
  assetLibraryServerRelUrl: string;
  skinUrl: string;
  placeholder: string;
  onChange: (html: string) => void;
  /** Hands the live TinyMCE instance to the parent so the custom toolbar can drive it. */
  onReady: (editor: any) => void;
}

let edSeq: number = 0;

/**
 * TinyMCE with its built-in toolbar hidden — formatting is driven by our own
 * React ComposerToolbar via the exposed editor instance. Keeps tables, lists,
 * links, and image upload to the local asset library.
 */
export class TinyMceEditor extends React.Component<ITinyMceEditorProps, {}> {
  private editorId: string = `dfeed-tinymce-${edSeq++}`;
  private editor: any = null;

  public componentDidMount(): void {
    tinymce.init({
      selector: `#${this.editorId}`,
      skin_url: this.props.skinUrl,
      menubar: false,
      toolbar: false,            // our custom toolbar drives formatting
      statusbar: false,
      branding: false,
      height: 150,
      plugins: 'table lists link image paste autolink',
      table_default_attributes: { border: '1' },
      paste_data_images: false,
      images_upload_handler: this.onImageUpload,   // paste/drag uploads
      content_style:
        'body{font-family:Segoe UI,Arial,sans-serif;font-size:14.5px;color:#242424;line-height:1.5;} ' +
        'table{border-collapse:collapse;} td,th{border:1px solid #e1e1e1;padding:6px 8px;} img{max-width:100%;}',
      setup: (ed: any) => {
        this.editor = ed;
        ed.on('init', () => {
          ed.setContent(this.props.value || '');
          this.props.onReady(ed);
        });
        ed.on('keyup change input SetContent', () => {
          this.props.onChange(ed.getContent());
        });
      }
    });
  }

  public componentWillUnmount(): void {
    if (this.editor) { tinymce.remove(`#${this.editorId}`); this.editor = null; }
  }

  private onImageUpload = (blobInfo: any, success: (url: string) => void, failure: (err: string) => void): void => {
    const file: File = new File([blobInfo.blob()], blobInfo.filename(), { type: blobInfo.blob().type });
    uploadFeedImage(this.props.assetLibraryServerRelUrl, file)
      .then((url: string) => success(url))
      .catch((e: any) => failure(`Upload failed: ${e.message || e}`));
  }

  public render(): JSX.Element {
    const isEmpty: boolean = !stripHtml(this.props.value || '');
    return (
      <div className={styles.editorHost}>
        {isEmpty &&
          <div className={styles.editorPlaceholder}>{this.props.placeholder}</div>}
        <textarea id={this.editorId} />
      </div>
    );
  }
}

import * as React from 'react';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import { IconButton } from 'office-ui-fabric-react/lib/Button';
import { IContextualMenuProps } from 'office-ui-fabric-react/lib/ContextualMenu';
import styles from './DiscussionFeed.module.scss';
import { EmojiPicker } from './EmojiPicker';
import { CATEGORY_DEFS, categoryDef } from './categories';
import { PostCategory } from '../models';

export interface IComposerToolbarProps {
  category: PostCategory;
  onCategoryChange: (c: PostCategory) => void;
  exec: (command: string, value?: any) => void;     // drive the editor
  insert: (html: string) => void;                    // insert HTML/emoji
  onImage: () => void;                               // upload + insert image
  onAttach: () => void;                              // upload + insert file link
}

export interface IComposerToolbarState { emojiOpen: boolean; }

let tbSeq: number = 0;

export class ComposerToolbar extends React.Component<IComposerToolbarProps, IComposerToolbarState> {
  private emojiId: string = `df-emoji-${tbSeq++}`;

  constructor(props: IComposerToolbarProps) {
    super(props);
    this.state = { emojiOpen: false };
  }

  private noFocusLoss = (e: React.MouseEvent<HTMLButtonElement>): void => { e.preventDefault(); };

  private insertLink = (): void => {
    const url: string = window.prompt('Link URL:', 'https://') || '';
    if (url && url !== 'https://') { this.props.exec('mceInsertLink', url); }
  }

  private get categoryMenu(): IContextualMenuProps {
    return {
      items: CATEGORY_DEFS.map(c => ({
        key: c.key,
        text: c.label,
        iconProps: { iconName: c.iconName, style: { color: c.color } },
        onClick: () => this.props.onCategoryChange(c.key)
      }))
    };
  }

  public render(): JSX.Element {
    const def = categoryDef(this.props.category);
    const fmt: { cmd?: string; icon: string; title: string; action?: () => void }[] = [
      { cmd: 'Bold', icon: 'Bold', title: 'Bold' },
      { cmd: 'Italic', icon: 'Italic', title: 'Italic' },
      { icon: 'Link', title: 'Link', action: this.insertLink },
      { cmd: 'InsertUnorderedList', icon: 'BulletedList', title: 'Bulleted list' },
      { cmd: 'InsertOrderedList', icon: 'NumberedList', title: 'Numbered list' },
      { icon: 'Table', title: 'Insert table', action: () => this.props.exec('mceInsertTable', { rows: 2, columns: 2 }) }
    ];

    return (
      <div className={styles.composerToolbar}>
        {/* category dropdown (left) */}
        <IconButton
          className={styles.catBtn}
          menuProps={this.categoryMenu}
          title={`Post type: ${def.label}`}
          styles={{ icon: { color: def.color } }}
          iconProps={{ iconName: def.iconName }}
        />
        <span className={styles.tbDivider} />

        {fmt.map((b, i) => (
          <button
            type="button"
            key={i}
            className={styles.tbBtn}
            title={b.title}
            onMouseDown={this.noFocusLoss}
            onClick={() => (b.action ? b.action() : this.props.exec(b.cmd))}
          >
            <Icon iconName={b.icon} />
          </button>
        ))}

        <span className={styles.tbDivider} />

        <button
          type="button"
          id={this.emojiId}
          className={styles.tbBtn}
          title="Emoji"
          onMouseDown={this.noFocusLoss}
          onClick={() => this.setState({ emojiOpen: !this.state.emojiOpen })}
        >
          <Icon iconName="Emoji2" />
        </button>
        <button type="button" className={styles.tbBtn} title="Add image"
          onMouseDown={this.noFocusLoss} onClick={this.props.onImage}>
          <Icon iconName="Photo2" />
        </button>
        <button type="button" className={styles.tbBtn} title="Attach a file"
          onMouseDown={this.noFocusLoss} onClick={this.props.onAttach}>
          <Icon iconName="Attach" />
        </button>

        {this.state.emojiOpen &&
          <EmojiPicker
            targetId={this.emojiId}
            onSelect={(e: string) => { this.props.insert(e); this.setState({ emojiOpen: false }); }}
            onDismiss={() => this.setState({ emojiOpen: false })}
          />}
      </div>
    );
  }
}

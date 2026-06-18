import * as React from 'react';
import { Callout, DirectionalHint } from 'office-ui-fabric-react/lib/Callout';
import styles from './DiscussionFeed.module.scss';
import { EMOJI_SET, IEmoji } from './emojiSet';

export interface IEmojiPickerProps {
  targetId: string;
  baseUrl: string;                 // SiteAssets/.../emoji/ (trailing slash)
  onSelect: (html: string) => void;
  onDismiss: () => void;
}

export interface IEmojiPickerState { query: string; }

/** One cell: shows the image, falls back to the label initial if it fails to load. */
class EmojiCell extends React.Component<{ emoji: IEmoji; baseUrl: string; onPick: (html: string) => void }, { failed: boolean }> {
  constructor(props: any) { super(props); this.state = { failed: false }; }

  private html(): string {
    const e: IEmoji = this.props.emoji;
    if (this.state.failed || !this.props.baseUrl) { return e.char || ''; }
    return `<img class="df-emoji" src="${this.props.baseUrl}${e.file}" alt="${e.char || e.label}" ` +
      `title="${e.label}" style="width:1.3em;height:1.3em;vertical-align:-0.25em;" />`;
  }

  public render(): JSX.Element {
    const e: IEmoji = this.props.emoji;
    return (
      <button
        type="button"
        className={styles.emojiBtn}
        title={e.label}
        onMouseDown={(ev: React.MouseEvent<HTMLButtonElement>) => { ev.preventDefault(); this.props.onPick(this.html()); }}
      >
        {this.state.failed || !this.props.baseUrl
          ? (e.char || e.label.substring(0, 1))
          : <img
              src={`${this.props.baseUrl}${e.file}`}
              alt={e.label}
              className={styles.emojiImg}
              {...({ loading: 'lazy' } as any)}
              onError={() => this.setState({ failed: true })}
            />}
      </button>
    );
  }
}

export class EmojiPicker extends React.Component<IEmojiPickerProps, IEmojiPickerState> {
  constructor(props: IEmojiPickerProps) {
    super(props);
    this.state = { query: '' };
  }

  public render(): JSX.Element {
    const q: string = this.state.query.trim().toLowerCase();
    const list: IEmoji[] = q
      ? EMOJI_SET.filter((e: IEmoji) => e.label.toLowerCase().indexOf(q) > -1)
      : EMOJI_SET;

    return (
      <Callout
        target={`#${this.props.targetId}`}
        directionalHint={DirectionalHint.topLeftEdge}
        isBeakVisible={false}
        gapSpace={4}
        onDismiss={this.props.onDismiss}
      >
        <div className={styles.emojiPanel}>
          <input
            className={styles.emojiSearch}
            placeholder="Search emoji"
            value={this.state.query}
            autoFocus={true}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.setState({ query: e.target.value })}
          />
          <div className={styles.emojiGrid}>
            {list.map((e: IEmoji) => (
              <EmojiCell key={e.file} emoji={e} baseUrl={this.props.baseUrl} onPick={this.props.onSelect} />
            ))}
            {list.length === 0 && <div className={styles.emojiEmpty}>No matches</div>}
          </div>
        </div>
      </Callout>
    );
  }
}

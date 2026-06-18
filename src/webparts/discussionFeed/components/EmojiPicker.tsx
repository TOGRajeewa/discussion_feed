import * as React from 'react';
import { Callout, DirectionalHint } from 'office-ui-fabric-react/lib/Callout';
import styles from './DiscussionFeed.module.scss';
import { EMOJI_SET, IEmoji } from './emojiSet';

export interface IEmojiPickerProps {
  targetId: string;
  baseUrl: string;                 // SiteAssets/emoji/ (trailing slash)
  onSelect: (html: string) => void;
  onDismiss: () => void;
}

/** One cell: shows the image, falls back to the Unicode char if it fails to load. */
class EmojiCell extends React.Component<{ emoji: IEmoji; baseUrl: string; onPick: (html: string) => void }, { failed: boolean }> {
  constructor(props: any) { super(props); this.state = { failed: false }; }

  private html(): string {
    const e: IEmoji = this.props.emoji;
    if (this.state.failed || !this.props.baseUrl) { return e.char; }
    return `<img class="df-emoji" src="${this.props.baseUrl}${e.file}" alt="${e.char}" ` +
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
          ? e.char
          : <img
              src={`${this.props.baseUrl}${e.file}`}
              alt={e.char}
              className={styles.emojiImg}
              onError={() => this.setState({ failed: true })}
            />}
      </button>
    );
  }
}

export function EmojiPicker(props: IEmojiPickerProps): JSX.Element {
  return (
    <Callout
      target={`#${props.targetId}`}
      directionalHint={DirectionalHint.topLeftEdge}
      isBeakVisible={false}
      gapSpace={4}
      onDismiss={props.onDismiss}
    >
      <div className={styles.emojiGrid}>
        {EMOJI_SET.map((e: IEmoji) => (
          <EmojiCell key={e.file} emoji={e} baseUrl={props.baseUrl} onPick={props.onSelect} />
        ))}
      </div>
    </Callout>
  );
}

import * as React from 'react';
import { Callout, DirectionalHint } from 'office-ui-fabric-react/lib/Callout';
import styles from './DiscussionFeed.module.scss';

// Offline emoji set (no cloud picker) — covers the common reactions.
const EMOJIS: string[] = [
  '😀', '😄', '😁', '😊', '🙂', '😉', '😍', '😘', '😎', '🤩',
  '🤔', '😐', '😴', '😅', '😂', '🤣', '😭', '😢', '😡', '😱',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👌', '✌️', '🤞',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🔥', '⭐', '🎉', '🎊',
  '✅', '❌', '⚠️', '💡', '📌', '📣', '🚀', '🏆', '🥳', '☕'
];

export interface IEmojiPickerProps {
  targetId: string;
  onSelect: (emoji: string) => void;
  onDismiss: () => void;
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
        {EMOJIS.map((e: string, i: number) => (
          <button
            type="button"
            key={i}
            className={styles.emojiBtn}
            onMouseDown={(ev: React.MouseEvent<HTMLButtonElement>) => { ev.preventDefault(); props.onSelect(e); }}
          >
            {e}
          </button>
        ))}
      </div>
    </Callout>
  );
}

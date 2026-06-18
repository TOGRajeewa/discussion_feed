export interface IEmoji {
  char: string;   // Unicode fallback (shown if the image is missing)
  file: string;   // image filename expected under the emoji base url
  label: string;
}

/**
 * Curated emoji set. Drop matching PNGs (these exact file names) into
 * `assets/emoji/` and upload them to SiteAssets/emoji/. Until an image exists,
 * the picker and posts fall back to the Unicode `char`.
 */
export const EMOJI_SET: IEmoji[] = [
  { char: '😀', file: 'grinning.png', label: 'Grinning' },
  { char: '😄', file: 'smile.png', label: 'Smile' },
  { char: '😁', file: 'grin.png', label: 'Grin' },
  { char: '😂', file: 'joy.png', label: 'Joy' },
  { char: '🤣', file: 'rofl.png', label: 'Rolling' },
  { char: '😊', file: 'blush.png', label: 'Blush' },
  { char: '😉', file: 'wink.png', label: 'Wink' },
  { char: '😍', file: 'heart_eyes.png', label: 'Heart eyes' },
  { char: '😘', file: 'kiss.png', label: 'Kiss' },
  { char: '😎', file: 'sunglasses.png', label: 'Cool' },
  { char: '🤩', file: 'star_struck.png', label: 'Star-struck' },
  { char: '🤔', file: 'thinking.png', label: 'Thinking' },
  { char: '😐', file: 'neutral.png', label: 'Neutral' },
  { char: '😴', file: 'sleeping.png', label: 'Sleeping' },
  { char: '😅', file: 'sweat_smile.png', label: 'Sweat smile' },
  { char: '😢', file: 'cry.png', label: 'Cry' },
  { char: '😭', file: 'sob.png', label: 'Sob' },
  { char: '😡', file: 'angry.png', label: 'Angry' },
  { char: '😱', file: 'scream.png', label: 'Scream' },
  { char: '🥳', file: 'partying.png', label: 'Partying' },
  { char: '👍', file: 'thumbsup.png', label: 'Thumbs up' },
  { char: '👎', file: 'thumbsdown.png', label: 'Thumbs down' },
  { char: '👏', file: 'clap.png', label: 'Clap' },
  { char: '🙌', file: 'raised_hands.png', label: 'Raised hands' },
  { char: '🙏', file: 'pray.png', label: 'Pray' },
  { char: '💪', file: 'muscle.png', label: 'Muscle' },
  { char: '🤝', file: 'handshake.png', label: 'Handshake' },
  { char: '👌', file: 'ok_hand.png', label: 'OK' },
  { char: '✌️', file: 'victory.png', label: 'Victory' },
  { char: '🤞', file: 'crossed_fingers.png', label: 'Fingers crossed' },
  { char: '❤️', file: 'red_heart.png', label: 'Red heart' },
  { char: '🧡', file: 'orange_heart.png', label: 'Orange heart' },
  { char: '💛', file: 'yellow_heart.png', label: 'Yellow heart' },
  { char: '💚', file: 'green_heart.png', label: 'Green heart' },
  { char: '💙', file: 'blue_heart.png', label: 'Blue heart' },
  { char: '💜', file: 'purple_heart.png', label: 'Purple heart' },
  { char: '🔥', file: 'fire.png', label: 'Fire' },
  { char: '⭐', file: 'star.png', label: 'Star' },
  { char: '🎉', file: 'tada.png', label: 'Tada' },
  { char: '🎊', file: 'confetti.png', label: 'Confetti' },
  { char: '✅', file: 'check.png', label: 'Check' },
  { char: '❌', file: 'cross.png', label: 'Cross' },
  { char: '⚠️', file: 'warning.png', label: 'Warning' },
  { char: '💡', file: 'bulb.png', label: 'Idea' },
  { char: '📌', file: 'pushpin.png', label: 'Pin' },
  { char: '📣', file: 'megaphone.png', label: 'Announce' },
  { char: '🚀', file: 'rocket.png', label: 'Rocket' },
  { char: '🏆', file: 'trophy.png', label: 'Trophy' },
  { char: '☕', file: 'coffee.png', label: 'Coffee' }
];

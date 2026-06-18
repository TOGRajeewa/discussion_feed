# Emoji images

Drop one PNG per emoji here, using **exactly these file names**, then upload them
to `SiteAssets/emoji/` (see `provisioning/Upload-Emoji.ps1`).

- Recommended source: Microsoft **Fluent Emoji** (open source, MIT) —
  https://github.com/microsoft/fluentui-emoji — use the "Color" PNGs.
- Square PNGs, ~32–64px, transparent background.
- Until an image exists for a given emoji, the picker and posts automatically
  fall back to the Unicode character, so you can add them incrementally.

The expected file names (must match `src/webparts/discussionFeed/components/emojiSet.ts`):

```
grinning.png    smile.png        grin.png          joy.png           rofl.png
blush.png       wink.png         heart_eyes.png    kiss.png          sunglasses.png
star_struck.png thinking.png     neutral.png       sleeping.png      sweat_smile.png
cry.png         sob.png          angry.png         scream.png        partying.png
thumbsup.png    thumbsdown.png   clap.png          raised_hands.png  pray.png
muscle.png      handshake.png    ok_hand.png       victory.png       crossed_fingers.png
red_heart.png   orange_heart.png yellow_heart.png  green_heart.png   blue_heart.png
purple_heart.png fire.png        star.png          tada.png          confetti.png
check.png       cross.png        warning.png       bulb.png          pushpin.png
megaphone.png   rocket.png       trophy.png        coffee.png
```

To add more emojis: add a row to `emojiSet.ts` (`{ char, file, label }`) and drop the
matching PNG here.

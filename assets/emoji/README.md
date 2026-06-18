# Emoji images

This folder holds the emoji PNGs (e.g. the Microsoft **Fluent Emoji** "3D" set —
open source, MIT: https://github.com/microsoft/fluentui-emoji). Files use the Fluent
names, e.g. `grinning_face_3d.png`, `red_heart_3d.png`, `thumbs_up_3d_default.png`.

The PNGs are **git-ignored** (too many/large to commit). The curated picker list is
`src/webparts/discussionFeed/components/emojiSet.ts`.

## Curate the set (default: top 500 by usefulness)
```powershell
# regenerate emojiSet.ts from whatever PNGs are in this folder
node tools/gen-emojiset.js 500
```
The generator de-dupes skin-tone variants (uses the default tone), drops flags, and
ranks by category (faces → gestures → hearts → animals → food → activities → travel →
objects → symbols → people). Pass a different number to change the count.

## Upload to SharePoint
```powershell
Connect-PnPOnline -Url "https://intranet/sites/CBSL" -CurrentCredentials
.\provisioning\Upload-Emoji.ps1 -SiteUrl "https://intranet/sites/CBSL" -Subfolder "DiscussionFeeds"
```
`Upload-Emoji.ps1` uploads **only the files referenced in `emojiSet.ts`** (not the whole
folder), to `SiteAssets/<Subfolder>/emoji/`. Point the web part's `emojiBaseUrl` there.

Until images exist, the picker/posts fall back to the Unicode character (or the label).

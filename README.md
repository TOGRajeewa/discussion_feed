# Discussion Feed — SPFx 1.4.1 (SharePoint Subscription Edition)

A 100% on-prem, Viva-Engage-style discussion feed. No Microsoft Graph, no Power
Automate, no cloud storage — SharePoint REST + PnPjs v1 + the farm's outgoing SMTP only.

## Stack (pinned to the 1.4.1 era)
| | Version |
|---|---|
| SPFx | 1.4.1 |
| React / ReactDOM | 15.6.2 (class components, no hooks) |
| Fluent UI | `office-ui-fabric-react` 5.21.0 |
| PnPjs | `@pnp/sp` 1.3.11 (`sp.web…`) |
| Editor | **TinyMCE 4.9.11** (native tables) + custom local @mentions |
| Node (build) | 6.x / 8.x LTS — use `nvm` |

> **Why TinyMCE, not Quill:** Quill 1.3 has no robust native table module, and
> "insert table" is a hard requirement. `TinyMceEditor.tsx` uses TinyMCE 4's built-in
> `table` plugin, a `file_picker_callback` + `images_upload_handler` that upload to the
> local asset library, and a hand-rolled @mention callout bound to the local People
> Picker. Every consumer only depends on `(value: string)` HTML, so the editor is swappable.

> **TinyMCE skin must be deployed on-prem (no CDN).** After `npm install`, upload
> `node_modules/tinymce/skins/lightgray` to `SiteAssets/tinymce/skins/lightgray`
> (see step 1b) and point the web part's **TinyMCE skin URL** property at it.

## 1. Provision the backing store
```powershell
Connect-PnPOnline -Url "https://intranet/sites/Intranet" -CurrentCredentials
.\provisioning\Provision-Lists.ps1 -SiteUrl "https://intranet/sites/Intranet"
```
Creates: `DiscussionPosts`, `DiscussionComments`, `FeedImages` (asset library).
Confirm **Central Admin → Outgoing E-Mail Settings** is set for @mention notifications.

### 1b. Deploy the TinyMCE skin (on-prem, no CDN)
```powershell
npm install   # populates node_modules/tinymce/skins/lightgray
.\provisioning\Upload-TinyMceSkin.ps1 -SiteUrl "https://intranet/sites/Intranet"
```
Then set the **TinyMCE skin URL** property to
`/sites/Intranet/SiteAssets/tinymce/skins/lightgray`.

## 2. Build & package
```powershell
nvm use 8
npm install
gulp serve                 # local workbench
gulp bundle --ship && gulp package-solution --ship   # -> sharepoint/solution/*.sppkg
```
Upload the `.sppkg` to the **on-prem App Catalog**, deploy, then add the
**Discussion Feed** web part to a page and set the list/library names in the property pane.

## Architecture
```
DiscussionFeedWebPart (onInit -> configurePnP)
  └─ DiscussionFeed            container: owns state + all PnP I/O
       ├─ PostSubmitBox        sticky composer (category dropdown + Post)
       │    └─ TinyMceEditor   TinyMCE 4 (tables) + local @mention callout + asset-library image upload
       └─ FeedList             ThreadCard[] + "Load more" (server-side getPaged)
            └─ ThreadCard       CardHeader (Persona+badge) · body · EngagementBar · CommentThread
```

### Service responsibilities
| File | Does |
|---|---|
| `services/FeedService.ts` | posts/comments CRUD, likes toggle, mention resolve + email trigger |
| `services/UploadService.ts` | image → local asset library, returns server-relative URL |
| `services/PeopleService.ts` | `ClientPeoplePickerSearchUser` (local, **not** Graph) |
| `services/MailService.ts` | `sp.utility.sendEmail` → farm SMTP |
| `services/utils.ts` | DOMPurify sanitize, relative time, initials, local userphoto URL |

## Classic pages — standalone bundle (no app infrastructure)
For classic on-prem sites where the SharePoint Add-in (app) infrastructure is **off**
(no app DNS domain / App Management service), use the standalone bundle instead of the
`.sppkg`. It renders the *same* React feed via a Script Editor Web Part, bootstrapping
PnPjs from the classic page context — no app model, no per-site install.

```powershell
nvm use 8.17.0
npm install
npm run build:standalone        # -> dist-standalone/ (bundle + Fabric fonts + TinyMCE skin)

# upload everything to SiteAssets (preserves folder structure)
Connect-PnPOnline -Url "https://intranet/sites/CBSL" -CurrentCredentials
.\provisioning\Upload-Standalone.ps1 -SiteUrl "https://intranet/sites/CBSL"
```

Then edit a classic page → add a **Script Editor Web Part** → paste
[provisioning/classic-script-editor-snippet.html](provisioning/classic-script-editor-snippet.html)
(adjust the `<script src>` site path) → Save.

What gets hosted in `SiteAssets/`:
| Path | Purpose |
|---|---|
| `discussion-feed.bundle.js` | the whole app (React + Fluent + TinyMCE + PnPjs), one file |
| `fabric-icons/*.woff` | Fluent icon fonts served **locally** (never the cloud CDN) |
| `tinymce/skins/lightgray/**` | editor skin |

Requires **Custom Script enabled** on the site collection. No property pane — configure
via the snippet's `render({...})` options.

## Unit tests
A standalone Jest harness (separate from the legacy `gulp test` Karma chain) runs on
modern Node — no farm, no SPFx toolchain needed. SP/native modules are stubbed
(`test/stubs/`), so tests exercise our own logic: the People Picker double-JSON-parse,
initials/relative-time helpers, and the local `userphoto.aspx` URL builder.

```powershell
npm install           # (or just the test devDeps) on any recent Node
npm run test:unit     # 14 tests across 2 suites
```

## Security
All stored editor HTML is sanitized with **DOMPurify** before
`dangerouslySetInnerHTML`. People-column writes use the `FieldNameId: { results: [...] }`
form. Email is best-effort and never blocks a save.

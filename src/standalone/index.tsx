// Standalone (classic-page) entry point. Bundled by webpack.standalone.js into a
// single self-contained JS file that renders the SAME React feed used by the SPFx
// web part — no SPFx runtime, no app infrastructure. Loaded via a Script Editor /
// Content Editor Web Part on a classic page.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { initializeIcons } from 'office-ui-fabric-react/lib/Icons';
import { sp } from '@pnp/sp';

import DiscussionFeed from '../webparts/discussionFeed/components/DiscussionFeed';
import { ClassicHttpClient } from './ClassicHttpClient';

export interface IClassicConfig {
  containerId: string;
  postsListTitle?: string;
  commentsListTitle?: string;
  likesListTitle?: string;
  departmentsListTitle?: string;
  assetLibraryServerRelUrl?: string;
  tinymceSkinUrl?: string;
  fabricIconBaseUrl?: string;
  emojiBaseUrl?: string;
  pageSize?: number;
}

function ctx(): any {
  return (window as any)._spPageContextInfo || {};
}

/**
 * Global entry called from the Script Editor snippet:
 *   DiscussionFeedApp.render({ containerId: 'discussionFeedRoot' });
 */
export function render(cfg: IClassicConfig): void {
  mount(cfg, 'feed');
}

/**
 * Review queue on its own, for the admin page:
 *   DiscussionFeedApp.renderModeration({ containerId: 'feedModerationRoot' });
 *
 * Same bundle, so there is still one file to deploy. Renders a "no permission"
 * message for anyone who is not an approver — and would show them an empty
 * queue in any case, since SharePoint does not return pending items to them.
 */
export function renderModeration(cfg: IClassicConfig): void {
  mount(cfg, 'moderation');
}

function mount(cfg: IClassicConfig, mode: 'feed' | 'moderation'): void {
  const c: any = ctx();
  const webUrl: string = c.webAbsoluteUrl || window.location.protocol + '//' + window.location.host;
  const webRel: string = c.webServerRelativeUrl || '';

  // Register Fabric icons from a LOCAL folder (SiteAssets) — never the cloud CDN.
  initializeIcons(cfg.fabricIconBaseUrl || (webRel + '/SiteAssets/fabric-icons/'));

  // PnPjs v1 against the current web; digests are handled per-request.
  sp.setup({
    sp: {
      baseUrl: webUrl,
      headers: { Accept: 'application/json;odata=verbose' }
    }
  });

  const feedConfig: any = {
    webUrl: webUrl,
    postsListTitle: cfg.postsListTitle || 'DiscussionPosts',
    commentsListTitle: cfg.commentsListTitle || 'DiscussionComments',
    likesListTitle: cfg.likesListTitle || 'DiscussionLikes',
    departmentsListTitle: cfg.departmentsListTitle || 'Departments',
    assetLibraryServerRelUrl: cfg.assetLibraryServerRelUrl || (webRel + '/SiteAssets'),
    tinymceSkinUrl: cfg.tinymceSkinUrl || (webRel + '/SiteAssets/tinymce/skins/lightgray'),
    emojiBaseUrl: cfg.emojiBaseUrl || (webRel + '/SiteAssets/emoji/'),
    pageSize: cfg.pageSize || 20
  };

  const el: HTMLElement = document.getElementById(cfg.containerId);
  if (!el) {
    // eslint-disable-next-line no-console
    console.error('[DiscussionFeed] container not found: #' + cfg.containerId);
    return;
  }

  ReactDOM.render(
    React.createElement(DiscussionFeed as any, {
      config: feedConfig,
      spHttpClient: new ClassicHttpClient(webUrl),
      pageUrl: window.location.href.split('#')[0],
      mode
    }),
    el
  );
}

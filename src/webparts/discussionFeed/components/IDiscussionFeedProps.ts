import { SPHttpClient } from '@microsoft/sp-http';
import { IFeedConfig } from '../models';
import { IFeedKind } from './feedKinds';

export interface IDiscussionFeedProps {
  config: IFeedConfig;
  spHttpClient: SPHttpClient;
  /** Page shared "#post=<id>" links point to (no hash). */
  pageUrl: string;
  /**
   * 'moderation' opens on the review queue and hides the composer and feed —
   * used by the standalone renderModeration() entry point so a queue can be
   * mounted on the admin page. Ignored for a user who cannot moderate.
   */
  mode?: 'feed' | 'moderation';
  /** Which feed this is: Social Corner (the default) or the Market Place. */
  kind?: IFeedKind;
  /** Rendered at the top of the feed: the Social Corner / Market Place switch. */
  topBar?: JSX.Element;
}

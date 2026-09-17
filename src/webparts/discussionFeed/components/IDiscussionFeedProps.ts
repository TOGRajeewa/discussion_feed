import { SPHttpClient } from '@microsoft/sp-http';
import { IFeedConfig } from '../models';

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
}

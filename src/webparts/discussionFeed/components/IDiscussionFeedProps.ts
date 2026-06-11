import { SPHttpClient } from '@microsoft/sp-http';
import { IFeedConfig } from '../models';

export interface IDiscussionFeedProps {
  config: IFeedConfig;
  spHttpClient: SPHttpClient;
  pageUrl: string;
}

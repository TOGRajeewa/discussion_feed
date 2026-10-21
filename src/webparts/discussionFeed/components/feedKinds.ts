import { ICategoryDef, CATEGORY_DEFS, MARKET_CATEGORY_DEFS } from './categories';
import { IMentionMail, SOCIAL_MENTION_MAIL } from '../services/MailService';

export type FeedKindKey = 'social' | 'market';

/**
 * What differs between the two feeds in the "Social Corner & Market Place"
 * section. Cards, likes, comments and sharing are the same code; each feed
 * reads its own SharePoint lists, so their posts never mix.
 */
export interface IFeedKind {
  key: FeedKindKey;
  /** Tab label and icon. */
  label: string;
  iconName: string;
  /**
   * Posts go through content approval: "Submit for review", a Pending review
   * tab for approvers, and a department is required to route each post.
   */
  moderated: boolean;
  /**
   * Posts flagged Expired (by Expire-SocialPosts.ps1, 60 days after they were
   * published) are hidden. They stay in the list.
   */
  expires: boolean;
  /** Authors may delete their own posts and comments. Super Admins always can. */
  authorsDelete: boolean;
  /** Offer the All posts / My posts filter. */
  mineFilter: boolean;
  categories: ICategoryDef[];
  /** Placeholder of the collapsed composer. */
  prompt: string;
  /**
   * Share links are <page>#<hashKey>=<id>. Each feed needs its own key: the
   * two posts lists both number their items from 1.
   */
  hashKey: string;
  /** Element id prefix of a post card, unique per feed for the same reason. */
  cardIdPrefix: string;
  mail: IMentionMail;
}

export const SOCIAL_KIND: IFeedKind = {
  key: 'social',
  label: 'Social Corner',
  iconName: 'People',
  moderated: true,
  expires: true,
  authorsDelete: false,
  mineFilter: false,
  categories: CATEGORY_DEFS,
  prompt: 'Share thoughts, ideas, or updates',
  hashKey: 'post',
  cardIdPrefix: 'df-post-',
  mail: SOCIAL_MENTION_MAIL
};

export const MARKET_KIND: IFeedKind = {
  key: 'market',
  label: 'Market Place',
  iconName: 'Shop',
  moderated: false,
  expires: false,
  authorsDelete: true,
  mineFilter: true,
  categories: MARKET_CATEGORY_DEFS,
  prompt: 'What are you selling or looking for?',
  hashKey: 'market',
  cardIdPrefix: 'df-market-post-',
  mail: {
    subject: 'You were mentioned in the Market Place',
    intro: 'You were mentioned in a Market Place post:',
    linkText: 'Open the post'
  }
};

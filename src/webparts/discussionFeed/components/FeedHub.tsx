import * as React from 'react';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';
import DiscussionFeed from './DiscussionFeed';
import { IFeedKind, FeedKindKey, SOCIAL_KIND, MARKET_KIND } from './feedKinds';
import { IFeedConfig } from '../models';
import { idFromHash } from '../services/utils';

export interface IFeedHubProps {
  socialConfig: IFeedConfig;
  /** The Market Place's lists; null leaves Social Corner on its own, with no switch. */
  marketConfig: IFeedConfig;
  spHttpClient: any;
  /** Page shared links point to (no hash). */
  pageUrl: string;
}

export interface IFeedHubState {
  tab: FeedKindKey;
  /** Tabs opened so far. A feed loads the first time its tab is opened. */
  opened: { [key: string]: boolean };
}

// Per browser, so "View all" opens the full page on the tab the viewer was using.
const TAB_STORAGE_KEY: string = 'cbsl.socialCorner.tab';

function storedTab(): FeedKindKey {
  try {
    const v: string = window.localStorage.getItem(TAB_STORAGE_KEY);
    return v === 'market' || v === 'social' ? v as FeedKindKey : null;
  } catch (e) {
    return null;
  }
}

function storeTab(tab: FeedKindKey): void {
  try { window.localStorage.setItem(TAB_STORAGE_KEY, tab); } catch (e) { /* private window: not remembered */ }
}

/** A share link decides the tab; otherwise the viewer's last one, else Social Corner. */
function tabFromHash(): FeedKindKey {
  if (idFromHash(MARKET_KIND.hashKey)) { return 'market'; }
  if (idFromHash(SOCIAL_KIND.hashKey)) { return 'social'; }
  return null;
}

/**
 * The "Social Corner & Market Place" section: two separate feeds behind one
 * switch. Each reads its own lists, so the posts never mix, and each keeps its
 * state while the other is showing.
 */
export default class FeedHub extends React.Component<IFeedHubProps, IFeedHubState> {
  constructor(props: IFeedHubProps) {
    super(props);
    const tab: FeedKindKey = props.marketConfig ? (tabFromHash() || storedTab() || 'social') : 'social';
    this.state = { tab, opened: { [tab]: true } };
  }

  public componentDidMount(): void {
    window.addEventListener('hashchange', this.onHashChange);
  }

  public componentWillUnmount(): void {
    window.removeEventListener('hashchange', this.onHashChange);
  }

  /** A share link opened in the same tab switches to its feed. */
  private onHashChange = (): void => {
    const tab: FeedKindKey = this.props.marketConfig ? tabFromHash() : null;
    if (tab) { this.select(tab, false); }
  }

  private select(tab: FeedKindKey, remember: boolean): void {
    if (remember) { storeTab(tab); }
    this.setState({ tab, opened: { ...this.state.opened, [tab]: true } });
  }

  private renderSwitch(): JSX.Element {
    if (!this.props.marketConfig) { return null; }
    return (
      <div className={styles.hubTabs} role="tablist">
        {[SOCIAL_KIND, MARKET_KIND].map((k: IFeedKind) => (
          <button
            type="button"
            role="tab"
            key={k.key}
            aria-selected={this.state.tab === k.key}
            className={`${styles.hubTab} ${this.state.tab === k.key ? styles.hubTabActive : ''}`}
            onClick={() => this.select(k.key, true)}
          >
            <Icon iconName={k.iconName} />
            <span>{k.label}</span>
          </button>
        ))}
      </div>
    );
  }

  public render(): JSX.Element {
    const topBar: JSX.Element = this.renderSwitch();
    const feed = (kind: IFeedKind, config: IFeedConfig): JSX.Element =>
      this.state.opened[kind.key]
        ? <div key={kind.key} style={{ display: this.state.tab === kind.key ? '' : 'none' }}>
            <DiscussionFeed
              config={config}
              spHttpClient={this.props.spHttpClient}
              pageUrl={this.props.pageUrl}
              mode="feed"
              kind={kind}
              topBar={topBar}
            />
          </div>
        : null;

    return (
      <div>
        {feed(SOCIAL_KIND, this.props.socialConfig)}
        {this.props.marketConfig && feed(MARKET_KIND, this.props.marketConfig)}
      </div>
    );
  }
}

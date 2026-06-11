import * as React from 'react';
import { Dropdown, IDropdownOption } from 'office-ui-fabric-react/lib/Dropdown';
import { PrimaryButton } from 'office-ui-fabric-react/lib/Button';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import { SPHttpClient } from '@microsoft/sp-http';
import styles from './DiscussionFeed.module.scss';
import { Avatar } from './Avatar';
import { TinyMceEditor } from './TinyMceEditor';
import { ICurrentUser, IMentionUser, IPostDraft, PostCategory, IFeedConfig } from '../models';
import { stripHtml } from '../services/utils';

export interface IPostSubmitBoxProps {
  currentUser: ICurrentUser;
  config: IFeedConfig;
  spHttpClient: SPHttpClient;
  onSubmit: (draft: IPostDraft) => Promise<void>;
}

interface IPostSubmitBoxState {
  expanded: boolean;
  html: string;
  category: PostCategory;
  mentions: IMentionUser[];
  submitting: boolean;
}

const CATEGORY_OPTIONS: IDropdownOption[] = [
  { key: 'Discussion', text: 'Discussion' },
  { key: 'Praise', text: 'Praise' },
  { key: 'Question', text: 'Question' }
];

export class PostSubmitBox extends React.Component<IPostSubmitBoxProps, IPostSubmitBoxState> {
  constructor(props: IPostSubmitBoxProps) {
    super(props);
    this.state = { expanded: false, html: '', category: 'Discussion', mentions: [], submitting: false };
  }

  private submit = async (): Promise<void> => {
    if (!stripHtml(this.state.html)) { return; }
    this.setState({ submitting: true });
    try {
      await this.props.onSubmit({
        html: this.state.html,
        category: this.state.category,
        mentions: this.state.mentions
      });
      this.setState({ expanded: false, html: '', category: 'Discussion', mentions: [], submitting: false });
    } catch (e) {
      this.setState({ submitting: false });
    }
  }

  public render(): JSX.Element {
    const canPost: boolean = !!stripHtml(this.state.html) && !this.state.submitting;

    return (
      <div className={`${styles.card} ${styles.submitBox}`}>
        <div className={styles.submitRow}>
          <Avatar name={this.props.currentUser.title} picUrl={this.props.currentUser.picUrl} />

          <div className={styles.submitInputWrap}>
            {this.state.expanded
              ? <TinyMceEditor
                  value={this.state.html}
                  spHttpClient={this.props.spHttpClient}
                  webUrl={this.props.config.webUrl}
                  assetLibraryServerRelUrl={this.props.config.assetLibraryServerRelUrl}
                  skinUrl={this.props.config.tinymceSkinUrl}
                  onChange={(html: string) => this.setState({ html })}
                  onMentionsChange={(mentions: IMentionUser[]) => this.setState({ mentions })}
                />
              : <div
                  className={styles.submitPlaceholder}
                  onClick={() => this.setState({ expanded: true })}
                >
                  Share an update, ask a question, or praise a colleague…
                </div>
            }
          </div>
        </div>

        {this.state.expanded &&
          <div className={styles.submitToolbar}>
            <div className={styles.submitTools}>
              <Icon iconName="Attach" title="Insert image" />
              <Dropdown
                options={CATEGORY_OPTIONS}
                selectedKey={this.state.category}
                onChanged={(o: IDropdownOption) => this.setState({ category: o.key as PostCategory })}
                styles={{ root: { minWidth: 140 } }}
              />
            </div>
            <PrimaryButton
              className={styles.postButton}
              text={this.state.submitting ? 'Posting…' : 'Post'}
              disabled={!canPost}
              onClick={this.submit}
            />
          </div>
        }
      </div>
    );
  }
}

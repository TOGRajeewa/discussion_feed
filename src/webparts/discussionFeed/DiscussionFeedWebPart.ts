import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  BaseClientSideWebPart,
  IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneSlider
} from '@microsoft/sp-webpart-base';

import * as strings from 'DiscussionFeedWebPartStrings';
import DiscussionFeed from './components/DiscussionFeed';
import { IDiscussionFeedProps } from './components/IDiscussionFeedProps';
import { configurePnP } from './services/PnPConfig';
import { IFeedConfig } from './models';

export interface IDiscussionFeedWebPartProps {
  postsListTitle: string;
  commentsListTitle: string;
  assetLibraryServerRelUrl: string;
  tinymceSkinUrl: string;
  emojiBaseUrl: string;
  pageSize: number;
}

export default class DiscussionFeedWebPart extends BaseClientSideWebPart<IDiscussionFeedWebPartProps> {

  protected onInit(): Promise<void> {
    configurePnP(this.context);
    return Promise.resolve();
  }

  public render(): void {
    const config: IFeedConfig = {
      webUrl: this.context.pageContext.web.absoluteUrl,
      postsListTitle: this.properties.postsListTitle || 'DiscussionPosts',
      commentsListTitle: this.properties.commentsListTitle || 'DiscussionComments',
      assetLibraryServerRelUrl:
        this.properties.assetLibraryServerRelUrl ||
        `${this.context.pageContext.web.serverRelativeUrl}/FeedImages`.replace('//', '/'),
      tinymceSkinUrl:
        this.properties.tinymceSkinUrl ||
        `${this.context.pageContext.web.serverRelativeUrl}/SiteAssets/tinymce/skins/lightgray`.replace('//', '/'),
      emojiBaseUrl:
        this.properties.emojiBaseUrl ||
        `${this.context.pageContext.web.serverRelativeUrl}/SiteAssets/emoji/`.replace('//', '/'),
      pageSize: this.properties.pageSize || 20
    };

    const element: React.ReactElement<IDiscussionFeedProps> = React.createElement(
      DiscussionFeed,
      {
        config,
        spHttpClient: this.context.spHttpClient,
        pageUrl: window.location.href.split('#')[0]
      }
    );

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [{
        header: { description: strings.PropertyPaneDescription },
        groups: [{
          groupName: strings.BasicGroupName,
          groupFields: [
            PropertyPaneTextField('postsListTitle', { label: strings.PostsListLabel }),
            PropertyPaneTextField('commentsListTitle', { label: strings.CommentsListLabel }),
            PropertyPaneTextField('assetLibraryServerRelUrl', { label: strings.AssetLibLabel }),
            PropertyPaneTextField('tinymceSkinUrl', { label: strings.SkinUrlLabel }),
            PropertyPaneTextField('emojiBaseUrl', { label: strings.EmojiUrlLabel }),
            PropertyPaneSlider('pageSize', { label: strings.PageSizeLabel, min: 5, max: 50, step: 5 })
          ]
        }]
      }]
    };
  }
}

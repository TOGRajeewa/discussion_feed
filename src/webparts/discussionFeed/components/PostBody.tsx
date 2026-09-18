import * as React from 'react';
import styles from './DiscussionFeed.module.scss';
import { IPost, IMentionUser } from '../models';
import { sanitize, splitBodyImages, stripHtml } from '../services/utils';

/**
 * A post's body: the text, then "with @Name, @Name" for the people picked in
 * "@mention people", then any attached images. The mentions come from the
 * MentionedUsers column, not the body, so posts saved before this was shown
 * display them too.
 */
export const PostBody: React.StatelessComponent<{ post: IPost }> = (props: { post: IPost }): JSX.Element => {
  const p: IPost = props.post;
  const parts: { text: string; images: string } = splitBodyImages(sanitize(p.bodyHtml));

  // Praise already names its people in the body ("Praise for @Name"); don't
  // list them a second time.
  const bodyText: string = p.category === 'Praise' ? stripHtml(parts.text) : '';
  const mentions: IMentionUser[] = (p.mentions || [])
    .filter((m: IMentionUser) => !bodyText || bodyText.indexOf(`@${m.title}`) < 0);

  return (
    <div className={styles.body}>
      <div dangerouslySetInnerHTML={{ __html: parts.text }} />
      {mentions.length > 0 &&
        <div className={styles.mentionLine}>
          with {mentions.map((m: IMentionUser, i: number) => (
            <span key={m.loginName || m.title}>
              {i > 0 && ', '}
              <span className={styles.mention}>@{m.title}</span>
            </span>
          ))}
        </div>}
      {parts.images && <div dangerouslySetInnerHTML={{ __html: parts.images }} />}
    </div>
  );
};

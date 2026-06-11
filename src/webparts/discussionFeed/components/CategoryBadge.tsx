import * as React from 'react';
import styles from './DiscussionFeed.module.scss';
import { PostCategory } from '../models';

export function CategoryBadge(props: { category: PostCategory }): JSX.Element {
  const map: { [k: string]: string } = {
    Discussion: styles.badgeDiscussion,
    Praise: styles.badgePraise,
    Question: styles.badgeQuestion
  };
  return (
    <span className={`${styles.badge} ${map[props.category] || styles.badgeDiscussion}`}>
      {props.category}
    </span>
  );
}

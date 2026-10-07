import * as React from 'react';
import styles from './DiscussionFeed.module.scss';
import { categoryDef, ICategoryDef } from './categories';
import { PostCategory } from '../models';

/** `categories` supplies the feed's own labels: "Post" for Discussion in the Market Place. */
export function CategoryBadge(props: { category: PostCategory; categories?: ICategoryDef[] }): JSX.Element {
  const map: { [k: string]: string } = {
    Discussion: styles.badgeDiscussion,
    Praise: styles.badgePraise,
    Question: styles.badgeQuestion
  };
  const label: string = props.categories ? categoryDef(props.category, props.categories).label : props.category;
  return (
    <span className={`${styles.badge} ${map[props.category] || styles.badgeDiscussion}`}>
      {label}
    </span>
  );
}

import * as React from 'react';
import styles from './DiscussionFeed.module.scss';
import { Avatar } from './Avatar';
import { CategoryBadge } from './CategoryBadge';
import { timeAgo } from '../services/utils';
import { PostCategory } from '../models';

export interface ICardHeaderProps {
  name: string;
  dept: string;
  picUrl: string;
  created: string;
  category: PostCategory;
}

export function CardHeader(props: ICardHeaderProps): JSX.Element {
  const meta: string = `${props.dept ? props.dept + ' • ' : ''}${timeAgo(props.created)}`;
  return (
    <div className={styles.cardHeader}>
      <Avatar name={props.name} picUrl={props.picUrl} />
      <div className={styles.headerText}>
        <span className={styles.authorName}>{props.name}</span>
        <span className={styles.metaLine}>{meta}</span>
      </div>
      <CategoryBadge category={props.category} />
    </div>
  );
}

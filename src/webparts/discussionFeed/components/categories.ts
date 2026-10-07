import { PostCategory } from '../models';

export interface ICategoryDef {
  key: PostCategory;
  label: string;
  iconName: string;       // Fluent icon
  color: string;          // accent / expanded border
  badgeBg: string;
  badgeColor: string;
  bodyPlaceholder: string;        // main rich-text placeholder
  titlePlaceholder?: string;      // Question: the required title line
  titleMax?: number;
  peoplePlaceholder?: string;     // Praise: "Who do you want to praise?"
  submitLabel: string;
}

export const CATEGORY_DEFS: ICategoryDef[] = [
  {
    key: 'Discussion',
    label: 'Discussion',
    iconName: 'Chat',
    color: '#d35400',
    badgeBg: '#eef2fb', badgeColor: '#3a55a3',
    bodyPlaceholder: 'Share thoughts, ideas, or updates',
    submitLabel: 'Post'
  },
  {
    key: 'Question',
    label: 'Question',
    iconName: 'Unknown',
    color: '#2b88d8',
    badgeBg: '#eaf1fb', badgeColor: '#2b88d8',
    titlePlaceholder: 'Ask a question (required)',
    titleMax: 150,
    bodyPlaceholder: 'Add details (optional)',
    submitLabel: 'Ask'
  },
  {
    key: 'Praise',
    label: 'Praise',
    iconName: 'Ribbon',
    color: '#8764b8',
    badgeBg: '#f3eefb', badgeColor: '#8764b8',
    peoplePlaceholder: 'Who do you want to praise?',
    bodyPlaceholder: "Share what they've done.",
    submitLabel: 'Praise'
  }
];

/**
 * Market Place post types: no Praise, and "Discussion" is labelled "Post" --
 * it is what staff use to advertise. Only the label changes; the stored
 * Category value is still "Discussion".
 */
export const MARKET_CATEGORY_DEFS: ICategoryDef[] = [
  {
    ...CATEGORY_DEFS[0],
    label: 'Post',
    bodyPlaceholder: 'What are you selling or offering? Add the price and how to reach you.',
    submitLabel: 'Post'
  },
  {
    ...CATEGORY_DEFS[1],
    titlePlaceholder: 'What are you looking for? (required)',
    submitLabel: 'Post'
  }
];

export function categoryDef(key: PostCategory, defs: ICategoryDef[] = CATEGORY_DEFS): ICategoryDef {
  return defs.filter((c: ICategoryDef) => c.key === key)[0] || defs[0];
}

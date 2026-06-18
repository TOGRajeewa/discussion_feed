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
    iconName: 'OfficeChat',
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

export function categoryDef(key: PostCategory): ICategoryDef {
  return CATEGORY_DEFS.filter((c: ICategoryDef) => c.key === key)[0] || CATEGORY_DEFS[0];
}

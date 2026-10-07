import { CATEGORY_DEFS, MARKET_CATEGORY_DEFS, categoryDef } from '../../src/webparts/discussionFeed/components/categories';

describe('Market Place post types', () => {
  it('offer Post and Question, and no Praise', () => {
    expect(MARKET_CATEGORY_DEFS.map(c => c.label)).toEqual(['Post', 'Question']);
    // Stored values are unchanged: "Post" is a Discussion with another label.
    expect(MARKET_CATEGORY_DEFS.map(c => c.key)).toEqual(['Discussion', 'Question']);
  });
  it('leave Social Corner as it was', () => {
    expect(categoryDef('Discussion', MARKET_CATEGORY_DEFS).label).toBe('Post');
    expect(categoryDef('Discussion').label).toBe('Discussion');
    expect(CATEGORY_DEFS.map(c => c.label)).toEqual(['Discussion', 'Question', 'Praise']);
  });
});
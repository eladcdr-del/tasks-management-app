// owner: step 4.1 — only that step edits this file
// Memory screen (#/memory): search, filters, month groups, empty state.

export const memory = {
  title: 'זיכרון הבית',
  subtitle: 'כל מה שעשינו, מתי, איפה וכמה עלה',
  searchLabel: 'חיפוש בזיכרון הבית',
  searchPlaceholder: 'מתי החלפנו מצבר?',
  clearSearch: 'ניקוי החיפוש',
  filters: 'סינון',
  categories: 'קטגוריות',
  members: 'מי עשה',
  allCategories: 'הכל',
  results: (n: number) => (n === 1 ? 'נמצאה משימה אחת' : `נמצאו ${n} משימות`),
  loadMore: 'להציג משימות ישנות יותר',
  loadingMore: 'טוען עוד…',
  emptyTitle: 'הזיכרון עוד ריק',
  emptyBody: 'כל משימה שתסתיים תישמר כאן, עם מי עשה, מתי וכמה עלה.',
  noMatchTitle: 'לא מצאנו',
  /** No results: a search word and a category / member chip are both set. */
  noMatchBody: 'נסו מילה אחרת, או בטלו את הסינון.',
  /** No results for a search word alone (the button is clearSearch). */
  noMatchSearch: 'נסו לחפש במילה אחרת.',
  /** No results for the chips alone. */
  noMatchFilter: 'אין משימות שמתאימות לסינון הזה.',
  clearFilters: 'ביטול הסינון',
  photo: 'תמונה',
  photoMissing: 'התמונה לא נמצאה',
  photos: (n: number) => (n === 1 ? 'תמונה' : `${n} תמונות`),
  /** Card meta: "דני · 3 באוגוסט" — who did it (the avatar is next to it). */
  doneBy: (name: string, date: string) => `${name} · ${date}`
} as const;

// owner: step 3.1 — only that step edits this file
// (Built in 3.1; formerly reserved for 4.3.)
// Household screen (#/household): members, invite card, leaving.

import { gendered } from '../gender';

const plural = (n: number, one: string, many: (n: number) => string) => (n === 1 ? one : many(n));

export const household = {
  title: 'הבית שלנו',
  settings: 'הגדרות',
  membersTitle: 'בני הבית',
  me: gendered('זו אני', 'זה אני', 'זה אני'),
  openCount: (n: number) =>
    n === 0 ? 'אין משימות פתוחות' : plural(n, 'משימה פתוחה אחת', (k) => `${k} משימות פתוחות`),
  editMe: 'עריכת הפרטים שלי',
  editMeTitle: 'הפרטים שלי',
  nameLabel: 'השם שלי',
  houseNameLabel: 'שם הבית',
  editHouseName: 'שינוי שם הבית',
  saved: 'נשמר',
  invite: {
    title: 'להזמין לבית',
    body: 'שולחים קישור בוואטסאפ, ומי שמקבל אותו מצטרף בלחיצה.',
    create: 'הזמנה בוואטסאפ',
    resend: 'שליחה שוב',
    copy: 'העתקה',
    copied: 'הקישור הועתק',
    revoke: 'ביטול קישור',
    revoked: 'הקישור בוטל',
    linkLabel: 'קישור ההזמנה',
    full: 'הבית מלא. אפשר עד שישה בני בית.',
    capacity: (left: number) =>
      plural(left, 'נשאר מקום פנוי אחד', (k) => `נשארו ${k} מקומות פנויים`),
    shareTitle: 'הזמנה ל-HomeCare',
    shareText: (house: string) =>
      `הזמנתי אותך להצטרף ל״${house}״ ב-HomeCare, הרשימה המשותפת שלנו לכל מה שצריך לעשות בבית. מצטרפים כאן:`
  },
  leave: 'יציאה מהבית',
  leaveTitle: 'לצאת מהבית?',
  leaveBody: 'המשימות נשארות אצל שאר בני הבית. כדי לחזור תצטרכו קישור הזמנה חדש.',
  leaveConfirm: 'יציאה'
} as const;

// owner: step 3.1 — only that step edits this file
// Welcome / sign-in, profile, household, install and join screens, including their error copy
// (sign-in failures, join: expired / revoked / full / not-found). The notifications step is 5.1's
// (onboardingNotifications.ts).

import { gendered } from '../gender';

/** "מ" + a name: attached to Hebrew ("ממיכל"), hyphenated before anything else ("מ-Dana"). */
const from = (name: string) => (/^[֐-׿]/.test(name) ? `מ${name}` : `מ-${name}`);

export const onboarding = {
  welcome: {
    title: 'הבית, מסודר ביחד',
    valueProp: 'רשימה אחת משותפת לכל מה שצריך לעשות בבית: רואים מה פתוח, מי לוקח, ומה כבר נעשה.',
    signIn: 'כניסה עם Google',
    privacy: 'הנתונים נשמרים רק בפרויקט ה-Firebase של המשפחה.',
    errorTitle: 'ההתחברות לא הצליחה'
  },
  profile: {
    title: 'נעים להכיר',
    subtitle: 'ככה נדע איך לפנות אליך ובאיזה צבע לסמן את המשימות שלך.',
    nameLabel: 'איך קוראים לך?',
    nameError: 'צריך שם, אפילו קצר',
    addressLabel: 'איך לפנות אליך?',
    addressF: 'את',
    addressM: 'אתה',
    addressFExample: '״את לוקחת״',
    addressMExample: '״אתה לוקח״',
    addressError: 'בחרו איך לפנות אליכם',
    colorLabel: 'הצבע שלך',
    continue: 'המשך'
  },
  household: {
    title: 'איך נקרא לבית?',
    subtitle: 'זה השם שכל בני הבית יראו. אפשר לשנות אותו אחר כך.',
    nameLabel: 'שם הבית',
    defaultName: 'הבית שלנו',
    create: 'יצירת הבית',
    or: 'או',
    haveInvite: 'יש לי קישור הזמנה',
    inviteLabel: 'הקישור או הקוד מההזמנה',
    invitePlaceholder: 'הדביקו כאן',
    inviteGo: 'להצטרפות',
    inviteInvalid: 'זה לא נראה כמו קישור הזמנה. נסו להעתיק אותו שוב מההודעה.',
    editMe: 'עריכה',
    errorTitle: 'לא הצלחנו ליצור את הבית'
  },
  install: {
    title: 'התקנה למסך הבית',
    body: 'עם אייקון במסך הבית, HomeCare נפתחת כמו כל אפליקציה: במסך מלא, בלי כתובת ובלי לחפש.',
    install: 'התקנה',
    installed: 'האפליקציה מותקנת. אפשר לפתוח אותה מהמסך הבית.',
    manualTitle: 'ככה מתקינים בכרום באנדרואיד:',
    manualSteps: [
      'פותחים את התפריט ⋮ בפינת המסך',
      'בוחרים ״הוספה למסך הבית״ או ״התקנת אפליקציה״',
      'מאשרים, וזהו'
    ],
    later: 'אחר כך',
    continue: 'המשך'
  },
  join: {
    title: 'הצטרפות לבית',
    loading: 'בודקים את ההזמנה…',
    invitedBy: (inviter: string, house: string) => `הזמנה ${from(inviter)} להצטרף ל׳${house}׳`,
    pitch: 'אחרי ההצטרפות תראו את אותה רשימה, ותוכלו לקחת משימות ולבקש עזרה.',
    aboutYou: 'כמה פרטים עליך',
    join: 'הצטרפות',
    errorTitle: 'אי אפשר להצטרף עם הקישור הזה',
    errors: {
      'not-found': 'לא מצאנו את ההזמנה. בדקו שהקישור הועתק במלואו, או בקשו קישור חדש.',
      revoked: 'הקישור הזה בוטל. אפשר לבקש קישור חדש ממי ששלח אותו.',
      expired: 'תוקף הקישור פג. אפשר לבקש קישור חדש ממי ששלח אותו.',
      'already-member': 'כבר הצטרפת לבית הזה.',
      full: 'הבית הזה כבר מלא, יש בו שישה בני בית.'
    },
    createInstead: 'ליצירת בית חדש'
  },
  /** "את" / "אתה" for the profile chip next to a name. */
  you: gendered('את', 'אתה', 'את/ה')
} as const;

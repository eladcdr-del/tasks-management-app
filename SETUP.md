# HomeCare: מדריך הקמה (לאלעד)

ההקמה נעשית **פעם אחת**, לוקחת **כחצי שעה**, ועולה **0 ₪**. לא צריך כרטיס אשראי.

בסוף התהליך:

- האפליקציה רצה בכתובת **https://eladcdr-del.github.io/tasks-management-app/**
- אמא ואבא מתקינים אותה למסך הבית
- הנתונים מסונכרנים ביניהם בזמן אמת
- מגיעות התראות לטלפון

> רוצים קודם להציץ? אחרי שלב 1 אפשר לפתוח את הכתובת עם `?demo=1` בסוף. זה מצב תצוגה עם נתונים לדוגמה, בלי Firebase.

---

## 1. GitHub: לפרסם את האתר

1. בריפו **eladcdr-del/tasks-management-app** נכנסים ל-**Settings** ← **General**. גוללים למטה עד **Danger Zone** ← **Change repository visibility** ← **Public**.
   - הקוד נהיה ציבורי, אבל הנתונים לא. הם מוגנים בכללי האבטחה של Firebase.
   - אפשר למחוק קודם את התיקייה `.god-mode/`. אלה מסמכי העבודה שלי, והאפליקציה לא צריכה אותם.
2. **Settings** ← **Pages** ← **Build and deployment** ← **Source**: בוחרים **GitHub Actions**.
3. **Actions** ← **deploy** ← **Run workflow**. אחרי 2–3 דקות האתר עולה.
   - ה-workflow רץ על הענף `main` ועל `ccr-4db4aa05-kbrwag`.
   - אם הענף הראשי שלכם הוא אחר, מוסיפים אותו בשורת `branches` בקובץ `.github/workflows/deploy.yml`.

## 2. פרויקט Firebase

1. נכנסים ל-https://console.firebase.google.com ← **Create a project** ← שם: `homecare`.
2. מכבים את **Google Analytics** (לא צריך) ← **Create project**.
3. הפרויקט נשאר בתוכנית **Spark** החינמית. לא משדרגים.

## 3. מסד הנתונים (Firestore)

1. בתפריט: **Build** ← **Firestore Database** ← **Create database**.
2. מיקום: `eur3 (europe-west)`. מצב: **production mode** ← **Create**.
3. לשונית **Rules**: מוחקים את מה שיש שם. מדביקים את כל התוכן של הקובץ [`firestore.rules`](firestore.rules) מהריפו ← **Publish**.
4. לשונית **Indexes** ← **Composite** ← **Create index**:
   - Collection ID: `tasks`
   - שדות: `status` (Ascending), `completedAt` (Descending)
   - Query scope: **Collection** ← **Create**

   אם תשכחו, Firebase יציג בקונסולה של הדפדפן קישור שיוצר את האינדקס בלחיצה.
5. (אופציונלי) לשונית **TTL policies**: Collection `sent`, שדה `expireAt`. זה מנקה לוג ישן של התראות.

## 4. כניסה עם Google (Authentication)

1. **Build** ← **Authentication** ← **Get started**.
2. **Sign-in method** ← **Google** ← **Enable**. בוחרים כתובת מייל לתמיכה ← **Save**.
3. **Settings** ← **Authorized domains** ← **Add domain** ← `eladcdr-del.github.io` ← **Add**.

   בלי השלב הזה, הכניסה תיכשל עם הודעה שמסבירה בדיוק את זה.

## 5. לחבר את האפליקציה ל-Firebase

1. גלגל השיניים ⚙️ ← **Project settings** ← **General** ← **Your apps** ← אייקון ה-Web `</>`.
2. כינוי: `HomeCare`. **לא** מסמנים Firebase Hosting ← **Register app**.
3. מוצג אובייקט `firebaseConfig`. משאירים את המסך פתוח.
4. ב-GitHub פותחים את הקובץ [`firebase-config.ts`](firebase-config.ts) ← אייקון העיפרון ✏️.
5. מעתיקים כל ערך למקום המתאים: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
6. **Commit changes**. האתר נבנה מחדש לבד תוך כמה דקות (אפשר לעקוב ב-**Actions**).

> הערכים האלה ציבוריים מעצם הגדרתם, ולכן בטוח לשים אותם בריפו ציבורי.

## 6. התראות לטלפון

ההתראות נשלחות מתהליך קטן ב-GitHub Actions שרץ כל 5 דקות (`.github/workflows/notify.yml`). הוא צריך מפתח אחד:

1. ב-Firebase: ⚙️ ← **Project settings** ← **Service accounts** ← **Generate new private key** ← **Generate key**. יורד קובץ JSON.
2. ב-GitHub: **Settings** ← **Secrets and variables** ← **Actions** ← **New repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: מדביקים **את כל תוכן קובץ ה-JSON**
   - **Add secret**
3. **מוחקים את קובץ ה-JSON מהמחשב.** אסור להעלות אותו לריפו בשום מקרה.
4. בודקים: **Actions** ← **notify** ← **Run workflow**. אמור לצאת וי ירוק.
   - (אופציונלי) מפתח VAPID: ב-Firebase ← **Cloud Messaging** ← **Web Push certificates** ← **Generate key pair**. מדביקים אותו ב-`vapidKey` בקובץ `firebase-config.ts`. בלי זה משתמשים במפתח ברירת המחדל של Firebase.

**טוב לדעת:**

- **השהיות:** GitHub מריץ תהליכים מתוזמנים בהשהיה של 5–15 דקות, ולפעמים מדלג על ריצה. זה תקין.
- **השבתה אחרי 60 יום:** אם אין פעילות בריפו במשך 60 יום, GitHub משבית תהליכים מתוזמנים ושולח לכם מייל לפני כן. התהליך מנסה להשאיר את עצמו פעיל. אם בכל זאת הושבת: **Actions** ← **notify** ← **Enable workflow**.
- **בלי ה-secret:** כל ריצה עדיין ירוקה, עם הודעה שאין מפתח. האפליקציה עובדת מלא, רק בלי התראות.
- **ריצה אדומה:** ה-secret לא תקין, או ש-FCM נכשל. הלוגים ציבוריים, אבל מופיעים בהם רק מספרים.

## 7. להתקין אצל אמא ואבא

1. **אמא** פותחת בכרום באנדרואיד את https://eladcdr-del.github.io/tasks-management-app/
   - מופיע "התקנת אפליקציה"? לוחצים.
   - אם לא: תפריט ⋮ ← **הוספה למסך הבית** / **התקנת אפליקציה**.
2. פותחים מהאייקון **HomeCare** ← **כניסה עם Google** ← שם, את/אתה, צבע ← **יוצרים את הבית**.
3. במסך **"הבית שלנו"** לוחצים **"הזמנה בוואטסאפ"** ושולחים לאבא.
4. **אבא** פותח את הקישור בכרום, מתקין באותה דרך, נכנס עם Google ולוחץ **הצטרפות**.
5. כל אחד מאשר **התראות** (באונבורדינג, או בהגדרות ← התראות).

---

## פתרון בעיות

| בעיה | פתרון |
|---|---|
| "הדומיין לא מורשה" בכניסה | שלב 4.3: להוסיף את `eladcdr-del.github.io` ל-Authorized domains |
| חלון הכניסה נחסם או נסגר | לנסות שוב, או לפתוח בכרום (לא בתוך וואטסאפ) |
| התראות לא מגיעות | בהגדרות האפליקציה לוודא שהן מופעלות. בכרום: ⋮ ← הגדרות אתר ← התראות ← לאפשר. לבדוק שה-secret קיים ושריצת **notify** ירוקה |
| שיניתי קוד ולא רואה שינוי | לחכות שריצת **deploy** תסתיים, ואז לסגור ולפתוח מחדש את האפליקציה (יופיע "גרסה חדשה מוכנה · עדכון") |
| רוצים לראות דמו | `https://eladcdr-del.github.io/tasks-management-app/?demo=1` |
| להתחיל את הדמו מחדש | אותו קישור עם `&reset=1` |

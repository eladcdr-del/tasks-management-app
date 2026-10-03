// ─────────────────────────────────────────────────────────────────────────────
//  HomeCare · הגדרות Firebase — זה הקובץ היחיד שצריך לערוך כדי לחבר את האפליקציה
// ─────────────────────────────────────────────────────────────────────────────
//
//  היי אלעד,
//  הדביקו כאן את הערכים מ-Firebase. זה בטוח — הערכים האלה ציבוריים.
//
//  איפה מוצאים אותם:
//    Firebase Console ← גלגל השיניים ← Project settings ← General ← Your apps ← (אפליקציית ה-Web "HomeCare")
//    ← SDK setup and configuration ← Config. מעתיקים כל ערך למקום המתאים למטה (בין הגרשיים).
//
//  למה זה בטוח לשים בריפו ציבורי?
//    ה-config של Firebase ל-Web הוא ציבורי מעצם הגדרתו: הוא רק אומר לאפליקציה לאיזה פרויקט
//    לפנות. מי שמגן על הנתונים הם כללי האבטחה של Firestore (firestore.rules), שמאפשרים גישה
//    רק לחברי הבית. את ה-service account (ה-JSON הסודי) לעולם לא מדביקים כאן — הוא נכנס רק
//    כ-secret ב-GitHub (ראו SETUP.md).
//
//  אחרי השמירה:
//    עורכים את הקובץ ישירות ב-github.com (אייקון העיפרון) ← Commit changes.
//    GitHub Actions יבנה ויפרסם את האתר מחדש תוך כמה דקות.
//
//  כל עוד השדות ריקים, האפליקציה תציג מסך הסבר ותציע לנסות את מצב הדמו.
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: '', //            לדוגמה: 'AIzaSy...'
  authDomain: '', //        לדוגמה: 'homecare-12345.firebaseapp.com'
  projectId: '', //         לדוגמה: 'homecare-12345'
  storageBucket: '', //     לדוגמה: 'homecare-12345.firebasestorage.app' (לא בשימוש, אפשר להשאיר)
  messagingSenderId: '', // לדוגמה: '123456789012'
  appId: '' //              לדוגמה: '1:123456789012:web:abc123...'
};

// אופציונלי: מפתח Web Push (VAPID) להתראות.
// Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates ← Generate key pair.
// אם משאירים ריק, האפליקציה משתמשת במפתח ברירת המחדל של Firebase.
export const vapidKey = '';

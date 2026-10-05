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
  apiKey: 'AIzaSyDlYTgOJNttjh-McbCtl366ujZyuR1b4es',
  authDomain: 'homecare-49b3d.firebaseapp.com',
  projectId: 'homecare-49b3d',
  storageBucket: 'homecare-49b3d.firebasestorage.app',
  messagingSenderId: '594233931298',
  appId: '1:594233931298:web:931b28957c38ef26ef3c7b'
};

// אופציונלי: מפתח Web Push (VAPID) להתראות.
// Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates ← Generate key pair.
// אם משאירים ריק, האפליקציה משתמשת במפתח ברירת המחדל של Firebase.
export const vapidKey = '';

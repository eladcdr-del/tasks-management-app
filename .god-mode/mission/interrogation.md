# Interrogation log

## Context
- Requester: Elad (son). End users: his parents (mom wrote the request, open to questions via Elad).
- Repo: eladcdr-del/tasks-management-app — empty, PRIVATE (GitHub Pages free tier unavailable for private repos).
- Environment: no gcloud/firebase credentials; node 22.

## Phase 0 — Prompt refinement
- PQS: 3/5. Type: Task (build request).
- Active problems: (1) "sync" needs a backend account someone must create; hosting for a private repo; (2) "לפרוס את המשימות באופן אידיאלי" ambiguous (split between people vs. spread over time).

### Round 1 (calibration)
- Importance: 🔴 Critical
- Patience: between reasonable and deep, leaning reasonable → Phase 0 budget ≈ 8 (+3 active problems) ; Phase 1 floor 10, batched
- "לפרוס באופן אידיאלי": Elad not sure → design for BOTH (fair split between them + spreading over time so things don't pile up / get postponed forever)

### Round 2 (infra)
- Phones: both Android → Chrome PWA (install prompt, web push supported, Google sign-in reliable)
- Sync: Elad will open Firebase (Firestore) — needs exact step-by-step setup guide
- Hosting: make repo PUBLIC + GitHub Pages (Elad flips visibility + Pages source = GitHub Actions)
- Login: "you decide" → Google sign-in (Android phones already have Google accounts; one tap; recoverable; gives name+photo) + invite partner via WhatsApp link

### Phase 0 result — CONFIRMED refined prompt
בנה PWA בעברית (RTL) לניהול משימות הבית המשותפות של אמא ואבא (שניהם אנדרואיד), שמותקנת למסך הבית ומרגישה כמו אפליקציה מקצועית, נעימה ויפה.
ליבה: ריכוז משימות שוטפות ומשימות "שנדחות" (תיקון רכב, החלפת בגד, רכישה שצריך לברר); לכל משימה ברור מי לקח אותה; חלוקה מאוזנת בין השניים ופריסה חכמה לאורך זמן כך שדברים לא יצטברו ולא יידחו לנצח; תיעוד ביצוע (מתי, מי, הערה/תמונה/עלות); וערך מוסף פשוט שלא מסבך.
תשתית: סנכרון בזמן אמת דרך Firebase (Firestore עם עבודה אופליין), כניסה עם Google בלחיצה + הזמנת בן/בת הזוג בקישור וואטסאפ; אירוח ב-GitHub Pages עם פריסה אוטומטית. אלעד מקים את Firebase פעם אחת — צריך מדריך מדויק צעד-אחר-צעד ומסך ברור אם ההגדרות חסרות.
חובה: כל פעולה נפוצה (הוספה, "אני לוקח/ת", "בוצע") בלחיצה אחת-שתיים. כללי אבטחה ב-Firestore כך שרק בני הבית קוראים וכותבים. אין מידע פרטי בקוד הציבורי.

## Phase 1 — Interrogation (result)

### Round A (audience + context)
- Tech comfort: comfortable, BUT prefer simple over complex
- Today: WhatsApp messages + in their heads / verbal + paper notes/lists → app replaces scattered WhatsApp + memory + paper; WhatsApp is their native channel (sharing/invite there fits)
- Assignment: combination — take for yourself, or ask the partner — but the app must NOT auto-suggest who should do it
- Future: the kids may join later → data model for N members (household), UI optimized for 2

### Round B (taste + success)
- Style: WARM & PLEASANT (cream bg ~#FBF6EF, terracotta accent ~#D9774B, sage secondary ~#8BA888, big rounded corners, soft shadows). Elad: "make sure the UI design is of really, really high quality".
- Copy tone: in the middle — pleasant and human, no exaggeration (light warmth, not jokey)
- "Wow" = ALL FOUR: clear picture in one second (what's open/urgent/who owns) · postponed things finally move · no more "you forgot" (everything recorded & documented) · fun/pleasant to open
- Abandonment risks: too many fields · complicated · not reliable (sync must be trustworthy, visible sync state). NOT selected: "too many notifications" → notifications acceptable if useful.

### Round C (features + edge cases)
- Notifications wanted (ALL): when someone requests something from me · due-day reminder (+ day before return deadline) · when partner finished · gentle nudge on stuck tasks (weekly)
- Notification infra: "choose the easiest, requiring nothing from me, but with real phone notifications — find the ideal solution" → orchestrator decides (see decisions.md)
- Private tasks: NOT needed (everything shared — simpler)
- Recurring tasks: YES, simply (on completion, recreate for next time: weekly/monthly/yearly)

### Round D (name + tacit knowledge)
- App name: **HomeCare** (label under home-screen icon; UI itself in Hebrew)
- Mom's second message (verbatim): "שתהיה אפשרות לסמן סדרי עדיפויות, קטגוריות, מי מבצע וזמנים. אפשר להשתעשע עם הרעיון שנוסיף לעצמנו צ'ופר אחת לכמה משימות שביצענו"
  → explicit fields: priority, category, owner, times/dates (all OPTIONAL to respect "too many fields")
  → shared reward: a treat every N completed tasks — cooperative (both together), playful, not a competition

Phase 1 total: 14 questions across audience, taste, success, ambition, edge cases, context. Interrogation complete.

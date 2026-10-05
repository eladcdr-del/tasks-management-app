# HomeCare 🏠

An app for managing household tasks together, built for mom and dad (Hebrew, RTL). It installs to the phone's home screen and syncs in real time.

- **Live app:** https://eladcdr-del.github.io/tasks-management-app/
- **Demo (no setup):** https://eladcdr-del.github.io/tasks-management-app/?demo=1
- **Setup guide:** [SETUP.md](SETUP.md)

## What it does

- **A clear picture at a glance.** The home screen shows what is overdue or urgent, what is due today, and what is waiting for someone to take it. Every task shows who owns it.
- **Quick add.** Only a title is required. Hebrew phrases are recognized automatically and shown as chips you can remove. Examples: "להחזיר מכנסיים עד יום חמישי", "דחוף", "כל שני וחמישי".
- **Many at once.** Paste or type a list (one task per line, e.g. from WhatsApp or notes) and each line becomes a task, with the same recognition and a preview before adding.
- **Repeats that fit real life.** Every day, every few days, weeks or months, or on chosen weekdays.
- **Fair split, no lecturing.** The end of every row shows who does it. A free task has an empty seat ("לקחת"): tap it to take the task yourself or to ask anyone in the house. A request waits for their answer ("אני לוקח/ת" or "לא מתאים לי"), and until then nobody holds the task. The app never suggests who should do it.
- **Tidy up in one go.** Choose several tasks ("בחירה", or a long press on a row) and delete them or take them all at once. One "ביטול" brings back everything that was deleted.
- **Things that get postponed actually move.** Each task shows its age ("פתוחה 3 שבועות") and how often it was snoozed. Plans are grouped into today, this week and later, and a gentle weekly nudge covers stuck tasks.
- **No more "you forgot".** History records who did what. When completing a task you can add a note, cost, place, contact and photos.
- **House memory.** Search past tasks: "מתי החלפנו מצבר ובאיזה מוסך?"
- **Shared treat jar.** A team goal: by default everyone closes their own share of tasks ("כל אחד תורם"), or the classic total by anyone ("ביחד"). When the jar is full, you treat yourselves together. A jar can be deleted (the treats you earned stay) and a new one started any time; an earned treat can be removed from the history. Both come with an undo.
- **Phone notifications:**
  - when someone asks you to do something
  - on the due date
  - when your partner finishes a task
  - a weekly digest

## Architecture

| Layer                         | Location                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Screens                       | `src/screens/*`, `src/sheets/*`                                                          |
| Design system                 | `src/components/ui/*` (tokens in `src/styles/tokens.css`)                                |
| State (Svelte 5 runes)        | `src/lib/state/*.svelte.ts`                                                              |
| Business logic (pure, tested) | `src/lib/domain/*`, Hebrew formatting in `src/lib/i18n/format.ts`                        |
| Quick-add parser              | `src/lib/parser/*` (change only with tests)                                              |
| Data                          | `src/lib/data/repository.ts` (contract), `demo/` (local), `firebase/` (Firestore + Auth) |
| Security rules                | `firestore.rules`, schema in `docs/firestore-schema.md`                                  |
| Router                        | `src/lib/router/*` (hash routing; Back closes sheets; change only with tests)            |
| Notifications (server)        | `scripts/notify/*` + `.github/workflows/notify.yml` (cron every 5 minutes)               |
| Strings                       | `src/lib/i18n/he/*.ts`                                                                   |

Stack: Svelte 5, Vite 8, TypeScript, vite-plugin-pwa (Workbox), Firebase 12 (Spark plan), GitHub Pages.

## Development

```bash
npm ci
npm run dev                 # local dev server, http://localhost:5173/tasks-management-app/?demo=1
npm run check               # svelte-check + tsc
npm run test:unit           # vitest
npm run test:e2e            # Playwright against demo mode
npm run test:rules          # Firestore rules on the emulator (needs Java)
npm run test:integration    # Firebase adapter on the emulator
npm run test:e2e:emu        # E2E against the emulator
npm ci --prefix scripts/notify && npm run notify:test
```

Every push to the main branch triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages.

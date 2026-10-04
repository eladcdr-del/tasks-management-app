# HomeCare 🏠

An app for managing household tasks together, built for mom and dad (Hebrew, RTL). It installs to the phone's home screen and syncs in real time.

- **Live app:** https://eladcdr-del.github.io/tasks-management-app/
- **Demo (no setup):** https://eladcdr-del.github.io/tasks-management-app/?demo=1
- **Setup guide:** [SETUP.md](SETUP.md)

## What it does

- **A clear picture at a glance.** The home screen shows what is overdue or urgent, what is due today, and what is waiting for someone to take it. Every task shows who owns it.
- **Quick add.** Only a title is required. Hebrew phrases are recognized automatically and shown as chips you can remove. Examples: "להחזיר מכנסיים עד יום חמישי", "דחוף", "כל חודש".
- **Fair split, no lecturing.** Take a task yourself, or ask your partner. The app never suggests who should do it.
- **Things that get postponed actually move.** Each task shows its age ("פתוחה 3 שבועות") and how often it was snoozed. Plans are grouped into today, this week and later, and a gentle weekly nudge covers stuck tasks.
- **No more "you forgot".** History records who did what. When completing a task you can add a note, cost, place, contact and photos.
- **House memory.** Search past tasks: "מתי החלפנו מצבר ובאיזה מוסך?"
- **Shared treat jar.** Each completed task fills the jar. When it is full, you treat yourselves together.
- **Phone notifications:**
  - when someone asks you to do something
  - on the due date
  - when your partner finishes a task
  - a weekly digest

## Architecture

| Layer | Location |
|---|---|
| Screens | `src/screens/*`, `src/sheets/*` |
| Design system | `src/components/ui/*` (tokens in `src/styles/tokens.css`) |
| State (Svelte 5 runes) | `src/lib/state/*.svelte.ts` |
| Business logic (pure, tested) | `src/lib/domain/*`, Hebrew formatting in `src/lib/i18n/format.ts` |
| Quick-add parser | `src/lib/parser/*` (change only with tests) |
| Data | `src/lib/data/repository.ts` (contract), `demo/` (local), `firebase/` (Firestore + Auth) |
| Security rules | `firestore.rules`, schema in `docs/firestore-schema.md` |
| Router | `src/lib/router/*` (hash routing; Back closes sheets; change only with tests) |
| Notifications (server) | `scripts/notify/*` + `.github/workflows/notify.yml` (cron every 5 minutes) |
| Strings | `src/lib/i18n/he/*.ts` |

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

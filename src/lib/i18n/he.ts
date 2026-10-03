// CONTRACT — all UI strings (Hebrew), aggregated. Created in step 1.1; only 1.1 edits this file.
//
// Each namespace lives in its own file under ./he/, owned by exactly one step (see the header of
// each file). Steps add keys ONLY in their own file; a new namespace (new file + one line below)
// goes through the orchestrator. Import as before: `import { he, gendered, form } from '$lib/i18n/he'`.
//
// Tone (Blueprint §8): warm, plain, no exclamation spam, no slang, emoji-free.
// User-entered text is rendered with dir="auto"; numbers via Intl (src/lib/i18n/format.ts, 1.2).
//
//   file                         owner  namespace
//   he/common.ts                 1.1    he.common
//   he/ui.ts                     1.4    he.ui                       UI-primitive strings
//   he/domain.ts                 1.2    he.domain                   reserved
//   he/shell.ts                  3.1    he.shell
//   he/onboarding.ts             3.1    he.onboarding               incl. sign-in / join errors
//   he/onboardingNotifications   5.1    he.onboardingNotifications
//   he/setup.ts                  3.1    he.setup
//   he/home.ts                   3.2    he.home
//   he/taskCard.ts               3.2    he.taskCard
//   he/sheetRequest.ts           3.2    he.sheetRequest
//   he/sheetSnooze.ts            3.2    he.sheetSnooze
//   he/taskDetail.ts             3.3    he.taskDetail
//   he/sheetQuickAdd.ts          3.3    he.sheetQuickAdd
//   he/sheetComplete.ts          3.3    he.sheetComplete
//   he/memory.ts                 4.1    he.memory
//   he/jar.ts                    4.2    he.jar                      incl. JarSetup sheet (he.jar.setup)
//   he/household.ts              4.3    he.household
//   he/settings.ts               4.3    he.settings
//   he/notifications.ts          5.1    he.notifications
//   he/update.ts                 5.1    he.update                   UpdatePrompt
//   he/errors.ts                 2.2    he.errors                   RepoError code → message
//   he/demo.ts                   2.4    he.demo                     "מצב תצוגה" banner
//   he/dev.ts                    1.4    he.dev                      dev gallery only

import { common } from './he/common';
import { ui } from './he/ui';
import { domain } from './he/domain';
import { shell } from './he/shell';
import { onboarding } from './he/onboarding';
import { onboardingNotifications } from './he/onboardingNotifications';
import { setup } from './he/setup';
import { home } from './he/home';
import { taskCard } from './he/taskCard';
import { sheetRequest } from './he/sheetRequest';
import { sheetSnooze } from './he/sheetSnooze';
import { taskDetail } from './he/taskDetail';
import { sheetQuickAdd } from './he/sheetQuickAdd';
import { sheetComplete } from './he/sheetComplete';
import { memory } from './he/memory';
import { jar } from './he/jar';
import { household } from './he/household';
import { settings } from './he/settings';
import { notifications } from './he/notifications';
import { update } from './he/update';
import { errors } from './he/errors';
import { demo } from './he/demo';
import { dev } from './he/dev';

export { form, gendered } from './gender';
export type { Addressee, Gendered } from './gender';

export const he = {
  common,
  ui,
  domain,
  shell,
  onboarding,
  onboardingNotifications,
  setup,
  home,
  taskCard,
  sheetRequest,
  sheetSnooze,
  taskDetail,
  sheetQuickAdd,
  sheetComplete,
  memory,
  jar,
  household,
  settings,
  notifications,
  update,
  errors,
  demo,
  dev
} as const;

export type Strings = typeof he;

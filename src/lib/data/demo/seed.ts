// The demo household (Blueprint §5 "Seed"): "הבית שלנו" with מיכל and דני, a lived-in mix of open
// and documented done tasks, a treat jar at 7/10 and two earned treats.
//
// createSeed(now) is DETERMINISTIC for a given `now`: fixed ids, no randomness, and every date is
// relative to today's date in Asia/Jerusalem. On the E2E date (Sunday 2026-10-04) the Home screen
// shows: attention 3 (1 overdue + 2 urgent), today 4, waiting 3, week 5, later 4; 16 open, 14 done.
//
// The history is internally consistent, so the seed doubles as a fixture for the domain rules:
//  - every task has the events that explain its state (created, taken/requested, snoozed, completed);
//    a task owned by someone other than its creator was either taken by the owner or requested by
//    the creator;
//  - the ארנונה series is anchored, and each instance is exactly what buildNextInstance produces;
//  - jar.count equals the completions since the jar's round started, and each earned treat was
//    filled by a real completion.

import {
  addDays,
  addMonths,
  diffDays,
  localTimeParts,
  parseISO,
  todayISO
} from '../../domain/dates';
import { nextTaskId } from '../../domain/recurrence';
import type {
  ActivityEvent,
  AuthUser,
  CategoryId,
  EarnedTreat,
  EventType,
  Household,
  Invite,
  ISODate,
  Member,
  Millis,
  NotifyPrefs,
  Photo,
  Priority,
  Task
} from '../../domain/types';
import { DEMO_STATE_VERSION, type DemoState, type HouseholdRecord } from './store';

export const DEMO_HOUSEHOLD_ID = 'demo-home';
export const MICHAL = 'michal';
export const DANI = 'dani';
/** The invite דני joined with (long expired). */
export const DEMO_INVITE_CODE = 'HomeCareDemoInvite2026Ab';

export const DEMO_USERS: Readonly<Record<string, AuthUser>> = {
  [MICHAL]: { uid: MICHAL, displayName: 'מיכל', email: 'michal@example.com', photoURL: null },
  [DANI]: { uid: DANI, displayName: 'דני', email: 'dani@example.com', photoURL: null }
};

export const ALL_NOTIFY_ON: NotifyPrefs = {
  requests: true,
  reminders: true,
  partnerDone: true,
  weekly: true
};

/** A 120×160 photo of a receipt (1.8 KB JPEG), attached to "החלפת מצבר". */
export const SEED_RECEIPT_JPEG =
  'data:image/jpeg;base64,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';

/** The same receipt at 48×64 (0.7 KB JPEG), its thumbnail. */
export const SEED_RECEIPT_THUMB =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCABAADADASIAAhEBAxEB/8QAGgAAAwADAQAAAAAAAAAAAAAAAAMEAQIFBv/EADIQAAAFAgMEBwkBAAAAAAAAAAABAgMEERMFFCESUWWkFSIxU1RhkgYWQZGjwdHS4oH/xAAXAQEAAwAAAAAAAAAAAAAAAAABAAID/8QAHBEBAQEAAgMBAAAAAAAAAAAAAAERAiISIVED/9oADAMBAAIRAxEAPwD1Qw9JiMOm266aVl2lQz+wyJZzWHqlrOQ+4hzSpEWhaF5DK7nppx8d7HZ6B35+k/wDPQO/P0n+BDZwrxLvy/kFnCvEu/L+RXv8jTPy+10WZMR90m2nTUs+wqGX2GRLBaw9MtBx33Fua0Iy0PQ/IVC03PbPl471ATMk25K09IWaU6lnappvDgmZJtyVp6Qs0p1LO1TTeLRUnOcV5cGc4ry4M5xXlwZzivLhC6NPjumhpL1xwy7dgyqZFqY1G0ZuQZocVMutmVdm0SakZaDUFMATMk25K09IWaU6lnappvDhu8xJW6ampdtB9ibZHT/RIlQZzivLgznFeXFmWmeP+ikGWmeP+ikIJhybklCekL1a9Szs103hwrQSkoSSlbSiLVVKVPeJAUwCHEfamFh01yK81IU43SpoSky1Ij+J+YuFF9O4xIlcD33w7uZfoT+wPffDu5l+hP7Dv307jBfTuMOhycO9qYWIzW4rLUhLjlaGtKSLQjP4H5C4UX07jE4KY//Z';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const INVITE_TTL = 7 * DAY;

/**
 * The instant at which the wall clock in Asia/Jerusalem shows `hhmm` on `iso`. Converges in one or
 * two corrections (the offset is +2 or +3 hours); exact for every time that exists on that day.
 */
export function jerusalemInstant(iso: ISODate, hhmm: string): Millis {
  const [h = 0, min = 0] = hhmm.split(':').map(Number);
  const { y, m, d } = parseISO(iso);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let t = wall - 2 * HOUR;
  for (let i = 0; i < 3; i++) {
    const local = parseISO(todayISO(t));
    const { hour, minute } = localTimeParts(t);
    const seen = Date.UTC(local.y, local.m - 1, local.d, hour, minute);
    if (seen === wall) break;
    t += wall - seen;
  }
  return t;
}

/** Events the notifier would already have handled in a real household. */
const PUSHED: ReadonlySet<EventType> = new Set(['requested', 'completed', 'jar_filled']);

type Uid = typeof MICHAL | typeof DANI;

interface Done {
  at: Millis;
  by: Uid;
  note?: string;
  cost?: number | null;
  place?: string;
  contact?: string;
  photoIds?: string[];
}

interface Spec {
  id: string;
  title: string;
  notes?: string;
  categoryId: CategoryId | null;
  priority?: Priority;
  createdBy: Uid;
  createdAt: Millis;
  ownerId: Uid | null;
  /** The owner took it from the list (only when the creator is someone else). */
  takenAt?: Millis;
  /** The creator assigned it to the owner at creation, i.e. a request (requestedAt = createdAt). */
  requested?: boolean;
  scheduledFor?: ISODate | null;
  dueDate?: ISODate | null;
  dueTime?: string | null;
  hardDeadline?: boolean;
  recurrence?: Task['recurrence'];
  seriesId?: string | null;
  /** Snoozes by the owner, oldest first: [when, until]. The last `until` is the current plan. */
  snoozes?: [Millis, ISODate][];
  completed?: Done;
  /** Auto-created by completing the previous instance of a series (no created event). */
  auto?: boolean;
}

class SeedBuilder {
  readonly tasks: Record<string, Task> = {};
  private readonly events: Omit<ActivityEvent, 'id'>[] = [];

  constructor(readonly today: ISODate) {}

  /** Calendar date `offset` days from today. */
  day(offset: number): ISODate {
    return addDays(this.today, offset);
  }

  /** Local time `hhmm` on the day `offset` days from today. */
  at(offset: number, hhmm: string): Millis {
    return jerusalemInstant(this.day(offset), hhmm);
  }

  event(
    type: EventType,
    actorId: Uid,
    task: Task | null,
    createdAt: Millis,
    targetId: string | null = null
  ) {
    this.events.push({
      type,
      actorId,
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
      targetId,
      createdAt,
      push: PUSHED.has(type) ? 'sent' : 'none'
    });
  }

  task(s: Spec): Task {
    if (
      s.ownerId !== null &&
      s.ownerId !== s.createdBy &&
      !s.requested &&
      s.takenAt === undefined
    ) {
      throw new Error(`seed: ${s.id} is owned by someone else but was neither taken nor requested`);
    }
    const snoozes = s.snoozes ?? [];
    const lastSnooze = snoozes.at(-1);
    const actions: [Millis, Uid][] = [[s.createdAt, s.createdBy]];
    if (s.takenAt !== undefined) actions.push([s.takenAt, s.ownerId!]);
    for (const [when] of snoozes) actions.push([when, s.ownerId ?? s.createdBy]);
    if (s.completed) actions.push([s.completed.at, s.completed.by]);
    const [updatedAt, updatedBy] = actions.reduce((a, b) => (b[0] >= a[0] ? b : a));

    const task: Task = {
      id: s.id,
      title: s.title,
      notes: s.notes ?? '',
      categoryId: s.categoryId,
      priority: s.priority ?? 'normal',
      ownerId: s.ownerId,
      requestedBy: s.requested ? s.createdBy : null,
      requestedAt: s.requested ? s.createdAt : null,
      createdBy: s.createdBy,
      createdAt: s.createdAt,
      updatedBy,
      updatedAt,
      scheduledFor: lastSnooze ? lastSnooze[1] : (s.scheduledFor ?? null),
      dueDate: s.dueDate ?? null,
      dueTime: s.dueTime ?? null,
      hardDeadline: s.hardDeadline ?? false,
      recurrence: s.recurrence ?? null,
      seriesId: s.seriesId ?? null,
      status: s.completed ? 'done' : 'open',
      snoozeCount: snoozes.length,
      lastSnoozedAt: lastSnooze ? lastSnooze[0] : null,
      completedAt: s.completed?.at ?? null,
      completedBy: s.completed?.by ?? null,
      completion: s.completed
        ? {
            note: s.completed.note ?? '',
            cost: s.completed.cost ?? null,
            place: s.completed.place ?? '',
            contact: s.completed.contact ?? '',
            photoIds: s.completed.photoIds ?? []
          }
        : null
    };
    this.tasks[task.id] = task;

    if (!s.auto) this.event('created', s.createdBy, task, s.createdAt);
    if (s.requested) this.event('requested', s.createdBy, task, s.createdAt, s.ownerId);
    if (s.takenAt !== undefined) this.event('taken', s.ownerId!, task, s.takenAt);
    for (const [when] of snoozes) this.event('snoozed', s.ownerId ?? s.createdBy, task, when);
    if (s.completed) this.event('completed', s.completed.by, task, s.completed.at);
    return task;
  }

  /** Every event, oldest first (stable for equal times), with deterministic ids. */
  sortedEvents(): ActivityEvent[] {
    return this.events
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e.createdAt - b.e.createdAt || a.i - b.i)
      .map(({ e }, n) => ({ id: `seed-ev-${String(n + 1).padStart(3, '0')}`, ...e }));
  }
}

/** The full demo state for `now`, signed in as מיכל. */
export function createSeed(now: Date): DemoState {
  const b = new SeedBuilder(todayISO(now));
  const M = MICHAL;
  const D = DANI;

  // ── Open: needs attention (1 overdue + 2 urgent) ────────────────────────────
  b.task({
    id: 'seed-library',
    title: 'להחזיר ספרים לספרייה',
    notes: 'שלושה ספרים של נועה. אפשר להשאיר בתיבה ליד הכניסה',
    categoryId: 'family',
    createdBy: D,
    createdAt: b.at(-12, '19:30'),
    ownerId: D,
    dueDate: b.day(-2)
  });
  b.task({
    id: 'seed-plumber',
    title: 'להזמין אינסטלטור לנזילה מתחת לכיור',
    notes: 'מטפטף כל הלילה, שמתי קערה בינתיים',
    categoryId: 'home',
    priority: 'urgent',
    createdBy: M,
    createdAt: b.at(-2, '07:45'),
    ownerId: D,
    takenAt: b.at(-2, '08:20')
  });
  b.task({
    id: 'seed-prescription',
    title: 'לחדש מרשם לתרופה של סבתא',
    notes: 'לבקש מהרופאה מרשם לשלושה חודשים',
    categoryId: 'health',
    priority: 'urgent',
    createdBy: M,
    createdAt: b.at(-1, '18:05'),
    ownerId: M,
    dueDate: b.day(1)
  });

  // ── Open: waiting for someone to take ───────────────────────────────────────
  b.task({
    id: 'seed-bulbs',
    title: 'לקנות נורות לסלון',
    notes: 'LED לבן חם, הברגה E27',
    categoryId: 'shopping',
    createdBy: D,
    createdAt: b.at(-1, '20:45'),
    ownerId: null,
    scheduledFor: b.day(0)
  });
  b.task({
    id: 'seed-birthday-gift',
    title: 'לקנות מתנה ליום ההולדת של נועה',
    notes: 'היא רוצה ערכת יצירה או משחק קופסה',
    categoryId: 'family',
    createdBy: M,
    createdAt: b.at(-5, '21:20'),
    ownerId: null,
    scheduledFor: b.day(4)
  });
  b.task({
    id: 'seed-washer',
    title: 'להזמין טכנאי למכונת הכביסה',
    notes: 'עושה רעש חזק בסחיטה',
    categoryId: 'home',
    createdBy: D,
    createdAt: b.at(-3, '22:00'),
    ownerId: null
  });

  // ── Open: today ─────────────────────────────────────────────────────────────
  b.task({
    id: 'seed-ac',
    title: 'לברר על מזגן חדש',
    notes: 'המזגן בסלון בן 15 שנה. להשוות מחירים של מזגן אינוורטר',
    categoryId: 'home',
    createdBy: M,
    createdAt: b.at(-49, '21:00'),
    ownerId: D,
    takenAt: b.at(-48, '09:10'),
    snoozes: [
      [b.at(-42, '21:30'), b.day(-35)],
      [b.at(-35, '22:00'), b.day(-21)],
      [b.at(-21, '20:15'), b.day(-7)],
      [b.at(-7, '22:15'), b.day(0)]
    ]
  });
  b.task({
    id: 'seed-dentist',
    title: 'לקחת את נועה לרופאת שיניים',
    notes: 'מרפאת "שן טובה", קומה 2. להביא את כרטיס הקופה',
    categoryId: 'health',
    createdBy: M,
    createdAt: b.at(-9, '12:30'),
    ownerId: M,
    dueDate: b.day(0),
    dueTime: '16:30'
  });
  b.task({
    id: 'seed-health-refund',
    title: 'לשלוח טופס החזר לקופת חולים',
    notes: 'קבלות מהפיזיותרפיה, ארבעה טיפולים',
    categoryId: 'health',
    createdBy: M,
    createdAt: b.at(-8, '10:00'),
    ownerId: M,
    scheduledFor: b.day(-1) // planned for yesterday: "מתוכננת מאתמול"
  });

  // ── Open: this week ─────────────────────────────────────────────────────────
  b.task({
    id: 'seed-post',
    title: 'לאסוף חבילה מהדואר',
    notes: 'הגיע SMS, קוד איסוף 4471. הסניף ברחוב ויצמן',
    categoryId: 'other',
    createdBy: D,
    createdAt: b.at(-1, '19:15'),
    ownerId: M,
    requested: true, // דני ביקש ממיכל
    scheduledFor: b.day(2)
  });
  b.task({
    id: 'seed-shirt',
    title: 'להחליף את החולצה בקניון',
    notes: 'הקבלה בארנק. אפשר להחליף עד 14 יום מהקנייה',
    categoryId: 'returns',
    createdBy: M,
    createdAt: b.at(-6, '17:30'),
    ownerId: M,
    dueDate: b.day(3),
    hardDeadline: true
  });
  b.task({
    id: 'seed-wedding-gift',
    title: 'לקנות מתנה לחתונה של יואב ומאיה',
    notes: 'צ׳ק או שובר? לשאול את אחותי כמה נותנים',
    categoryId: 'family',
    createdBy: D,
    createdAt: b.at(-10, '20:00'),
    ownerId: M,
    takenAt: b.at(-10, '21:30'),
    dueDate: b.day(4)
  });
  b.task({
    id: 'seed-netflix',
    title: 'לבטל את המנוי ל-Netflix',
    notes: 'לבטל לפני החיוב הבא',
    categoryId: 'finance',
    createdBy: D,
    createdAt: b.at(-3, '21:40'),
    ownerId: D,
    dueDate: b.day(5)
  });

  // ── Open: later ─────────────────────────────────────────────────────────────
  b.task({
    id: 'seed-car-test',
    title: 'לתאם טסט לרכב',
    notes: 'הרישיון בתוקף עד סוף החודש. לקבוע במכון הרישוי בכפר סבא',
    categoryId: 'car',
    createdBy: D,
    createdAt: b.at(-4, '07:50'),
    ownerId: D,
    dueDate: b.day(20)
  });
  b.task({
    id: 'seed-water-filter',
    title: 'להחליף פילטר במטהר המים',
    notes: 'הפילטר הקודם הוחלף לפני חצי שנה',
    categoryId: 'home',
    priority: 'high',
    createdBy: D,
    createdAt: b.at(-15, '09:00'),
    ownerId: D,
    scheduledFor: b.day(14)
  });

  // ── The ארנונה series: two paid instances and the open one, all from one anchor ──
  const anchor = addMonths(b.day(10), -2);
  const second = addMonths(anchor, 1);
  const third = addMonths(anchor, 2); // the open instance: due in ~10 days (8-10 after clamping)
  const arnona = {
    title: 'לשלם ארנונה',
    categoryId: 'finance',
    ownerId: M,
    recurrence: { freq: 'monthly', anchor }
  } satisfies Pick<Spec, 'title' | 'categoryId' | 'ownerId' | 'recurrence'>;
  const paid1 = jerusalemInstant(addDays(anchor, -1), '20:15');
  const paid2 = jerusalemInstant(addDays(second, -1), '20:40');
  b.task({
    ...arnona,
    id: 'seed-arnona',
    notes: 'הוראת הקבע לא עובדת, משלמים באתר העירייה',
    createdBy: M,
    createdAt: b.at(diffDays(anchor, b.today) - 12, '21:10'),
    dueDate: anchor,
    completed: { at: paid1, by: M, note: 'שולם באתר העירייה', cost: 486 }
  });
  b.task({
    ...arnona,
    id: nextTaskId('seed-arnona', second),
    notes: 'הוראת הקבע לא עובדת, משלמים באתר העירייה',
    createdBy: M,
    createdAt: paid1,
    auto: true,
    seriesId: 'seed-arnona',
    dueDate: second,
    completed: { at: paid2, by: M, note: 'שולם באתר העירייה', cost: 486 }
  });
  b.task({
    ...arnona,
    id: nextTaskId('seed-arnona', third),
    notes: 'הוראת הקבע לא עובדת, משלמים באתר העירייה',
    createdBy: M,
    createdAt: paid2,
    auto: true,
    seriesId: 'seed-arnona',
    dueDate: third
  });

  // ── Done, oldest first (≈5 months), with documentation ──────────────────────
  b.task({
    id: 'seed-car-service',
    title: 'טיפול 30,000 לרכב',
    categoryId: 'car',
    createdBy: D,
    createdAt: b.at(-146, '08:00'),
    ownerId: D,
    dueDate: b.day(-140),
    completed: {
      at: b.at(-140, '16:20'),
      by: D,
      note: 'הוחלפו רפידות בלמים קדמיות ושמן',
      cost: 1250,
      place: 'מוסך השרון, כפר סבא',
      contact: 'יוסי · 050-1234567'
    }
  });
  const acCleaning = b.task({
    id: 'seed-ac-cleaning',
    title: 'ניקוי מזגנים לפני הקיץ',
    categoryId: 'home',
    createdBy: M,
    createdAt: b.at(-130, '20:00'),
    ownerId: D,
    takenAt: b.at(-130, '20:40'),
    completed: {
      at: b.at(-121, '12:00'),
      by: D,
      note: 'ניקו את שלושת המזגנים, הכל תקין',
      cost: 450,
      contact: 'קירור השרון · 09-7654321'
    }
  });
  const round1Filled = acCleaning.completedAt!;
  const round1Redeemed = b.at(-119, '20:30');
  b.event('jar_filled', D, null, round1Filled);
  b.event('jar_redeemed', M, null, round1Redeemed);

  b.task({
    id: 'seed-boiler',
    title: 'תיקון נזילה בדוד השמש',
    categoryId: 'home',
    createdBy: M,
    createdAt: b.at(-103, '08:00'),
    ownerId: D,
    takenAt: b.at(-103, '08:30'),
    completed: {
      at: b.at(-100, '17:45'),
      by: D,
      note: 'הוחלפו ברז ואטם. לבדוק שוב לפני החורף',
      cost: 350,
      contact: 'אבי האינסטלטור · 052-7654321'
    }
  });
  b.task({
    id: 'seed-blood-tests',
    title: 'בדיקות דם שנתיות',
    categoryId: 'health',
    createdBy: M,
    createdAt: b.at(-86, '09:15'),
    ownerId: M,
    completed: {
      at: b.at(-80, '07:30'),
      by: M,
      note: 'התוצאות תקינות. לחזור על הבדיקה בעוד שנה',
      place: 'קופת חולים, סניף ויצמן'
    }
  });
  b.task({
    id: 'seed-tax-refund',
    title: 'להגיש בקשה להחזר מס על תרומות',
    categoryId: 'finance',
    createdBy: M,
    createdAt: b.at(-80, '21:00'),
    ownerId: M,
    completed: {
      at: b.at(-65, '22:10'),
      by: M,
      note: 'הוגש באתר רשות המסים. הקבלות בתיקייה הירוקה'
    }
  });
  b.task({
    id: 'seed-shoes',
    title: 'להחזיר את הנעליים לחנות',
    categoryId: 'returns',
    createdBy: M,
    createdAt: b.at(-74, '18:00'),
    ownerId: M,
    dueDate: b.day(-70),
    hardDeadline: true,
    completed: {
      at: b.at(-70, '19:10'),
      by: M,
      note: 'קיבלנו זיכוי לחנות, בתוקף לשנה',
      place: 'קניון ערים, כפר סבא'
    }
  });
  const battery = b.task({
    id: 'seed-battery',
    title: 'החלפת מצבר',
    notes: 'הרכב לא הניע הבוקר',
    categoryId: 'car',
    createdBy: D,
    createdAt: b.at(-61, '07:40'),
    ownerId: D,
    completed: {
      at: b.at(-60, '13:20'),
      by: D,
      note: 'מצבר 70 אמפר, אחריות לשנתיים',
      cost: 650,
      place: 'מוסך השרון, כפר סבא',
      contact: 'יוסי · 050-1234567',
      photoIds: ['seed-photo-battery']
    }
  });
  const round2Filled = battery.completedAt!;
  const round2Redeemed = b.at(-57, '21:00');
  b.event('jar_filled', D, null, round2Filled);
  b.event('jar_redeemed', D, null, round2Redeemed);

  b.task({
    id: 'seed-bar-mitzvah',
    title: 'מתנה לבר המצווה של עומר',
    categoryId: 'family',
    createdBy: D,
    createdAt: b.at(-44, '20:30'),
    ownerId: M,
    takenAt: b.at(-44, '21:00'),
    completed: { at: b.at(-40, '13:00'), by: M, note: 'שובר לחנות ספורט', cost: 400 }
  });
  b.task({
    id: 'seed-pest-control',
    title: 'הדברה בבית',
    categoryId: 'home',
    createdBy: M,
    createdAt: b.at(-30, '19:00'),
    ownerId: D,
    requested: true,
    completed: {
      at: b.at(-26, '10:30'),
      by: D,
      note: 'אחריות לשלושה חודשים. לא לשטוף את הרצפה יומיים',
      cost: 280,
      contact: 'הדברה ירוקה · 054-3322110'
    }
  });
  b.task({
    id: 'seed-tire',
    title: 'תיקון פנצ׳ר בגלגל הקדמי',
    categoryId: 'car',
    createdBy: D,
    createdAt: b.at(-9, '07:20'),
    ownerId: D,
    completed: { at: b.at(-9, '18:10'), by: D, cost: 80, place: 'פנצ׳רייה באזור התעשייה' }
  });
  b.task({
    id: 'seed-groceries',
    title: 'הזמנת קניות לשבת',
    categoryId: 'shopping',
    createdBy: M,
    createdAt: b.at(-4, '09:00'),
    ownerId: M,
    completed: {
      at: b.at(-3, '11:30'),
      by: M,
      note: 'ההזמנה הגיעה, חסרו רק עגבניות שרי',
      cost: 735
    }
  });
  b.task({
    id: 'seed-door-handle',
    title: 'תיקון הידית בדלת המרפסת',
    categoryId: 'home',
    createdBy: M,
    createdAt: b.at(-6, '20:00'),
    ownerId: D,
    takenAt: b.at(-5, '08:00'),
    completed: {
      at: b.at(-1, '19:40'),
      by: D,
      note: 'ידית חדשה ממתכת',
      cost: 60,
      place: 'ACE כפר סבא'
    }
  });

  // ── Household, members, invite, jar, treats, photo ─────────────────────────
  const createdAt = b.at(-160, '21:00');
  const inviteAt = b.at(-159, '20:05');
  const daniJoinedAt = b.at(-159, '20:30');
  b.event('member_joined', D, null, daniJoinedAt);

  const household: Household = {
    id: DEMO_HOUSEHOLD_ID,
    name: 'הבית שלנו',
    memberIds: [M, D],
    memberCount: 2,
    maxMembers: 6,
    createdBy: M,
    createdAt,
    jar: { treat: 'ארוחה במסעדה', target: 10, count: 7, round: 3, startedAt: round2Redeemed },
    invite: null
  };
  const members: Record<string, Member> = {
    [M]: {
      uid: M,
      displayName: 'מיכל',
      photoURL: null,
      color: 'terracotta',
      addressAs: 'f',
      role: 'owner',
      joinedAt: createdAt,
      notify: { ...ALL_NOTIFY_ON },
      inviteCode: null
    },
    [D]: {
      uid: D,
      displayName: 'דני',
      photoURL: null,
      color: 'slate',
      addressAs: 'm',
      role: 'member',
      joinedAt: daniJoinedAt,
      notify: { ...ALL_NOTIFY_ON },
      inviteCode: DEMO_INVITE_CODE
    }
  };
  const invite: Invite = {
    code: DEMO_INVITE_CODE,
    householdId: DEMO_HOUSEHOLD_ID,
    householdName: 'הבית שלנו',
    inviterName: 'מיכל',
    createdBy: M,
    createdAt: inviteAt,
    expiresAt: inviteAt + INVITE_TTL,
    revoked: false
  };
  const treats: Record<string, EarnedTreat> = {
    '1': {
      id: '1',
      treat: 'גלידה בנמל',
      target: 5,
      filledAt: round1Filled,
      redeemedAt: round1Redeemed
    },
    '2': {
      id: '2',
      treat: 'סרט בקולנוע',
      target: 5,
      filledAt: round2Filled,
      redeemedAt: round2Redeemed
    }
  };
  const photo: Photo = {
    id: 'seed-photo-battery',
    taskId: battery.id,
    dataUrl: SEED_RECEIPT_JPEG,
    thumbDataUrl: SEED_RECEIPT_THUMB,
    width: 120,
    height: 160,
    createdBy: D,
    createdAt: battery.completedAt!
  };

  const record: HouseholdRecord = {
    household,
    members,
    tasks: b.tasks,
    events: b.sortedEvents(),
    photos: { [photo.id]: photo },
    treats
  };

  return {
    version: DEMO_STATE_VERSION,
    authUid: M,
    lastUid: M,
    users: {
      [M]: { profile: { ...DEMO_USERS[M]! }, householdId: DEMO_HOUSEHOLD_ID, devices: {} },
      [D]: { profile: { ...DEMO_USERS[D]! }, householdId: DEMO_HOUSEHOLD_ID, devices: {} }
    },
    households: { [DEMO_HOUSEHOLD_ID]: record },
    invites: { [DEMO_INVITE_CODE]: invite }
  };
}

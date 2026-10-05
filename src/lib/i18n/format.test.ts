import { describe, expect, it } from 'vitest';
import { addDays } from '../domain/dates';
import {
  ageLabel,
  ageLabelText,
  daysUntil,
  deadlineLabel,
  dueChipLabel,
  elapsedText,
  formatCurrency,
  formatDate,
  formatLongDate,
  formatMonthYear,
  formatNumber,
  formatTime,
  greeting,
  labeledSnoozeOptions,
  monthKey,
  planHint,
  plannedFromLabel,
  pluralDays,
  pluralMonths,
  pluralTasks,
  pluralTimes,
  pluralWeeks,
  pluralYears,
  PRIORITY_LABELS,
  RECURRENCE_LABELS,
  relativeDayLabel,
  SNOOZE_LABELS,
  snoozeBlockedText,
  snoozedLabel,
  validForLabel,
  whenChip
} from './format';

/** Intl wraps currency in bidi marks and a no-break space; compare on the visible text. */
const visible = (s: string) => s.replace(/[\u200E\u200F]/g, '').replace(/\u00A0/g, ' ');

// Fixture clock: Sunday 2026-10-04.
const TODAY = '2026-10-04';

describe('formatLongDate', () => {
  it('writes "יום <weekday>, <day> ב<month>"', () => {
    expect(formatLongDate('2026-10-04')).toBe('יום ראשון, 4 באוקטובר');
    expect(formatLongDate('2026-10-08')).toBe('יום חמישי, 8 באוקטובר');
    expect(formatLongDate('2026-10-10')).toBe('יום שבת, 10 באוקטובר');
  });

  it('has the right name for every month', () => {
    const names = [
      'ינואר',
      'פברואר',
      'מרץ',
      'אפריל',
      'מאי',
      'יוני',
      'יולי',
      'אוגוסט',
      'ספטמבר',
      'אוקטובר',
      'נובמבר',
      'דצמבר'
    ];
    names.forEach((name, i) => {
      const iso = `2026-${String(i + 1).padStart(2, '0')}-15`;
      expect(formatLongDate(iso)).toMatch(new RegExp(`^יום \\S+, 15 ב${name}$`));
    });
  });

  it('has the right name for every weekday', () => {
    const names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    names.forEach((name, i) => {
      expect(formatLongDate(`2026-10-${String(4 + i).padStart(2, '0')}`)).toBe(
        `יום ${name}, ${4 + i} באוקטובר`
      );
    });
  });

  it('does not pad the day', () => {
    expect(formatLongDate('2026-03-07')).toBe('יום שבת, 7 במרץ');
  });
});

describe('relativeDayLabel', () => {
  it('names today, tomorrow and yesterday', () => {
    expect(relativeDayLabel('2026-10-04', TODAY)).toBe('היום');
    expect(relativeDayLabel('2026-10-05', TODAY)).toBe('מחר');
    expect(relativeDayLabel('2026-10-03', TODAY)).toBe('אתמול');
  });

  it('uses the weekday for days 2-6 ahead, abbreviated with a Hebrew geresh (U+05F3)', () => {
    expect(relativeDayLabel('2026-10-06', TODAY)).toBe('יום ג׳'); // +2 Tue
    expect(relativeDayLabel('2026-10-08', TODAY)).toBe('יום ה׳'); // +4 Thu
    expect(relativeDayLabel('2026-10-09', TODAY)).toBe('יום ו׳'); // +5 Fri
  });

  it('calls Saturday "שבת" (no abbreviation)', () => {
    expect(relativeDayLabel('2026-10-10', TODAY)).toBe('שבת'); // +6
  });

  it("switches to a numeric date from +7 days, so it never clashes with today's weekday name", () => {
    expect(relativeDayLabel('2026-10-11', TODAY)).toBe('11/10'); // +7: next Sunday
    expect(relativeDayLabel('2026-10-15', TODAY)).toBe('15/10');
  });

  it('uses a numeric date for the past beyond yesterday', () => {
    expect(relativeDayLabel('2026-10-02', TODAY)).toBe('2/10');
    expect(relativeDayLabel('2026-03-07', TODAY)).toBe('7/3');
  });

  it('appends a two-digit year for another calendar year', () => {
    expect(relativeDayLabel('2027-10-15', TODAY)).toBe('15/10/27');
    expect(relativeDayLabel('2025-12-31', TODAY)).toBe('31/12/25');
    expect(relativeDayLabel('2027-01-03', '2026-12-30')).toBe('יום א׳'); // near ones stay relative
  });

  it('handles the week-name window across a month end', () => {
    expect(relativeDayLabel('2026-11-02', '2026-10-30')).toBe('יום ב׳'); // +3
    expect(relativeDayLabel('2026-11-06', '2026-10-30')).toBe('6/11'); // +7
  });

  it('is DST-safe (+2 days across the spring-forward is still +2)', () => {
    expect(relativeDayLabel('2026-03-28', '2026-03-26')).toBe('שבת');
    expect(relativeDayLabel('2026-10-26', '2026-10-24')).toBe('יום ב׳');
  });
});

describe('dueChipLabel', () => {
  const due = (dueDate: string | null) => ({ dueDate });

  it('says עד + the relative day for dates today or later', () => {
    expect(dueChipLabel(due('2026-10-04'), TODAY)).toBe('עד היום');
    expect(dueChipLabel(due('2026-10-05'), TODAY)).toBe('עד מחר');
    expect(dueChipLabel(due('2026-10-08'), TODAY)).toBe('עד יום ה׳');
    expect(dueChipLabel(due('2026-10-10'), TODAY)).toBe('עד שבת');
    expect(dueChipLabel(due('2026-10-15'), TODAY)).toBe('עד 15/10');
    expect(dueChipLabel(due('2027-10-15'), TODAY)).toBe('עד 15/10/27');
  });

  it('says באיחור של N when overdue, with Hebrew day forms', () => {
    expect(dueChipLabel(due('2026-10-03'), TODAY)).toBe('באיחור של יום');
    expect(dueChipLabel(due('2026-10-02'), TODAY)).toBe('באיחור של יומיים');
    expect(dueChipLabel(due('2026-10-01'), TODAY)).toBe('באיחור של 3 ימים');
    expect(dueChipLabel(due('2026-09-29'), TODAY)).toBe('באיחור של 5 ימים');
    expect(dueChipLabel(due('2026-08-24'), TODAY)).toBe('באיחור של 5 שבועות'); // same scale as age
    expect(dueChipLabel(due('2026-07-24'), TODAY)).toBe('באיחור של חודשיים');
  });

  it('is null when the task has no due date (a soft plan alone has no deadline chip)', () => {
    expect(dueChipLabel(due(null), TODAY)).toBeNull();
  });
});

describe('Hebrew plural helpers', () => {
  it('pluralDays: יום / יומיים / N ימים', () => {
    expect(pluralDays(1)).toBe('יום');
    expect(pluralDays(2)).toBe('יומיים');
    expect(pluralDays(3)).toBe('3 ימים');
    expect(pluralDays(10)).toBe('10 ימים');
    expect(pluralDays(11)).toBe('11 ימים');
    expect(pluralDays(0)).toBe('0 ימים');
  });

  it('pluralWeeks: שבוע / שבועיים / N שבועות', () => {
    expect(pluralWeeks(1)).toBe('שבוע');
    expect(pluralWeeks(2)).toBe('שבועיים');
    expect(pluralWeeks(3)).toBe('3 שבועות');
    expect(pluralWeeks(4)).toBe('4 שבועות');
  });

  it('pluralMonths: חודש / חודשיים / N חודשים', () => {
    expect(pluralMonths(1)).toBe('חודש');
    expect(pluralMonths(2)).toBe('חודשיים');
    expect(pluralMonths(3)).toBe('3 חודשים');
    expect(pluralMonths(11)).toBe('11 חודשים');
  });

  it('pluralYears: שנה / שנתיים / N שנים', () => {
    expect(pluralYears(1)).toBe('שנה');
    expect(pluralYears(2)).toBe('שנתיים');
    expect(pluralYears(5)).toBe('5 שנים');
  });

  it('pluralTasks: משימה אחת / N משימות', () => {
    expect(pluralTasks(1)).toBe('משימה אחת');
    expect(pluralTasks(2)).toBe('2 משימות');
    expect(pluralTasks(3)).toBe('3 משימות');
    expect(pluralTasks(0)).toBe('0 משימות');
    expect(pluralTasks(12)).toBe('12 משימות');
  });

  it('groups thousands in large counts', () => {
    expect(pluralDays(1234)).toBe('1,234 ימים');
  });
});

describe('formatNumber', () => {
  it('uses he-IL digit grouping', () => {
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
  it('keeps up to three decimals', () => {
    expect(formatNumber(3.14159)).toBe('3.142');
  });
});

describe('formatCurrency', () => {
  it('shows whole shekels without decimals, with the ₪ sign', () => {
    expect(visible(formatCurrency(180))).toBe('180 ₪');
    expect(visible(formatCurrency(1234))).toBe('1,234 ₪');
    expect(visible(formatCurrency(0))).toBe('0 ₪');
  });
  it('shows agorot with two decimals when there are any', () => {
    expect(visible(formatCurrency(12.5))).toBe('12.50 ₪');
    expect(visible(formatCurrency(1234.56))).toBe('1,234.56 ₪');
  });
  it('rounds to agorot, and drops the decimals when the rounded amount is whole', () => {
    expect(visible(formatCurrency(10.006))).toBe('10.01 ₪');
    expect(visible(formatCurrency(10.001))).toBe('10 ₪');
    expect(visible(formatCurrency(9.999))).toBe('10 ₪');
  });
  it('handles negatives (refunds)', () => {
    expect(visible(formatCurrency(-45))).toBe('-45 ₪');
  });
  it('never prints "-0": negative zero and amounts that round to zero are plain 0', () => {
    expect(visible(formatCurrency(-0))).toBe('0 ₪');
    expect(visible(formatCurrency(-0.001))).toBe('0 ₪');
  });
  it('returns an empty string for NaN and infinities instead of "NaN ₪"', () => {
    expect(formatCurrency(Number.NaN)).toBe('');
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('greeting', () => {
  it('05:00-11:59 is בוקר טוב', () => {
    expect(greeting(5)).toBe('בוקר טוב');
    expect(greeting(9)).toBe('בוקר טוב');
    expect(greeting(11)).toBe('בוקר טוב');
    expect(greeting(11.99)).toBe('בוקר טוב');
  });
  it('12:00-16:59 is צהריים טובים', () => {
    expect(greeting(12)).toBe('צהריים טובים');
    expect(greeting(16)).toBe('צהריים טובים');
    expect(greeting(16.99)).toBe('צהריים טובים');
  });
  it('17:00-04:59 is ערב טוב (never "לילה טוב", which reads as a farewell)', () => {
    for (const h of [17, 21, 22, 23, 0, 3, 4, 4.99]) expect(greeting(h)).toBe('ערב טוב');
  });
});

describe('formatTime', () => {
  it('returns HH:mm', () => {
    expect(formatTime('17:30')).toBe('17:30');
    expect(formatTime('00:00')).toBe('00:00');
    expect(formatTime('23:59')).toBe('23:59');
  });
  it('pads a single-digit hour', () => {
    expect(formatTime('9:05')).toBe('09:05');
  });
  it('returns unparseable input unchanged instead of inventing a time', () => {
    expect(formatTime('')).toBe('');
    expect(formatTime('soon')).toBe('soon');
    expect(formatTime('24:00')).toBe('24:00');
    expect(formatTime('12:60')).toBe('12:60');
  });
});

describe('elapsedText (the shared age / lateness scale, calendar-aware)', () => {
  it('counts days below a week', () => {
    expect(elapsedText('2026-10-03', TODAY)).toBe('יום');
    expect(elapsedText('2026-10-02', TODAY)).toBe('יומיים');
    expect(elapsedText('2026-09-28', TODAY)).toBe('6 ימים');
    expect(elapsedText(TODAY, TODAY)).toBe('0 ימים');
  });

  it('counts whole weeks from 7 days up to 8 weeks (59 days)', () => {
    expect(elapsedText('2026-09-27', TODAY)).toBe('שבוע');
    expect(elapsedText('2026-09-21', TODAY)).toBe('שבוע'); // 13 days
    expect(elapsedText('2026-09-20', TODAY)).toBe('שבועיים');
    expect(elapsedText('2026-09-13', TODAY)).toBe('3 שבועות');
    expect(elapsedText('2026-09-05', TODAY)).toBe('4 שבועות'); // 29 days
    expect(elapsedText('2026-09-04', TODAY)).toBe('4 שבועות'); // 30 days: a calendar month, still weeks
    expect(elapsedText('2026-02-01', '2026-03-01')).toBe('4 שבועות'); // a full February
    expect(elapsedText('2026-08-23', TODAY)).toBe('6 שבועות'); // 42 days
    expect(elapsedText('2026-08-16', TODAY)).toBe('7 שבועות'); // 49 days
    expect(elapsedText('2026-08-09', TODAY)).toBe('8 שבועות'); // 56 days
    expect(elapsedText('2026-08-06', TODAY)).toBe('8 שבועות'); // 59 days
  });

  it('switches to calendar months at 60 days, starting at חודשיים (never back to "חודש")', () => {
    expect(elapsedText('2026-08-05', TODAY)).toBe('חודשיים'); // 60 days
    expect(elapsedText('2026-07-31', '2026-09-29')).toBe('חודשיים'); // 60 days, 1 calendar month
    expect(elapsedText('2026-08-04', TODAY)).toBe('חודשיים');
    expect(elapsedText('2026-07-05', TODAY)).toBe('חודשיים'); // a day short of three months
    expect(elapsedText('2026-07-04', TODAY)).toBe('3 חודשים'); // same day of the month
    expect(elapsedText('2026-01-31', '2026-04-30')).toBe('3 חודשים'); // month end, clamped
    expect(elapsedText('2025-10-05', TODAY)).toBe('11 חודשים'); // a day short of a year
  });

  it('switches to years at 12 calendar months', () => {
    expect(elapsedText('2025-10-04', TODAY)).toBe('שנה');
    expect(elapsedText('2024-10-05', TODAY)).toBe('שנה');
    expect(elapsedText('2024-10-04', TODAY)).toBe('שנתיים');
    expect(elapsedText('2023-01-01', TODAY)).toBe('3 שנים');
    expect(elapsedText('2024-02-29', '2025-02-28')).toBe('שנה'); // Feb 29 + 1 year clamps to Feb 28
  });

  it('is empty for a reversed span or a malformed date', () => {
    expect(elapsedText('2026-10-05', TODAY)).toBe('');
    expect(elapsedText('2026-02-30', TODAY)).toBe('');
    expect(elapsedText(TODAY, 'tomorrow')).toBe('');
  });
});

describe('ageLabelText (Hebrew copy for the age badge)', () => {
  it('is "חדשה" for days 0 and 1 (and for a start in the future)', () => {
    expect(ageLabelText(TODAY, TODAY)).toBe('חדשה');
    expect(ageLabelText('2026-10-03', TODAY)).toBe('חדשה');
    expect(ageLabelText('2026-10-14', TODAY)).toBe('חדשה');
  });

  it('prefixes the elapsed scale with "פתוחה" from day 2', () => {
    expect(ageLabelText('2026-10-02', TODAY)).toBe('פתוחה יומיים');
    expect(ageLabelText('2026-09-28', TODAY)).toBe('פתוחה 6 ימים');
    expect(ageLabelText('2026-09-27', TODAY)).toBe('פתוחה שבוע');
    expect(ageLabelText('2026-09-13', TODAY)).toBe('פתוחה 3 שבועות');
    expect(ageLabelText('2026-09-05', TODAY)).toBe('פתוחה 4 שבועות');
    expect(ageLabelText('2026-09-04', TODAY)).toBe('פתוחה 4 שבועות');
    expect(ageLabelText('2026-08-16', TODAY)).toBe('פתוחה 7 שבועות');
    expect(ageLabelText('2026-08-04', TODAY)).toBe('פתוחה חודשיים');
    expect(ageLabelText('2025-10-05', TODAY)).toBe('פתוחה 11 חודשים');
    expect(ageLabelText('2025-10-04', TODAY)).toBe('פתוחה שנה');
  });

  it('is empty for malformed dates', () => {
    expect(ageLabelText('', TODAY)).toBe('');
    expect(ageLabelText(TODAY, '2026-13-01')).toBe('');
  });
});

describe('ageLabel (the age badge of a task: ageLabelText from domain ageStart)', () => {
  const NOW = Date.parse(`${TODAY}T09:00:00+03:00`);
  /** createdAt `n` calendar days before NOW, same local time. */
  const created = (n: number) => Date.parse(`${addDays(TODAY, -n)}T09:00:00+03:00`);
  const oneOff = (createdAt: number) => ({
    createdAt,
    seriesId: null,
    dueDate: null,
    scheduledFor: null
  });
  const label = (days: number) => ageLabel(oneOff(created(days)), NOW);

  it('is "חדשה" for the first two days', () => {
    expect(label(0)).toBe('חדשה');
    expect(label(1)).toBe('חדשה');
  });

  it('counts days, then weeks up to 8, then calendar months, then years', () => {
    expect(label(2)).toBe('פתוחה יומיים');
    expect(label(6)).toBe('פתוחה 6 ימים');
    expect(label(7)).toBe('פתוחה שבוע');
    expect(label(14)).toBe('פתוחה שבועיים');
    expect(label(21)).toBe('פתוחה 3 שבועות');
    expect(label(30)).toBe('פתוחה 4 שבועות');
    expect(label(31)).toBe('פתוחה 4 שבועות'); // used to read "פתוחה חודש" (council B)
    expect(label(59)).toBe('פתוחה 8 שבועות');
    expect(label(60)).toBe('פתוחה חודשיים');
    expect(label(61)).toBe('פתוחה חודשיים');
    expect(label(364)).toBe('פתוחה 11 חודשים');
    expect(label(365)).toBe('פתוחה שנה');
    expect(label(731)).toBe('פתוחה שנתיים');
  });

  it('the seed AC task, created 49 days ago at 21:00, reads "פתוחה 7 שבועות"', () => {
    const ac = oneOff(Date.parse('2026-08-16T21:00:00+03:00'));
    expect(ageLabel(ac, NOW)).toBe('פתוחה 7 שבועות');
  });

  it('a monthly ארנונה instance due in 10 days reads "חדשה" even though it was created weeks ago', () => {
    const arnona = { ...oneOff(created(25)), seriesId: 'arnona', dueDate: '2026-10-14' };
    expect(ageLabel(arnona, NOW)).toBe('חדשה');
    const lateArnona = { ...arnona, dueDate: '2026-09-27' };
    expect(ageLabel(lateArnona, NOW)).toBe('פתוחה שבוע'); // from its own date, not from creation
  });

  it('accepts a Date and an explicit tz', () => {
    expect(ageLabel(oneOff(created(14)), new Date(NOW))).toBe('פתוחה שבועיים');
    expect(ageLabel(oneOff(created(14)), NOW, 'Asia/Jerusalem')).toBe('פתוחה שבועיים');
    // 01:30 on 10-03 in Jerusalem is still 10-02 in UTC
    const smallHours = oneOff(Date.parse('2026-10-03T01:30:00+03:00'));
    expect(ageLabel(smallHours, NOW)).toBe('חדשה');
    expect(ageLabel(smallHours, NOW, 'UTC')).toBe('פתוחה יומיים');
  });
});

describe('whenChip (date + time chip with a tone)', () => {
  const chip = (
    over: { dueDate?: string | null; scheduledFor?: string | null; dueTime?: string | null },
    now?: { hour: number; minute: number }
  ) => whenChip({ dueDate: null, scheduledFor: null, dueTime: null, ...over }, TODAY, now);

  it('is null when the task has no date and no time', () => {
    expect(chip({})).toBeNull();
    expect(chip({ dueTime: 'nope' })).toBeNull();
  });

  it('a time with no date still shows (launch audit CON-1: quick add once saved one)', () => {
    expect(chip({ dueTime: '16:30' })).toEqual({ text: '16:30', tone: 'normal' });
    expect(chip({ dueTime: '9:05' }, { hour: 23, minute: 0 })).toEqual({
      text: '09:05',
      tone: 'normal'
    });
  });

  it('a due date is prefixed with "עד"; a soft plan is not', () => {
    expect(chip({ dueDate: '2026-10-15' })).toEqual({ text: 'עד 15/10', tone: 'normal' });
    expect(chip({ scheduledFor: '2026-10-15' })).toEqual({ text: '15/10', tone: 'normal' });
  });

  it('prefers the due date when both dates exist', () => {
    expect(chip({ dueDate: '2026-10-15', scheduledFor: '2026-10-05' })?.text).toBe('עד 15/10');
  });

  it('appends dueTime (padded to HH:mm)', () => {
    expect(chip({ dueDate: TODAY, dueTime: '17:30' })).toEqual({
      text: 'עד היום 17:30',
      tone: 'today'
    });
    expect(chip({ scheduledFor: '2026-10-05', dueTime: '17:30' })).toEqual({
      text: 'מחר 17:30',
      tone: 'soon'
    });
    expect(chip({ scheduledFor: '2026-10-11', dueTime: '9:05' })?.text).toBe('11/10 09:05');
    expect(chip({ scheduledFor: '2026-10-07', dueTime: '17:30' })?.text).toBe('יום ד׳ 17:30');
  });

  it('ignores an unparseable dueTime', () => {
    expect(chip({ dueDate: TODAY, dueTime: '25:00' })?.text).toBe('עד היום');
  });

  it('tone: today for today, soon for the next two days, normal after that', () => {
    expect(chip({ scheduledFor: TODAY })).toEqual({ text: 'היום', tone: 'today' });
    expect(chip({ dueDate: '2026-10-05' })).toEqual({ text: 'עד מחר', tone: 'soon' });
    expect(chip({ dueDate: '2026-10-06' })).toEqual({ text: 'עד יום ג׳', tone: 'soon' });
    expect(chip({ dueDate: '2026-10-07' })).toEqual({ text: 'עד יום ד׳', tone: 'normal' });
  });

  it('overdue (a missed due date) uses the age-like scale and the late tone', () => {
    const late = (dueDate: string) => chip({ dueDate, dueTime: '17:30' });
    expect(late('2026-10-03')).toEqual({ text: 'באיחור של יום', tone: 'late' });
    expect(late('2026-10-02')?.text).toBe('באיחור של יומיים');
    expect(late('2026-10-01')?.text).toBe('באיחור של 3 ימים');
    expect(late('2026-09-27')?.text).toBe('באיחור של שבוע');
    expect(late('2026-09-13')?.text).toBe('באיחור של 3 שבועות');
    expect(late('2026-08-04')?.text).toBe('באיחור של חודשיים');
  });

  it('a missed soft plan is not "late": it reads as planned-for and sits with today', () => {
    expect(chip({ scheduledFor: '2026-10-03' })).toEqual({
      text: 'תוכננה לאתמול',
      tone: 'today'
    });
  });

  it('due today with the time already passed: "· הזמן עבר" and the late tone', () => {
    const at = (hour: number, minute: number) =>
      chip({ dueDate: TODAY, dueTime: '09:00' }, { hour, minute });
    expect(at(9, 1)).toEqual({ text: 'היום 09:00 · הזמן עבר', tone: 'late' });
    expect(at(23, 59)).toEqual({ text: 'היום 09:00 · הזמן עבר', tone: 'late' });
    expect(at(9, 0)).toEqual({ text: 'עד היום 09:00', tone: 'today' }); // the due minute itself
    expect(at(8, 59)).toEqual({ text: 'עד היום 09:00', tone: 'today' });
    expect(chip({ scheduledFor: TODAY, dueTime: '09:00' }, { hour: 10, minute: 0 })).toEqual({
      text: 'היום 09:00 · הזמן עבר',
      tone: 'late'
    });
  });

  describe('planned for today (or a missed plan) with a LATER due date: both facts', () => {
    it('"היום · עד 14/10": the card in Today says why it is there and when it is due', () => {
      expect(chip({ scheduledFor: TODAY, dueDate: '2026-10-14' })).toEqual({
        text: 'היום · עד 14/10',
        tone: 'today'
      });
      expect(chip({ scheduledFor: TODAY, dueDate: '2026-10-07', dueTime: '17:00' })).toEqual({
        text: 'היום · עד יום ד׳ 17:00',
        tone: 'today'
      });
    });

    it('a missed plan with a later due date: "תוכננה לאתמול · עד מחר"', () => {
      expect(chip({ scheduledFor: '2026-10-03', dueDate: '2026-10-05' })).toEqual({
        text: 'תוכננה לאתמול · עד מחר',
        tone: 'today'
      });
    });

    it('due today or overdue keeps the deadline chip; a later plan does not change it', () => {
      expect(chip({ scheduledFor: TODAY, dueDate: TODAY })?.text).toBe('עד היום');
      expect(chip({ scheduledFor: '2026-10-03', dueDate: '2026-10-03' })?.text).toBe(
        'באיחור של יום'
      );
      expect(chip({ scheduledFor: '2026-10-06', dueDate: '2026-10-14' })?.text).toBe('עד 14/10');
    });
  });

  describe('week plans (weekPlan, no due date): a week, never a day', () => {
    const week = (scheduledFor: string, today = TODAY) =>
      whenChip({ dueDate: null, scheduledFor, dueTime: null, weekPlan: true }, today);

    it('this week (up to the week horizon) is "השבוע"', () => {
      expect(week('2026-10-10')).toEqual({ text: 'השבוע', tone: 'normal' }); // Sunday, this Saturday
      expect(week('2026-10-10', '2026-10-08')).toEqual({ text: 'השבוע', tone: 'normal' });
      // Friday: the horizon is next Saturday, so both Saturdays read as this week
      expect(week('2026-10-10', '2026-10-09')).toEqual({ text: 'השבוע', tone: 'normal' });
      expect(week('2026-10-17', '2026-10-09')).toEqual({ text: 'השבוע', tone: 'normal' });
    });

    it('on its last day (the Saturday itself) it is "סוף השבוע" with the today tone', () => {
      expect(week('2026-10-10', '2026-10-10')).toEqual({ text: 'סוף השבוע', tone: 'today' });
    });

    it('the Saturday right after the horizon is "בשבוע הבא"; later weeks are dated', () => {
      expect(week('2026-10-17')).toEqual({ text: 'בשבוע הבא', tone: 'normal' });
      expect(week('2026-10-24', '2026-10-09')).toEqual({ text: 'בשבוע הבא', tone: 'normal' });
      expect(week('2026-10-24')).toEqual({ text: 'שבוע של 24/10', tone: 'normal' });
      expect(week('2027-01-09')).toEqual({ text: 'שבוע של 9/1/27', tone: 'normal' });
    });

    it('a missed week plan is "תוכננה לשבוע שעבר" and sits with today', () => {
      expect(week('2026-10-03')).toEqual({ text: 'תוכננה לשבוע שעבר', tone: 'today' });
      expect(week('2026-09-26')).toEqual({ text: 'תוכננה לשבוע שעבר', tone: 'today' });
    });

    it('ignores dueTime (a week has no hour) and yields to a due date', () => {
      expect(
        whenChip(
          { dueDate: null, scheduledFor: '2026-10-10', dueTime: '17:00', weekPlan: true },
          TODAY
        )
      ).toEqual({ text: 'השבוע', tone: 'normal' });
      expect(
        whenChip(
          { dueDate: '2026-10-08', scheduledFor: '2026-10-10', dueTime: null, weekPlan: true },
          TODAY
        )?.text
      ).toBe('עד יום ה׳');
    });

    it('a plain day plan on a Saturday still reads as the day', () => {
      expect(
        whenChip(
          { dueDate: null, scheduledFor: '2026-10-10', dueTime: null, weekPlan: false },
          TODAY
        )
      ).toEqual({ text: 'שבת', tone: 'normal' });
    });

    it('is null for a malformed week date', () => {
      expect(week('2026-10-32')).toBeNull();
    });
  });

  it('without `now` (or without a dueTime) it cannot tell that the time passed', () => {
    expect(chip({ dueDate: TODAY, dueTime: '09:00' })?.tone).toBe('today');
    expect(chip({ dueDate: TODAY }, { hour: 23, minute: 0 })?.tone).toBe('today');
  });

  it('a future day with a time that is "earlier" than now is not passed', () => {
    expect(chip({ dueDate: '2026-10-05', dueTime: '09:00' }, { hour: 20, minute: 0 })).toEqual({
      text: 'עד מחר 09:00',
      tone: 'soon'
    });
  });

  it('is null for malformed dates instead of throwing', () => {
    expect(chip({ dueDate: '2026-02-31' })).toBeNull();
    expect(whenChip({ dueDate: TODAY, scheduledFor: null, dueTime: null }, 'nope')).toBeNull();
  });
});

describe('pluralTimes / snoozedLabel', () => {
  it('pluralTimes: פעם אחת / פעמיים / N פעמים', () => {
    expect(pluralTimes(1)).toBe('פעם אחת');
    expect(pluralTimes(2)).toBe('פעמיים');
    expect(pluralTimes(3)).toBe('3 פעמים');
    expect(pluralTimes(11)).toBe('11 פעמים');
  });

  it('snoozedLabel: נדחתה פעם אחת / פעמיים / N פעמים, empty when never snoozed', () => {
    expect(snoozedLabel(1)).toBe('נדחתה פעם אחת');
    expect(snoozedLabel(2)).toBe('נדחתה פעמיים');
    expect(snoozedLabel(4)).toBe('נדחתה 4 פעמים');
    expect(snoozedLabel(0)).toBe('');
    expect(snoozedLabel(Number.NaN)).toBe('');
  });
});

describe('plannedFromLabel (feminine past: the subject is משימה)', () => {
  it('says "תוכננה לאתמול" for yesterday', () => {
    expect(plannedFromLabel('2026-10-03', TODAY)).toBe('תוכננה לאתמול');
  });

  it('names the weekday within the last 6 days (שבת without "יום")', () => {
    expect(plannedFromLabel('2026-10-02', TODAY)).toBe('תוכננה ליום ו׳'); // -2
    expect(plannedFromLabel('2026-10-01', TODAY)).toBe('תוכננה ליום ה׳'); // -3
    expect(plannedFromLabel('2026-09-28', TODAY)).toBe('תוכננה ליום ב׳'); // -6
    expect(plannedFromLabel('2026-10-03', '2026-10-05')).toBe('תוכננה לשבת');
  });

  it('uses a numeric date from a week back, with a hyphen after ל', () => {
    expect(plannedFromLabel('2026-09-27', TODAY)).toBe('תוכננה ל-27/9'); // -7: same weekday
    expect(plannedFromLabel('2025-12-30', '2026-01-10')).toBe('תוכננה ל-30/12/25');
  });

  it('is empty when the plan is today or ahead, or a date is malformed', () => {
    expect(plannedFromLabel(TODAY, TODAY)).toBe('');
    expect(plannedFromLabel('2026-10-05', TODAY)).toBe('');
    expect(plannedFromLabel('27/9', TODAY)).toBe('');
  });
});

describe('formatDate / formatMonthYear / monthKey', () => {
  const MARCH_14_2025_NOON = Date.parse('2025-03-14T12:00:00+02:00');

  it('formatDate: "14 במרץ", with the year on request', () => {
    expect(formatDate('2025-03-14')).toBe('14 במרץ');
    expect(formatDate('2025-03-14', { withYear: true })).toBe('14 במרץ 2025');
  });

  it('formatDate: adds the year automatically when `today` is in another year', () => {
    expect(formatDate('2025-03-14', { today: TODAY })).toBe('14 במרץ 2025');
    expect(formatDate('2026-03-14', { today: TODAY })).toBe('14 במרץ');
    expect(formatDate('2025-03-14', { today: TODAY, withYear: false })).toBe('14 במרץ');
    expect(formatDate('2025-03-14', { today: 'garbage' })).toBe('14 במרץ');
  });

  it('formatDate: accepts epoch millis (calendar date in Asia/Jerusalem, or a given tz)', () => {
    expect(formatDate(MARCH_14_2025_NOON)).toBe('14 במרץ');
    const lateUtc = Date.parse('2026-10-03T22:30:00Z'); // Oct 4 in Jerusalem, Oct 3 in LA
    expect(formatDate(lateUtc)).toBe('4 באוקטובר');
    expect(formatDate(lateUtc, { tz: 'America/Los_Angeles' })).toBe('3 באוקטובר');
  });

  it('formatMonthYear: "אוקטובר 2026"; monthKey: "2026-10" (sortable group key)', () => {
    expect(formatMonthYear('2026-10-04')).toBe('אוקטובר 2026');
    expect(formatMonthYear(MARCH_14_2025_NOON)).toBe('מרץ 2025');
    expect(monthKey('2026-10-04')).toBe('2026-10');
    expect(monthKey(MARCH_14_2025_NOON)).toBe('2025-03');
    expect(monthKey(Date.parse('2026-10-31T22:30:00Z'))).toBe('2026-11'); // Jerusalem is already Nov 1
    expect(monthKey(Date.parse('2026-10-31T22:30:00Z'), 'UTC')).toBe('2026-10');
  });
});

describe('daysUntil / validForLabel (invite expiry)', () => {
  const NOW = Date.parse('2026-10-04T09:00:00+03:00');
  const at = (iso: string) => Date.parse(iso);

  it('daysUntil counts calendar days in Asia/Jerusalem (negative once the date has passed)', () => {
    expect(daysUntil(at('2026-10-10T13:00:00+03:00'), NOW)).toBe(6);
    expect(daysUntil(at('2026-10-05T00:30:00+03:00'), NOW)).toBe(1);
    expect(daysUntil(at('2026-10-04T23:00:00+03:00'), new Date(NOW))).toBe(0);
    expect(daysUntil(at('2026-10-02T09:00:00+03:00'), NOW)).toBe(-2);
    expect(daysUntil(at('2026-10-04T23:00:00Z'), NOW, 'UTC')).toBe(0);
    expect(daysUntil(Number.NaN, NOW)).toBeNaN();
  });

  it('validForLabel: בתוקף עוד N ימים / עד מחר / עד היום / פג תוקף', () => {
    expect(validForLabel(at('2026-10-10T13:00:00+03:00'), NOW)).toBe('בתוקף עוד 6 ימים');
    expect(validForLabel(at('2026-10-06T08:00:00+03:00'), NOW)).toBe('בתוקף עוד יומיים');
    expect(validForLabel(at('2026-10-05T08:00:00+03:00'), NOW)).toBe('בתוקף עד מחר');
    expect(validForLabel(at('2026-10-04T23:00:00+03:00'), NOW)).toBe('בתוקף עד היום');
    expect(validForLabel(NOW, NOW)).toBe('פג תוקף');
    expect(validForLabel(at('2026-10-01T09:00:00+03:00'), new Date(NOW))).toBe('פג תוקף');
  });

  it('validForLabel is empty for invalid instants', () => {
    expect(validForLabel(Number.NaN, NOW)).toBe('');
    expect(validForLabel(NOW, new Date('nope'))).toBe('');
  });
});

describe('SNOOZE_LABELS / labeledSnoozeOptions / snoozeBlockedText', () => {
  it('has the four Hebrew snooze labels', () => {
    expect(SNOOZE_LABELS).toEqual({
      tomorrow: 'מחר',
      weekend: 'סוף השבוע',
      nextWeek: 'שבוע הבא',
      month: 'בעוד חודש'
    });
  });

  it('labels the domain options (deduped and sorted there) for the snooze sheet', () => {
    const free = { dueDate: null, hardDeadline: false };
    expect(labeledSnoozeOptions(free, '2026-10-09')).toEqual([
      { key: 'tomorrow', label: 'מחר', date: '2026-10-10' },
      { key: 'nextWeek', label: 'שבוע הבא', date: '2026-10-11' },
      { key: 'weekend', label: 'סוף השבוע', date: '2026-10-16' },
      { key: 'month', label: 'בעוד חודש', date: '2026-11-09' }
    ]);
    expect(labeledSnoozeOptions({ dueDate: TODAY, hardDeadline: true }, TODAY)).toEqual([]);
  });

  it('explains a blocked snooze', () => {
    expect(snoozeBlockedText('deadline-today')).toBe('היום המועד האחרון, אי אפשר לדחות');
  });
});

describe('planHint (the "missed plan" line on a card, week-plan aware)', () => {
  const hint = (over: {
    scheduledFor?: string | null;
    dueDate?: string | null;
    weekPlan?: boolean;
  }) => planHint({ scheduledFor: null, dueDate: null, weekPlan: false, ...over }, TODAY);

  it('a missed day plan: plannedFromLabel', () => {
    expect(hint({ scheduledFor: '2026-10-03' })).toBe('תוכננה לאתמול');
    expect(hint({ scheduledFor: '2026-10-01' })).toBe('תוכננה ליום ה׳');
    expect(hint({ scheduledFor: '2026-10-03', dueDate: '2026-10-09' })).toBe('תוכננה לאתמול');
  });

  it('a missed week plan: "תוכננה לשבוע שעבר"', () => {
    expect(hint({ scheduledFor: '2026-10-03', weekPlan: true })).toBe('תוכננה לשבוע שעבר');
  });

  it('nothing for a plan today or ahead, an overdue task, no plan, or a malformed date', () => {
    expect(hint({ scheduledFor: TODAY })).toBe('');
    expect(hint({ scheduledFor: '2026-10-10', weekPlan: true })).toBe('');
    expect(hint({ scheduledFor: '2026-10-02', dueDate: '2026-10-03' })).toBe(''); // overdue shouts
    expect(hint({})).toBe('');
    expect(hint({ scheduledFor: '2026-13-01', weekPlan: true })).toBe('');
  });
});

describe('deadlineLabel (the hard-deadline badge)', () => {
  const hard = (dueDate: string | null, hardDeadline = true) =>
    deadlineLabel({ dueDate, hardDeadline }, TODAY);

  it('"מועד אחרון: יום ד׳" (the weekday with "יום", never a bare letter)', () => {
    expect(hard('2026-10-07')).toBe('מועד אחרון: יום ד׳');
    expect(hard('2026-10-10')).toBe('מועד אחרון: שבת');
    expect(hard(TODAY)).toBe('מועד אחרון: היום');
    expect(hard('2026-10-05')).toBe('מועד אחרון: מחר');
    expect(hard('2026-10-15')).toBe('מועד אחרון: 15/10');
  });

  it('null without a hard deadline, without a date, or for a malformed date', () => {
    expect(hard('2026-10-07', false)).toBeNull();
    expect(hard(null)).toBeNull();
    expect(hard('2026-02-30')).toBeNull();
  });
});

describe('PRIORITY_LABELS / RECURRENCE_LABELS', () => {
  it('names every priority and recurrence in Hebrew', () => {
    expect(PRIORITY_LABELS).toEqual({ normal: 'רגילה', high: 'חשוב', urgent: 'דחוף' });
    expect(RECURRENCE_LABELS).toEqual({ weekly: 'כל שבוע', monthly: 'כל חודש', yearly: 'כל שנה' });
  });
});

describe('malformed-date policy: formatters never throw', () => {
  const bad = ['', '2026-02-30', '2026-1-5', 'garbage'];

  it('string formatters return "" and nullable ones return null', () => {
    for (const iso of bad) {
      expect(formatLongDate(iso)).toBe('');
      expect(relativeDayLabel(iso, TODAY)).toBe('');
      expect(relativeDayLabel(TODAY, iso)).toBe('');
      expect(dueChipLabel({ dueDate: iso }, TODAY)).toBeNull();
      expect(formatDate(iso)).toBe('');
      expect(formatMonthYear(iso)).toBe('');
      expect(monthKey(iso)).toBe('');
      expect(plannedFromLabel(iso, TODAY)).toBe('');
    }
  });

  it('invalid epoch millis give "" too', () => {
    expect(formatDate(Number.NaN)).toBe('');
    expect(formatMonthYear(Number.POSITIVE_INFINITY)).toBe('');
    expect(monthKey(9e15)).toBe('');
  });
});

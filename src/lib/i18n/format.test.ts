import { describe, expect, it } from 'vitest';
import {
  dueChipLabel,
  formatCurrency,
  formatLongDate,
  formatNumber,
  formatTime,
  greeting,
  pluralDays,
  pluralMonths,
  pluralTasks,
  pluralWeeks,
  pluralYears,
  relativeDayLabel
} from './format';

/** Intl wraps currency in bidi marks and a no-break space; compare on the visible text. */
const visible = (s: string) => s.replace(/[‎‏]/g, '').replace(/ /g, ' ');

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

  it('uses the weekday for days 2-6 ahead', () => {
    expect(relativeDayLabel('2026-10-06', TODAY)).toBe("יום ג'"); // +2 Tue
    expect(relativeDayLabel('2026-10-08', TODAY)).toBe("יום ה'"); // +4 Thu
    expect(relativeDayLabel('2026-10-09', TODAY)).toBe("יום ו'"); // +5 Fri
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
    expect(relativeDayLabel('2027-01-03', '2026-12-30')).toBe("יום א'"); // near ones stay relative
  });

  it('handles the week-name window across a month end', () => {
    expect(relativeDayLabel('2026-11-02', '2026-10-30')).toBe("יום ב'"); // +3
    expect(relativeDayLabel('2026-11-06', '2026-10-30')).toBe('6/11'); // +7
  });

  it('is DST-safe (+2 days across the spring-forward is still +2)', () => {
    expect(relativeDayLabel('2026-03-28', '2026-03-26')).toBe('שבת');
    expect(relativeDayLabel('2026-10-26', '2026-10-24')).toBe("יום ב'");
  });
});

describe('dueChipLabel', () => {
  const due = (dueDate: string | null) => ({ dueDate });

  it('says עד + the relative day for dates today or later', () => {
    expect(dueChipLabel(due('2026-10-04'), TODAY)).toBe('עד היום');
    expect(dueChipLabel(due('2026-10-05'), TODAY)).toBe('עד מחר');
    expect(dueChipLabel(due('2026-10-08'), TODAY)).toBe("עד יום ה'");
    expect(dueChipLabel(due('2026-10-10'), TODAY)).toBe('עד שבת');
    expect(dueChipLabel(due('2026-10-15'), TODAY)).toBe('עד 15/10');
    expect(dueChipLabel(due('2027-10-15'), TODAY)).toBe('עד 15/10/27');
  });

  it('says באיחור של N when overdue, with Hebrew day forms', () => {
    expect(dueChipLabel(due('2026-10-03'), TODAY)).toBe('באיחור של יום');
    expect(dueChipLabel(due('2026-10-02'), TODAY)).toBe('באיחור של יומיים');
    expect(dueChipLabel(due('2026-10-01'), TODAY)).toBe('באיחור של 3 ימים');
    expect(dueChipLabel(due('2026-09-29'), TODAY)).toBe('באיחור של 5 ימים');
    expect(dueChipLabel(due('2026-08-24'), TODAY)).toBe('באיחור של 41 ימים');
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
  it('17:00-21:59 is ערב טוב', () => {
    expect(greeting(17)).toBe('ערב טוב');
    expect(greeting(21)).toBe('ערב טוב');
    expect(greeting(21.99)).toBe('ערב טוב');
  });
  it('22:00-04:59 is לילה טוב', () => {
    expect(greeting(22)).toBe('לילה טוב');
    expect(greeting(23)).toBe('לילה טוב');
    expect(greeting(0)).toBe('לילה טוב');
    expect(greeting(4)).toBe('לילה טוב');
    expect(greeting(4.99)).toBe('לילה טוב');
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

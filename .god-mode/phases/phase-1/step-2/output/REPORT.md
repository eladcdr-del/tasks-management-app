# Step 1.2 REPORT: domain logic (summary of the worker hand-back)

**Status:** DONE. Merged from branch worktree-agent-ad6872d0926d15350 (b6a0d65).

**Coverage:** 100% lines, branches and functions (domain + format).
- 311 tests, also run under TZ=America/Los_Angeles and TZ=Pacific/Kiritimati.
- check: 0/0.

## API
- **dates:** DEFAULT_TZ, toISO, parseISO, isValidISO, daysInMonth, todayISO, localTimeParts, addDays, addMonths (clamp), addYears, diffDays(a,b)=a−b, weekday, startOfWeek, endOfWeek, endOfMonth, nextWeekday (strictly after), compareISO, minISO.
- **buckets:** effectiveDate, bucketOf, bucketInfo → {bucket, plannedFromPast}, needsAttention, sortTasks, groupTasks → {attention, waiting, today, week, later}, pulseCounts, openCountsByMember.
- **age:** ageDays, ageLabel, isStuck, STUCK_AGE_DAYS=21, STUCK_SNOOZE_COUNT=3.
- **recurrence:** nextOccurrence (returns null for non-recurring), nextTaskId, buildNextInstance (returns Task | null).
- **jar:** isFull, remaining, progress, applyCompletion, applyReopen, applyRedeem(jar, now). All are null-safe.
- **categories:** DEFAULT_CATEGORIES, CATEGORY_ORDER, getCategory.
- **ids:** randomId, inviteCode (24 chars, base62), isInviteCode, deviceId. Each throws if Web Crypto is missing.
- **search:** normalizeHebrew, tokenize, matchesQuery (strips up to 2 prefix letters, prefix match), searchDoneTasks.
- **i18n/format:** formatLongDate, relativeDayLabel, dueChipLabel (returns null when there is no dueDate), formatCurrency, formatNumber, pluralDays/Weeks/Months/Years/Tasks, greeting, formatTime.

## Decisions
- `attention` removes tasks from all other lists.
- `waiting` holds unowned tasks not in attention. It does NOT remove them from their time bucket, so pulse counts can overlap.
- Age uses calendar days in Asia/Jerusalem. Thresholds: 0-1 days = חדשה, then days, then weeks, then months, then years.
- Recurrence rolls forward, anchored to the original date. The next instance gets dueDate if the source had one, otherwise scheduledFor. dueTime is copied.
- Search does no stemming: "החלפנו" does not match "החלפת". The stem and noun forms are tested.
- The label for Saturday is "שבת". `formatCurrency` prints whole shekels as "180 ₪".

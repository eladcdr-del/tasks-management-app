<script lang="ts">
  // Dev gallery (#/dev/gallery, dev + E2E builds only). Every design-system component in every
  // state, a theme switch, member colours, and a mock Home composition. Owner: step 1.4.
  import Plus from '@lucide/svelte/icons/plus';
  import Share2 from '@lucide/svelte/icons/share-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Check from '@lucide/svelte/icons/check';
  import Settings from '@lucide/svelte/icons/settings';
  import Search from '@lucide/svelte/icons/search';
  import Pencil from '@lucide/svelte/icons/pencil';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Clock from '@lucide/svelte/icons/clock';
  import Flag from '@lucide/svelte/icons/flag';
  import Car from '@lucide/svelte/icons/car';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Bell from '@lucide/svelte/icons/bell';
  import Users from '@lucide/svelte/icons/users';
  import SunMoon from '@lucide/svelte/icons/sun-moon';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Sunrise from '@lucide/svelte/icons/sunrise';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
  import Gift from '@lucide/svelte/icons/gift';

  import {
    Avatar,
    AvatarStack,
    Badge,
    BottomSheet,
    Button,
    Card,
    Chip,
    CompletionCircle,
    Dialog,
    EmptyState,
    Fab,
    IconButton,
    ListRow,
    MemberChip,
    NumberField,
    ProgressBar,
    SectionHeader,
    SegmentedControl,
    Skeleton,
    Snackbar,
    Spinner,
    Stepper,
    SyncIndicator,
    TextArea,
    TextField,
    Toggle
  } from '$components/ui';
  import { AppMark, EmptyHome, EmptyJar, EmptyMemory, Setup } from '$components/illustrations';
  import type { MemberColor } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';
  import { isHapticsEnabled, setHapticsEnabled } from '$lib/platform/haptics';
  import GallerySection from './GallerySection.svelte';
  import GalleryGroup from './GalleryGroup.svelte';
  import TaskCardMock from './TaskCardMock.svelte';
  import PulseCardMock from './PulseCardMock.svelte';
  import {
    COLOR_NAMES,
    MEMBER_COLORS,
    PHOTO,
    attention,
    danny,
    family,
    today,
    waiting
  } from './galleryData';

  const g = he.dev.gallery;
  const t = g.demo;
  const s = g.sections;
  const L = g.labels;

  // ── Theme (not persisted; the app's Settings owns localStorage['homecare.theme']) ──
  type Theme = 'system' | 'light' | 'dark';
  const root = document.documentElement;
  const initialTheme = root.dataset.theme;
  let theme = $state<Theme>(
    initialTheme === 'light' || initialTheme === 'dark' ? initialTheme : 'system'
  );
  $effect(() => {
    root.dataset.theme = theme;
  });
  $effect(() => () => {
    if (initialTheme) root.dataset.theme = initialTheme;
    else delete root.dataset.theme;
  });

  // ── Member colour of "me" in the mocks ──
  let myColor = $state<MemberColor>('terracotta');
  const me = $derived({ displayName: 'מיכל', photoURL: null, color: myColor });

  // ── Specimen state ──
  let bucket = $state<'today' | 'week' | 'later'>('today');
  let who = $state<'all' | 'mine' | 'partner'>('all');
  let selectable = $state({ car: true, home: false, family: true });
  let tokens = $state([
    { id: 'd', label: 'מחר', icon: CalendarDays },
    { id: 't', label: 'ב־17:00', icon: Clock },
    { id: 'p', label: 'דחוף', icon: Flag },
    { id: 'c', label: 'רכב', icon: Car },
    { id: 'r', label: 'כל חודש', icon: Repeat }
  ]);
  let removable = $state(['מוסך השרון', 'כפר סבא']);
  let checkedA = $state(false);
  let checkedB = $state(true);
  let title = $state('');
  let place = $state('מוסך השרון, סניף כפר סבא ליד הקניון הגדול');
  let notes = $state('');
  let cost = $state<number | null>(650);
  let target = $state(10);
  let notifyRequests = $state(true);
  let notifyWeekly = $state(false);
  let haptics = $state(isHapticsEnabled());
  let fabExtended = $state(true);
  let loadingDemo = $state(false);

  // ── Overlays ──
  let sheetOpen = $state(false);
  let snapOpen = $state(false);
  let dialogOpen = $state(false);
  let deleting = $state(false);
  let snack = $state<{ id: number; message: string; action?: boolean } | null>(null);
  let snackSeq = 0;
  let quickTitle = $state('');

  function showSnack(message: string, action = true) {
    snack = { id: ++snackSeq, message, action };
  }

  function confirmDelete() {
    deleting = true;
    setTimeout(() => {
      deleting = false;
      dialogOpen = false;
      showSnack(t.snackbarDone);
    }, 900);
  }

  const snoozeIcons = [Sunrise, CalendarClock, CalendarRange, CalendarPlus];
  const snoozeValues = ['ב׳ · 5.10', 'ו׳ · 9.10', 'א׳ · 11.10', '4.11'];
</script>

<div class="gallery">
  <!-- ═══ Masthead ═══ -->
  <header class="masthead">
    <div class="brand">
      <AppMark size={44} />
      <div class="brand-text">
        <h1>{he.dev.galleryTitle}</h1>
        <p>{g.subtitle}</p>
      </div>
    </div>
    <div class="controls">
      <SegmentedControl
        label={g.theme}
        bind:value={theme}
        options={[
          { value: 'system', label: g.themeSystem },
          { value: 'light', label: g.themeLight },
          { value: 'dark', label: g.themeDark }
        ]}
      />
      <div class="swatches" role="radiogroup" aria-label={g.myColor}>
        {#each MEMBER_COLORS as c (c)}
          <button
            type="button"
            role="radio"
            class="swatch"
            data-member-color={c}
            aria-checked={myColor === c}
            aria-label={COLOR_NAMES[c]}
            onclick={() => (myColor = c)}><span></span></button
          >
        {/each}
      </div>
    </div>
  </header>

  <!-- ═══ Composition ═══ -->
  <GallerySection id="composition" title={s.composition}>
    <div class="home">
      <div class="home-top">
        <p class="home-date">{t.date}</p>
        <div class="home-side">
          <SyncIndicator status="synced" />
          <AvatarStack people={[me, danny]} />
        </div>
      </div>
      <h2 class="home-greet">{t.greeting}</h2>

      <PulseCardMock {me} partner={danny} />

      <Card padding="none" class="jar-strip">
        <div class="jar-row">
          <span class="jar-icon"><Gift size={18} strokeWidth={1.75} aria-hidden="true" /></span>
          <span class="jar-text">{t.jarTreat}</span>
          <span class="jar-count num">{t.jarCount}</span>
        </div>
        <ProgressBar value={7} max={10} label={t.progressLabel} valueText="7 מתוך 10" />
      </Card>

      <div class="block">
        <SectionHeader title={t.sectionAttention} count={2} tone="danger" />
        {#each attention as task (task.id)}
          <TaskCardMock {task} {me} partner={danny} />
        {/each}
      </div>

      <div class="block">
        <SectionHeader
          title={t.sectionWaiting}
          count={1}
          actionLabel={t.seeAll}
          onaction={() => {}}
        />
        <TaskCardMock task={waiting} {me} partner={danny}>
          {#snippet actions()}
            <Button size="sm">{he.task.take('f')}</Button>
            <Button size="sm" variant="secondary">{t.secondary}</Button>
          {/snippet}
        </TaskCardMock>
      </div>

      <div class="block">
        <SegmentedControl
          label={t.segmentedLabel}
          bind:value={bucket}
          options={[
            { value: 'today', label: t.today, count: 4 },
            { value: 'week', label: t.week, count: 6 },
            { value: 'later', label: t.later, count: 9 }
          ]}
        />
        <div class="chip-row" role="group" aria-label={t.filterLabel}>
          <Chip label={t.all} selected={who === 'all'} onclick={() => (who = 'all')} />
          <Chip label={t.mine} selected={who === 'mine'} onclick={() => (who = 'mine')} />
          <MemberChip
            person={danny}
            prefix="של"
            selected={who === 'partner'}
            onclick={() => (who = 'partner')}
          />
        </div>
        {#each today as task (task.id)}
          <TaskCardMock {task} {me} partner={danny} />
        {/each}
      </div>

      <div class="fab-dock">
        <Fab label={he.shell.fab} />
      </div>
    </div>
  </GallerySection>

  <!-- ═══ Brand ═══ -->
  <GallerySection id="brand" title={s.brand}>
    <GalleryGroup label={L.onTile}>
      <div class="marks">
        <AppMark size={96} tile title="HomeCare" />
        <AppMark size={64} tile />
        <AppMark size={48} tile />
        <AppMark size={32} tile />
      </div>
    </GalleryGroup>
    <GalleryGroup label={L.smallSizes}>
      <div class="marks">
        <span class="lockup"><AppMark size={32} /><span>HomeCare</span></span>
        <AppMark size={24} />
        <AppMark size={16} />
        <span class="mono-chip"><AppMark size={20} mono /></span>
      </div>
    </GalleryGroup>
  </GallerySection>

  <!-- ═══ Buttons ═══ -->
  <GallerySection id="buttons" title={s.buttons}>
    <GalleryGroup label={L.variants}>
      <Button variant="primary">{t.primary}</Button>
      <Button variant="secondary">{t.secondary}</Button>
      <Button variant="ghost">{t.ghost}</Button>
      <Button variant="danger" icon={Trash2}>{t.danger}</Button>
    </GalleryGroup>
    <GalleryGroup label={L.sizes}>
      <Button size="sm">{t.add}</Button>
      <Button size="md">{t.add}</Button>
      <Button size="lg">{t.add}</Button>
    </GalleryGroup>
    <GalleryGroup label={L.states} layout="stack">
      <Button size="lg" block icon={Plus}>{t.newTask}</Button>
      <div class="pair">
        <Button
          size="lg"
          loading={loadingDemo}
          onclick={() => {
            loadingDemo = true;
            setTimeout(() => (loadingDemo = false), 1500);
          }}>{t.save}</Button
        >
        <Button size="lg" loading>{t.loading}</Button>
        <Button size="lg" disabled>{t.disabled}</Button>
      </div>
      <div class="pair">
        <Button variant="secondary" icon={Share2}>{t.share}</Button>
        <Button variant="ghost" icon={ChevronRight} flipIcon>{t.seeAll}</Button>
      </div>
    </GalleryGroup>
    <GalleryGroup label="IconButton">
      <IconButton label={he.common.edit} icon={Pencil} />
      <IconButton label={he.settings.title} icon={Settings} variant="tonal" />
      <IconButton label="חיפוש" icon={Search} variant="outline" />
      <IconButton label={t.add} icon={Plus} variant="filled" />
      <IconButton label={he.common.back} icon={ChevronLeft} flipRtl variant="tonal" size="sm" />
      <IconButton label="התראות" icon={Bell} pressed />
      <IconButton label={he.common.delete} icon={Trash2} disabled />
    </GalleryGroup>
  </GallerySection>

  <!-- ═══ Chips ═══ -->
  <GallerySection id="chips" title={s.chips}>
    <GalleryGroup label={L.filter}>
      <Chip label={t.all} count={13} selected={who === 'all'} onclick={() => (who = 'all')} />
      <Chip label={t.mine} count={5} selected={who === 'mine'} onclick={() => (who = 'mine')} />
      <Chip
        label="של דני"
        count={4}
        userText
        selected={who === 'partner'}
        onclick={() => (who = 'partner')}
      />
    </GalleryGroup>
    <GalleryGroup label={L.selectable}>
      <Chip
        kind="selectable"
        label="רכב"
        selected={selectable.car}
        onclick={() => (selectable.car = !selectable.car)}
      />
      <Chip
        kind="selectable"
        label="בית ותיקונים"
        selected={selectable.home}
        onclick={() => (selectable.home = !selectable.home)}
      />
      <Chip
        kind="selectable"
        label="משפחה"
        selected={selectable.family}
        onclick={() => (selectable.family = !selectable.family)}
      />
    </GalleryGroup>
    <GalleryGroup label={L.parsed}>
      {#each tokens as tok (tok.id)}
        <Chip
          kind="token"
          label={tok.label}
          icon={tok.icon}
          onremove={() => (tokens = tokens.filter((x) => x.id !== tok.id))}
        />
      {/each}
    </GalleryGroup>
    <GalleryGroup label={L.removable}>
      {#each removable as r (r)}
        <Chip
          kind="removable"
          label={r}
          userText
          onremove={() => (removable = removable.filter((x) => x !== r))}
        />
      {/each}
    </GalleryGroup>
  </GallerySection>

  <!-- ═══ People ═══ -->
  <GallerySection id="people" title={s.people}>
    <GalleryGroup label={L.members}>
      {#each family as p (p.displayName)}
        <Avatar name={p.displayName} color={p.color} photoURL={p.photoURL} size="lg" />
      {/each}
    </GalleryGroup>
    <GalleryGroup label={L.sizes}>
      <Avatar name="מיכל" color={myColor} size="xl" />
      <Avatar name="מיכל" color={myColor} size="lg" />
      <Avatar name="מיכל" color={myColor} size="md" />
      <Avatar name="מיכל" color={myColor} size="sm" />
      <Avatar name="מיכל" color={myColor} size="xs" />
      <Avatar unassigned size="lg" />
      <Avatar unassigned size="sm" />
      <Avatar name="נועה" photoURL={PHOTO} color="sage" size="lg" label={L.photo} />
    </GalleryGroup>
    <GalleryGroup label={L.stack}>
      <AvatarStack people={family.slice(0, 2)} />
      <AvatarStack people={family} max={3} />
      <AvatarStack people={family} max={4} size="md" />
    </GalleryGroup>
    <GalleryGroup label={L.memberChips}>
      <MemberChip person={me} count={5} />
      <MemberChip person={danny} count={4} />
      <MemberChip person={family[2]!} count={1} />
      <MemberChip person={family[4]!} />
    </GalleryGroup>
  </GallerySection>

  <!-- ═══ Badges ═══ -->
  <GallerySection id="badges" title={s.badges}>
    <GalleryGroup label={L.variants}>
      <Badge kind="age" label="פתוחה 3 שבועות" />
      <Badge kind="snooze" label="נדחתה 4 פעמים" />
      <Badge kind="due" label="עד יום ה׳" />
      <Badge kind="due" tone="accent" label="עד היום" />
      <Badge kind="deadline" label="מועד אחרון: ד׳" />
      <Badge kind="danger" label="באיחור" />
      <Badge kind="danger" label="דחוף" />
      <Badge kind="neutral" tone="success" icon={Check} label="בוצעה" />
    </GalleryGroup>
  </GallerySection>

  <!-- ═══ Completion ═══ -->
  <GallerySection id="completion" title={s.completion} note={L.reducedMotionNote}>
    <GalleryGroup label={L.interactive}>
      <div class="cc-row">
        <CompletionCircle label="להחליף נורה במטבח" bind:checked={checkedA} />
        <CompletionCircle label="לשלם ארנונה" bind:checked={checkedB} />
        <CompletionCircle label="לקנות סוללות" size="lg" />
        <CompletionCircle label="לקבוע תור לרופא" size="lg" checked />
        <CompletionCircle label="משימה נעולה" disabled />
      </div>
    </GalleryGroup>
  </GallerySection>

  <!-- ═══ Cards & lists ═══ -->
  <GallerySection id="lists" title={s.lists}>
    <SectionHeader
      title={t.sectionAttention}
      count={2}
      tone="danger"
      actionLabel={t.seeAll}
      onaction={() => {}}
    />
    <Card padding="none">
      <ListRow
        title={t.listHousehold}
        subtitle="מיכל, דני"
        icon={Users}
        chevron
        onclick={() => {}}
      />
      <ListRow
        title={t.listNotifications}
        icon={Bell}
        value={t.listNotificationsValue}
        chevron
        onclick={() => {}}
      />
      <ListRow
        title={t.listTheme}
        icon={SunMoon}
        value={g.themeSystem}
        chevron
        onclick={() => {}}
      />
      <ListRow title={t.listLeave} icon={LogOut} flipIcon danger onclick={() => {}} />
    </Card>
    <div class="cards-2">
      <Card>
        <p class="card-k">{t.pulseToday}</p>
        <p class="card-n num">4</p>
      </Card>
      <Card tone="sunken">
        <p class="card-k">{t.pulseWaiting}</p>
        <p class="card-n num">3</p>
      </Card>
    </div>
  </GallerySection>

  <!-- ═══ Segmented ═══ -->
  <GallerySection id="segmented" title={s.segmented}>
    <SegmentedControl
      label={t.segmentedLabel}
      bind:value={bucket}
      options={[
        { value: 'today', label: t.today },
        { value: 'week', label: t.week },
        { value: 'later', label: t.later }
      ]}
    />
  </GallerySection>

  <!-- ═══ Fields ═══ -->
  <GallerySection id="fields" title={s.fields}>
    <TextField
      label={t.taskTitle}
      placeholder={t.taskTitlePlaceholder}
      hint={t.taskTitleHint}
      bind:value={title}
      enterkeyhint="done"
    />
    <TextField label={t.place} bind:value={place} error={t.placeError} maxlength={60} />
    <TextArea
      label={t.notes}
      placeholder={t.notesPlaceholder}
      bind:value={notes}
      maxlength={4000}
      counter
    />
    <div class="pair-fields">
      <NumberField label={t.cost} bind:value={cost} min={0} />
      <div class="stepper-field">
        <span class="field-label" id="target-l">{t.target}</span>
        <Stepper label={t.target} bind:value={target} min={3} max={50} suffix={t.targetSuffix} />
      </div>
    </div>
    <Card padding="none" class="toggles">
      <div class="toggle-pad">
        <Toggle label={t.notifyRequests} bind:checked={notifyRequests} />
      </div>
      <div class="toggle-pad">
        <Toggle
          label={t.notifyWeekly}
          description={t.notifyWeeklyHint}
          bind:checked={notifyWeekly}
        />
      </div>
      <div class="toggle-pad">
        <Toggle
          label={L.haptics}
          description={L.hapticsHint}
          bind:checked={haptics}
          onchange={(v) => setHapticsEnabled(v)}
        />
      </div>
    </Card>
  </GallerySection>

  <!-- ═══ Feedback ═══ -->
  <GallerySection id="feedback" title={s.feedback}>
    <GalleryGroup label="SyncIndicator">
      <SyncIndicator status="synced" />
      <SyncIndicator status="saving" />
      <SyncIndicator status="offline" pending={2} />
      <SyncIndicator status="synced" compact />
    </GalleryGroup>
    <GalleryGroup label="ProgressBar" layout="stack">
      <ProgressBar value={7} max={10} label={t.progressLabel} valueText="7 מתוך 10" />
      <ProgressBar value={3} max={10} label="מיכל" tone="terracotta" size="regular" />
      <ProgressBar value={6} max={10} label="דני" tone="sage" size="regular" />
    </GalleryGroup>
    <GalleryGroup label="Spinner">
      <Spinner size={16} />
      <Spinner size={20} />
      <Spinner size={28} label={he.common.loading} />
      <span class="accent-ink"><Spinner size={28} /></span>
    </GalleryGroup>
    <GalleryGroup label="Skeleton" layout="stack">
      <div class="sk-group" role="group" aria-busy="true" aria-label={he.common.loading}>
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <div class="sk-row">
          <Skeleton variant="circle" size={40} />
          <Skeleton variant="text" lines={2} />
        </div>
      </div>
    </GalleryGroup>
  </GallerySection>

  <!-- ═══ Empty states ═══ -->
  <GallerySection id="empty" title={s.empty}>
    <div class="empties">
      <Card padding="none">
        <EmptyState compact level={3} title={t.emptyHomeTitle} body={t.emptyHomeBody}>
          {#snippet illustration()}<EmptyHome />{/snippet}
          {#snippet action()}<Button icon={Plus}>{t.newTask}</Button>{/snippet}
        </EmptyState>
      </Card>
      <Card padding="none">
        <EmptyState compact level={3} title={t.emptyMemoryTitle} body={t.emptyMemoryBody}>
          {#snippet illustration()}<EmptyMemory />{/snippet}
        </EmptyState>
      </Card>
      <Card padding="none">
        <EmptyState compact level={3} title={t.emptyJarTitle} body={t.emptyJarBody}>
          {#snippet illustration()}<EmptyJar />{/snippet}
          {#snippet action()}<Button variant="secondary">{t.emptyJarCta}</Button>{/snippet}
        </EmptyState>
      </Card>
      <Card padding="none">
        <EmptyState compact level={3} title={t.setupTitle} body={t.setupBody}>
          {#snippet illustration()}<Setup />{/snippet}
          {#snippet action()}<Button>{t.setupCta}</Button>{/snippet}
        </EmptyState>
      </Card>
    </div>
  </GallerySection>

  <!-- ═══ Overlays ═══ -->
  <GallerySection id="overlays" title={s.overlays}>
    <GalleryGroup label={L.sheetPreview} layout="stack">
      <div class="sheet-stage">
        <BottomSheet presentation="inline" open title={t.sheetTitle} onClose={() => {}}>
          {@render snoozeBody()}
        </BottomSheet>
      </div>
    </GalleryGroup>
    <GalleryGroup label="Snackbar" layout="stack">
      <Snackbar
        message={t.snackbarDone}
        icon={Check}
        actionLabel={he.common.undo}
        duration={0}
        onDismiss={() => {}}
      />
      <Snackbar
        message="אין חיבור. השינויים יישמרו כשהרשת תחזור."
        duration={0}
        onDismiss={() => {}}
      />
    </GalleryGroup>
    <GalleryGroup label={L.interactive}>
      <Button variant="secondary" onclick={() => (sheetOpen = true)}>{t.openSheet}</Button>
      <Button variant="secondary" onclick={() => (snapOpen = true)}>{t.openSnapSheet}</Button>
      <Button variant="secondary" onclick={() => (dialogOpen = true)}>{t.openDialog}</Button>
      <Button variant="secondary" onclick={() => showSnack(t.snackbarDone)}>{t.showSnackbar}</Button
      >
    </GalleryGroup>
  </GallerySection>

  <!-- ═══ FAB ═══ -->
  <GallerySection id="fab" title={s.fab}>
    <GalleryGroup label="{L.extended} / {L.collapsed}">
      <Fab
        label={he.shell.fab}
        extended={fabExtended}
        onclick={() => (fabExtended = !fabExtended)}
      />
      <Fab label={he.shell.fab} extended={false} />
    </GalleryGroup>
  </GallerySection>
</div>

{#snippet snoozeBody()}
  <p class="sheet-hint">{t.sheetHint}</p>
  <div class="snooze-list">
    {#each t.snooze as label, i (label)}
      <ListRow
        title={label}
        value={snoozeValues[i]}
        icon={snoozeIcons[i]}
        onclick={() => (sheetOpen = false)}
      />
    {/each}
    <ListRow title="תאריך אחר" icon={CalendarDays} chevron onclick={() => (sheetOpen = false)} />
  </div>
  <p class="sheet-note">{t.sheetSnoozed}</p>
{/snippet}

<!-- Live overlays -->
<BottomSheet open={sheetOpen} title={t.sheetTitle} onClose={() => (sheetOpen = false)}>
  {@render snoozeBody()}
</BottomSheet>

<BottomSheet
  open={snapOpen}
  title={t.snapTitle}
  snapPoints={[0.55, 0.92]}
  onClose={() => (snapOpen = false)}
>
  <TextField
    label={t.taskTitle}
    hideLabel
    placeholder={t.taskTitlePlaceholder}
    bind:value={quickTitle}
    data-autofocus
  />
  <div class="token-row">
    <Chip kind="token" label="מחר" icon={CalendarDays} onremove={() => {}} />
    <Chip kind="token" label="רכב" icon={Car} onremove={() => {}} />
  </div>
  <p class="sheet-hint">{t.snapBody}</p>
  {#snippet footer()}
    <Button size="lg" block onclick={() => (snapOpen = false)}>{t.add}</Button>
  {/snippet}
</BottomSheet>

<Dialog
  open={dialogOpen}
  title={t.dialogTitle}
  message={t.dialogBody}
  tone="danger"
  confirmLabel={he.common.delete}
  loading={deleting}
  onConfirm={confirmDelete}
  onCancel={() => (dialogOpen = false)}
/>

<div class="snack-host" role="status" aria-live="polite">
  {#if snack}
    {#key snack.id}
      <Snackbar
        message={snack.message}
        icon={Check}
        actionLabel={snack.action ? he.common.undo : undefined}
        onAction={() => setTimeout(() => showSnack(t.snackbarUndone, false), 200)}
        onDismiss={() => (snack = null)}
      />
    {/key}
  {/if}
</div>

<style>
  .gallery {
    padding-block: calc(var(--safe-top) + var(--s6)) calc(var(--s10) + var(--safe-bottom));
    padding-inline: var(--screen-pad);
  }

  /* ── Masthead ── */
  .masthead {
    display: grid;
    gap: var(--s5);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }

  .brand-text {
    display: grid;
    gap: 2px;
  }

  h1 {
    font: var(--font-display);
    color: var(--ink);
  }

  .brand-text p {
    font: var(--font-callout);
    color: var(--ink-2);
    text-wrap: balance;
  }

  .controls {
    display: grid;
    gap: var(--s3);
  }

  .swatches {
    display: flex;
    justify-content: space-between;
  }

  .swatch {
    display: grid;
    place-items: center;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    border-radius: var(--r-pill);
  }

  .swatch span {
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-pill);
    background: var(--m-base);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
    transition:
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-base) var(--ease-out);
  }

  .swatch[aria-checked='true'] span {
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 5px var(--m-base);
    transform: scale(0.86);
  }

  .swatch:focus-visible {
    outline: none;
  }

  .swatch:focus-visible span {
    outline: 2px solid var(--accent);
    outline-offset: 6px;
  }

  /* ── Home composition ── */
  .home {
    display: grid;
    gap: var(--s4);
  }

  .home-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s3);
  }

  .home-date {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .home-side {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }

  .home-greet {
    margin-block: calc(var(--s2) * -1) var(--s1);
    font: var(--font-display);
    color: var(--ink);
  }

  .home :global(.jar-strip) {
    display: grid;
    gap: var(--s3);
    padding: var(--s3) var(--s4) var(--s4);
  }

  .jar-row {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .jar-icon {
    display: grid;
    place-items: center;
    inline-size: 30px;
    block-size: 30px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .jar-text {
    flex: 1;
    font: var(--font-callout);
    font-weight: 500;
    color: var(--ink);
  }

  .jar-count {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .block {
    display: grid;
    gap: var(--s3);
    margin-block-start: var(--s3);
  }

  .block > :global(.section-header) {
    margin-block-end: calc(var(--s1) * -1);
  }

  .chip-row {
    display: flex;
    gap: var(--s2);
    margin-block: calc(var(--s1) * -1);
  }

  .fab-dock {
    display: flex;
    justify-content: flex-end;
    padding-block-start: var(--s2);
  }

  /* ── Brand ── */
  .marks {
    display: flex;
    align-items: flex-end;
    gap: var(--s5);
    flex-wrap: wrap;
  }

  .marks :global(.appmark.tile) {
    border-radius: 22%;
    box-shadow:
      0 1px 2px rgb(74 44 24 / 0.08),
      0 6px 18px rgb(74 44 24 / 0.1);
  }

  .lockup {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    font: var(--font-headline);
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }

  .mono-chip {
    display: inline-grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--ink-2);
  }

  /* ── Specimen helpers ── */
  .pair {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }

  .cc-row {
    display: flex;
    gap: var(--s2);
    align-items: center;
  }

  .cards-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s3);
  }

  .card-k {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .card-n {
    font: var(--font-numeral);
    color: var(--ink);
  }

  .pair-fields {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--s5);
  }

  .stepper-field {
    display: grid;
    gap: var(--s2);
    justify-items: start;
  }

  .field-label {
    font: var(--font-callout);
    font-weight: 500;
    color: var(--ink);
  }

  .gallery :global(.toggles) {
    padding-block: var(--s1);
  }

  .toggle-pad {
    padding-inline: var(--s4);
  }

  .toggle-pad + .toggle-pad {
    border-block-start: 1px solid var(--line);
  }

  .accent-ink {
    color: var(--accent-ink);
  }

  .sk-group {
    display: grid;
    gap: var(--s3);
  }

  .sk-row {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }

  .empties {
    display: grid;
    gap: var(--s3);
  }

  .sheet-stage {
    padding: var(--s6) var(--s3) var(--s3);
    border-radius: calc(var(--r-xl) + var(--s3));
    background: var(--surface-2);
  }

  .sheet-hint {
    font: var(--font-callout);
    color: var(--ink-2);
    margin-block-end: var(--s2);
  }

  .snooze-list {
    margin-inline: calc(var(--s4) * -1);
  }

  .sheet-note {
    margin-block-start: var(--s3);
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
    text-align: center;
  }

  .token-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1) var(--s2);
    margin-block: var(--s2) var(--s3);
  }

  .snack-host {
    position: fixed;
    inset-inline: var(--s4);
    inset-block-end: calc(var(--s4) + var(--safe-bottom));
    z-index: var(--z-snackbar);
    pointer-events: none;
  }
</style>

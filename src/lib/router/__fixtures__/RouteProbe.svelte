<script lang="ts">
  // Test fixture: renders router state so tests can prove rune reactivity end-to-end.
  import type { Router } from '../router.svelte';

  interface Props {
    router: Router;
  }

  let { router }: Props = $props();
</script>

<p data-testid="route">{router.route.name}</p>
<p data-testid="sheet">{router.sheet?.name ?? 'none'}</p>
<p data-testid="tab">{router.meta.tab ?? 'none'}</p>

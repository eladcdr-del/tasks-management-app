// Entry (1.1 → 2.4). Step 2.4 adds adapter selection and boot gating before mount.
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { router } from '$lib/router/router.svelte';

router.start();

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing from index.html');

export default mount(App, { target });

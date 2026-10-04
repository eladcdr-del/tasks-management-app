// owner: step 3.1. Whether the on-screen keyboard is open, from the visual viewport: when the
// keyboard slides up, the visual viewport shrinks well below the layout viewport. The shell hides
// the bottom nav and the FAB meanwhile, so they never ride on top of the keyboard.

/** Height lost to the keyboard before we call it open (browser toolbars move ~60–100px). */
const KEYBOARD_MIN_PX = 150;

class ViewportState {
  keyboardOpen = $state(false);
  #started = false;

  start(win: Window | undefined = globalThis.window): void {
    if (this.#started || !win?.visualViewport) return;
    this.#started = true;
    const vv = win.visualViewport;
    const check = () => {
      this.keyboardOpen = win.innerHeight - vv.height > KEYBOARD_MIN_PX;
    };
    vv.addEventListener('resize', check);
    check();
  }
}

export const viewport = new ViewportState();

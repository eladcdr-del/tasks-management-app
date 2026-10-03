// owner: step 3.1 — only that step edits this file (step 3.3 calls shareTask from TaskDetail;
// step 4.3 shares invite links).
//
// Share a task (or an invite link): Web Share API first, then WhatsApp (https://wa.me/?text=),
// then the clipboard. Never throws.

export type ShareResult = 'shared' | 'whatsapp' | 'copied' | 'cancelled';

export interface ShareInput {
  title: string;
  text: string;
  url: string;
}

/** `https://wa.me/?text=<text>` with the text fully percent-encoded (Hebrew, newlines, `&`, `#`…). */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

export async function shareTask(input: ShareInput): Promise<ShareResult> {
  const nav = globalThis.navigator as Navigator | undefined;
  const data: ShareData = { title: input.title, text: input.text, url: input.url };

  if (typeof nav?.share === 'function' && (nav.canShare?.(data) ?? true)) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled'; // the user closed the share sheet
      // NotAllowedError etc.: fall through to WhatsApp.
    }
  }

  const message = [input.text, input.url].filter(Boolean).join('\n');
  const win = globalThis.window as Window | undefined;
  const opened = win?.open(whatsappUrl(message), '_blank');
  if (opened) {
    opened.opener = null;
    return 'whatsapp';
  }

  try {
    await nav?.clipboard.writeText(message);
    if (nav?.clipboard) return 'copied';
  } catch {
    // Clipboard blocked as well.
  }
  return 'cancelled';
}

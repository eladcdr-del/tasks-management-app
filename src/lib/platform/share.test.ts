import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareTask, whatsappUrl } from './share';

const input = {
  title: 'מצבר',
  text: 'להחליף מצבר & לבדוק #שמן',
  url: 'https://example.com/#/task/a'
};

afterEach(() => vi.unstubAllGlobals());

describe('whatsappUrl', () => {
  it('percent-encodes Hebrew, spaces, newlines, & and #', () => {
    const url = whatsappUrl('שלום & להתראות\n#/task/a');
    const prefix = 'https://wa.me/?text=';
    expect(url.startsWith(prefix)).toBe(true);
    const encoded = url.slice(prefix.length);
    expect(encoded).not.toMatch(/[\s&#?֐-׿]/);
    expect(decodeURIComponent(encoded)).toBe('שלום & להתראות\n#/task/a');
  });
});

describe('shareTask', () => {
  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    await expect(shareTask(input)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: input.title, text: input.text, url: input.url });
  });

  it('reports a dismissed share sheet as cancelled', async () => {
    const abort = Object.assign(new Error('dismissed'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort) });
    await expect(shareTask(input)).resolves.toBe('cancelled');
  });

  it('falls back to WhatsApp without the Web Share API', async () => {
    const tab = { opener: {} as unknown };
    const open = vi.fn().mockReturnValue(tab);
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { open });
    await expect(shareTask(input)).resolves.toBe('whatsapp');
    expect(open).toHaveBeenCalledWith(whatsappUrl(`${input.text}\n${input.url}`), '_blank');
    expect(tab.opener).toBeNull();
  });

  it('copies to the clipboard when the popup is blocked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('window', { open: vi.fn().mockReturnValue(null) });
    await expect(shareTask(input)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`${input.text}\n${input.url}`);
  });
});

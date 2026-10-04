// owner: step 3.3. Loads stored photos (repo.getPhoto) for TaskDetail thumbs, Memory cards and the
// PhotoSheet viewer. Photos are immutable once written, so each id is fetched once per household and
// kept for the session (a failed or missing fetch is retried next time).

import type { Photo } from '$lib/domain/types';
import { session } from '$lib/state/session.svelte';

const cache = new Map<string, Promise<Photo | null>>();

/** The photo, or null when it does not exist (or there is no household / repository). */
export function loadPhoto(photoId: string): Promise<Photo | null> {
  const repo = session.repo;
  const hid = session.householdId;
  if (!repo || !hid) return Promise.resolve(null);
  const key = `${hid}/${photoId}`;
  let p = cache.get(key);
  if (!p) {
    p = repo.getPhoto(hid, photoId).then(
      (photo) => {
        if (!photo) cache.delete(key);
        return photo;
      },
      (e: unknown) => {
        cache.delete(key);
        console.warn('[homecare] photo load failed', e);
        return null;
      }
    );
    cache.set(key, p);
  }
  return p;
}

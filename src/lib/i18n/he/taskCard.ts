// owner: step 3.2 — only that step edits this file
// TaskCard and the take / request actions shown on it.

import { gendered } from '../gender';

export const taskCard = {
  take: gendered('אני לוקחת', 'אני לוקח', 'אני לוקח/ת')
} as const;

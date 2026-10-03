// Delivery. The run loop talks to a `Sender`, so tests inject a fake and the real one wraps FCM.
// Messages are DATA-ONLY ({type,title,body,url,tag}): the app's service worker builds the
// notification itself (RTL, Hebrew, icon, tag, click URL), which is the only way to get dir/lang
// and a deep link right on Android Chrome. Urgency high + TTL 12h (Blueprint §9 step 4).

import type { Messaging, TokenMessage } from 'firebase-admin/messaging';

export interface PushMessage {
  type: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface SendResult {
  /** Tokens FCM says are dead: their device docs get deleted. */
  invalidTokens: string[];
  /** Tokens that failed for any other reason (network, quota, FCM outage...). */
  transientFailures: number;
  /** FCM error codes seen, for the (public) log. Never contains tokens. */
  errorCodes?: string[];
}

export interface Sender {
  send(tokens: string[], msg: PushMessage): Promise<SendResult>;
}

/**
 * FCM codes that mean "this token will never work again". `invalid-argument` is also what FCM
 * returns for a malformed payload, but ours is fixed and tested, so here it means a bad token
 * (Firebase's own guidance for HTTP v1: drop the token on UNREGISTERED or INVALID_ARGUMENT).
 */
export const INVALID_TOKEN_CODES: ReadonlySet<string> = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
  'messaging/invalid-registration-token'
]);

export const WEBPUSH_HEADERS = { Urgency: 'high', TTL: '43200' } as const;

/** FCM accepts at most 500 messages per sendEach call. */
const SEND_EACH_LIMIT = 500;

export function buildMessages(tokens: string[], msg: PushMessage): TokenMessage[] {
  return tokens.map((token) => ({
    token,
    data: { type: msg.type, title: msg.title, body: msg.body, url: msg.url, tag: msg.tag },
    webpush: { headers: { ...WEBPUSH_HEADERS } }
  }));
}

/** The real thing: firebase-admin messaging.sendEach. A thrown error (auth, network) propagates. */
export class FcmSender implements Sender {
  constructor(private readonly messaging: Messaging) {}

  async send(tokens: string[], msg: PushMessage): Promise<SendResult> {
    const invalidTokens: string[] = [];
    const errorCodes: string[] = [];
    let transientFailures = 0;
    for (let i = 0; i < tokens.length; i += SEND_EACH_LIMIT) {
      const chunk = tokens.slice(i, i + SEND_EACH_LIMIT);
      const res = await this.messaging.sendEach(buildMessages(chunk, msg));
      res.responses.forEach((r, j) => {
        if (r.success) return;
        const code = r.error?.code ?? 'unknown';
        errorCodes.push(code);
        const token = chunk[j];
        if (INVALID_TOKEN_CODES.has(code) && token !== undefined) invalidTokens.push(token);
        else transientFailures += 1;
      });
    }
    return { invalidTokens, transientFailures, errorCodes };
  }
}

/**
 * Used for non-dry runs against the Firestore emulator (FCM has no emulator): prints what would be
 * pushed and reports success, so the whole write path (sent keys, event marks) can be exercised
 * locally.
 */
export class ConsoleSender implements Sender {
  constructor(private readonly log: (line: string) => void = console.log) {}

  send(tokens: string[], msg: PushMessage): Promise<SendResult> {
    this.log(
      `  [emulator push → ${tokens.length} device(s)] ${msg.title} | ${msg.body} | ${msg.url}`
    );
    return Promise.resolve({ invalidTokens: [], transientFailures: 0 });
  }
}

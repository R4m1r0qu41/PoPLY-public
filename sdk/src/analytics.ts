export type ProtocolEventName =
  | "character_minted"
  | "checkpoint_issued"
  | "achievement_issued"
  | "license_activated"
  | "license_expired"
  | "marketplace_settled";

export interface ProtocolAnalyticsEvent {
  name: ProtocolEventName;
  occurredAt: bigint;
  characterKey?: string;
  correlationId: string;
  attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface AnalyticsSink {
  write(event: ProtocolAnalyticsEvent): void | Promise<void>;
}

// Word-boundary anchored so structural key names like `recipient`, `username`, or `equipment`
// don't false-positive on the `ip`/`name` fragments they happen to contain. Applied after
// splitting camelCase humps (see personalKey) so `playerEmail` still resolves to `email`.
const PERSONAL_KEY = /\b(email|name|address|ip|location|prompt|chat)\b/i;

function personalKey(key: string): boolean {
  // Insert a separator at camelCase boundaries so \b sees `player Email` -> matches `email`,
  // while `recipient`/`username`/`equipment` stay single tokens with no interior boundary.
  return PERSONAL_KEY.test(key.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}
// Shapes of personal data that can appear inside an attribute VALUE regardless of its key.
const EMAIL_VALUE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const IP_VALUE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;

export class ProtocolAnalytics {
  private readonly sink: AnalyticsSink;

  constructor(sink: AnalyticsSink) {
    this.sink = sink;
  }

  async record(event: ProtocolAnalyticsEvent): Promise<void> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(event.correlationId)) {
      throw new TypeError("correlationId must be a non-personal stable event identifier");
    }
    if (event.occurredAt < 0n) throw new RangeError("analytics time cannot be negative");
    for (const [key, value] of Object.entries(event.attributes ?? {})) {
      if (personalKey(key)) {
        throw new TypeError(`analytics attribute is potentially personal: ${key}`);
      }
      if (typeof value === "string" && (EMAIL_VALUE.test(value) || IP_VALUE.test(value))) {
        throw new TypeError(`analytics attribute value is potentially personal: ${key}`);
      }
    }
    const copy: ProtocolAnalyticsEvent = event.attributes
      ? { ...event, attributes: { ...event.attributes } }
      : { ...event };
    await this.sink.write(copy);
  }
}

export class MemoryAnalyticsSink implements AnalyticsSink {
  readonly events: ProtocolAnalyticsEvent[] = [];
  write(event: ProtocolAnalyticsEvent): void {
    this.events.push(event);
  }
}

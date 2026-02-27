import { redactSnapshotForClient } from '$serverlib/configSanitizer';
import type { DashboardSettings, WidgetInstance } from '$widgets/types';

type Subscriber = {
  controller: ReadableStreamDefaultController<string>;
};

const subscribers = new Set<Subscriber>();

export const serializeEvent = (event: string, payload: unknown) => {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
};

export const subscribe = (subscriber: Subscriber) => {
  subscribers.add(subscriber);
};

export const unsubscribe = (subscriber: Subscriber) => {
  subscribers.delete(subscriber);
};

export const broadcast = (event: string, payload: unknown) => {
  const serializedPayload =
    event === 'widgets' &&
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { widgets?: unknown }).widgets)
      ? redactSnapshotForClient(
          payload as {
            widgets: WidgetInstance[];
            settings: DashboardSettings;
          }
        )
      : payload;

  const message = serializeEvent(event, serializedPayload);
  for (const subscriber of Array.from(subscribers)) {
    try {
      subscriber.controller.enqueue(message);
    } catch {
      subscribers.delete(subscriber);
    }
  }
};

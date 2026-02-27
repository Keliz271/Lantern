import { subscribe, unsubscribe, serializeEvent } from '$serverlib/stream';
import { getSettings, getWidgets, refreshConfigFromDisk } from '$serverlib/state';
import { redactSnapshotForClient } from '$serverlib/configSanitizer';

export const GET = ({ request }: { request: Request }) => {
  let subscriber: { controller: ReadableStreamDefaultController<string> } | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let abortListener: (() => void) | null = null;

  const disconnect = () => {
    if (ping) {
      clearInterval(ping);
      ping = null;
    }
    if (abortListener) {
      request.signal.removeEventListener('abort', abortListener);
      abortListener = null;
    }
    if (subscriber) {
      unsubscribe(subscriber);
      subscriber = null;
    }
  };

  const tryEnqueue = (controller: ReadableStreamDefaultController<string>, chunk: string) => {
    try {
      controller.enqueue(chunk);
      return true;
    } catch {
      disconnect();
      return false;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      subscriber = { controller };
      subscribe(subscriber);
      abortListener = () => {
        disconnect();
      };
      request.signal.addEventListener('abort', abortListener, { once: true });
      void (async () => {
        try {
          const snapshot = redactSnapshotForClient(await refreshConfigFromDisk());
          tryEnqueue(controller, serializeEvent('widgets', snapshot));
        } catch {
          tryEnqueue(
            controller,
            serializeEvent(
              'widgets',
              redactSnapshotForClient({ widgets: getWidgets(), settings: getSettings() })
            )
          );
        }
      })();

      ping = setInterval(() => {
        tryEnqueue(controller, ': ping\n\n');
      }, 15000);
    },
    cancel() {
      disconnect();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
};

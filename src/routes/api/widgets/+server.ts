import { json } from '@sveltejs/kit';
import { getWidgets, getSettings, refreshConfigFromDisk } from '$serverlib/state';
import { redactSnapshotForClient } from '$serverlib/configSanitizer';

export const GET = async () => {
  try {
    const snapshot = redactSnapshotForClient(await refreshConfigFromDisk());
    return json(snapshot, {
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return json(
      redactSnapshotForClient({ widgets: getWidgets(), settings: getSettings() }),
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }
};

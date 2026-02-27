import type { WidgetKind } from '$widgets/types';

export type WidgetStyleOption = {
  kind: WidgetKind;
  source: string;
  title: string;
  description: string;
  presetOptions?: Record<string, unknown>;
};

export type WidgetStyleCategory = {
  name: string;
  options: WidgetStyleOption[];
};

export const widgetStyleCategories: WidgetStyleCategory[] = [
  {
    name: 'Monitoring & Metrics',
    options: [
      {
        kind: 'stat',
        source: 'audiobookshelf',
        title: 'Metric Grid',
        description: 'Standard 4-box metrics layout.'
      },
      {
        kind: 'systemMonitor',
        source: 'monitor',
        title: 'System Monitor',
        description: 'Mac Mini and Synology hardware vitals (CPU, RAM, disk, temp).',
        presetOptions: {
          monitorDisplay: 'gauge',
          monitorSystemOrientation: 'side-by-side',
          monitorRefreshSec: 15
        }
      },
      {
        kind: 'monitor',
        source: 'monitor',
        title: 'Endpoint Monitor',
        description: 'Endpoint status and latency checks.',
        presetOptions: { monitorStyle: 'list' }
      },
      {
        kind: 'service',
        source: 'komodo',
        title: 'Docker Manager',
        description: 'Deployment status and stack health.'
      },
      {
        kind: 'grafana',
        source: 'grafana',
        title: 'Grafana',
        description: 'Embedded panels for advanced visualization.'
      }
    ]
  },
  {
    name: 'Media & Downloads',
    options: [
      {
        kind: 'plex',
        source: 'plex',
        title: 'Media Player',
        description: 'Now Playing posters and session counts.'
      },
      {
        kind: 'requests',
        source: 'seerr-requests',
        title: 'Seerr',
        description: 'Request status tracking.'
      },
      {
        kind: 'sabnzbd',
        source: '',
        title: 'Downloaders',
        description: 'Queue, speed, and history view.'
      },
      {
        kind: 'prowlarr',
        source: 'prowlarr',
        title: 'Prowlarr',
        description: 'Indexer status and health.'
      }
    ]
  },
  {
    name: 'Network & Utilities',
    options: [
      {
        kind: 'chart',
        source: 'technitium',
        title: 'DNS',
        description: 'Query and latency graphing.'
      },
      {
        kind: 'speedtest',
        source: 'speedtest-tracker',
        title: 'SpeedTest',
        description: 'Native upload/download graph and table.'
      }
    ]
  },
  {
    name: 'General Helpers',
    options: [
      {
        kind: 'clock',
        source: '',
        title: 'Clock',
        description: 'Time and timezone widget.'
      },
      {
        kind: 'calendar',
        source: '',
        title: 'Calendar',
        description: 'Date and schedule context.'
      }
    ]
  }
];

export const defaultPortBySource: Record<string, number> = {
  technitium: 5380,
  komodo: 9120,
  radarr: 7878,
  sonarr: 8989,
  readarr: 8787,
  audiobookshelf: 13378,
  seerr: 5055,
  'seerr-requests': 5055,
  sabnzbd: 8080,
  qbittorrent: 8081,
  scrutiny: 8080,
  tandoor: 8080,
  'speedtest-tracker': 8765,
  prowlarr: 9696,
  profilarr: 6868,
  'home-assistant': 8123,
  plex: 32400,
  'media-history': 32400,
  grafana: 3000
};

export type TabIconKey =
  | 'layoutGrid'
  | 'home'
  | 'activity'
  | 'layers'
  | 'phone'
  | 'play'
  | 'film'
  | 'music'
  | 'tv'
  | 'cast'
  | 'server'
  | 'cpu'
  | 'hardDrive'
  | 'wifi'
  | 'shield'
  | 'settings'
  | 'terminal'
  | 'zap'
  | 'cloud'
  | 'lock'
  | 'globe'
  | 'search'
  | 'bell'
  | 'calendar';

export type TabIconDef = {
  key: TabIconKey;
  label: string;
  paths: string[];
};

// NOTE: These are "Lucide-like" paths (stroke-only), authored locally to avoid a new dependency.
export const TAB_ICON_DEFS: TabIconDef[] = [
  { key: 'layoutGrid', label: 'Layout Grid', paths: ['M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10-3h8v11h-8V10z'] },
  { key: 'home', label: 'Home', paths: ['M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5z'] },
  { key: 'activity', label: 'Activity', paths: ['M3 12h4l2.2-6 4.2 12 2.1-6H21'] },
  { key: 'layers', label: 'Layers', paths: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 12l10 5 10-5', 'M2 17l10 5 10-5'] },
  { key: 'phone', label: 'Phone', paths: ['M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'] },

  { key: 'play', label: 'Play', paths: ['M8 5l12 7-12 7V5z'] },
  { key: 'film', label: 'Film', paths: ['M4 4h16v16H4V4z', 'M8 4v16', 'M16 4v16', 'M4 8h16', 'M4 16h16'] },
  { key: 'music', label: 'Music', paths: ['M9 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M19 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M11 14V5l10-2v11', 'M11 9l10-2'] },
  { key: 'tv', label: 'TV', paths: ['M4 7h16v11H4V7z', 'M8 21h8', 'M12 18v3'] },
  { key: 'cast', label: 'Cast', paths: ['M2 8.5V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5', 'M2 13a7 7 0 0 1 7 7', 'M2 17a3 3 0 0 1 3 3', 'M2 20h.01'] },

  { key: 'server', label: 'Server', paths: ['M4 4h16v6H4V4z', 'M4 14h16v6H4v-6z', 'M7 7h.01', 'M7 17h.01'] },
  { key: 'cpu', label: 'CPU', paths: ['M9 9h6v6H9V9z', 'M4 12h2', 'M18 12h2', 'M12 4v2', 'M12 18v2', 'M7 4v2', 'M17 4v2', 'M7 18v2', 'M17 18v2', 'M4 7h2', 'M4 17h2', 'M18 7h2', 'M18 17h2'] },
  { key: 'hardDrive', label: 'Hard Drive', paths: ['M4 6h16l-1.5 14H5.5L4 6z', 'M6 10h12', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01'] },
  { key: 'wifi', label: 'WiFi', paths: ['M5 10a11 11 0 0 1 14 0', 'M8.5 13.5a6 6 0 0 1 7 0', 'M11.5 16.5a2.5 2.5 0 0 1 1 0', 'M12 20h.01'] },
  { key: 'shield', label: 'Shield', paths: ['M12 2l8 4v6c0 5-3.6 9.4-8 10-4.4-.6-8-5-8-10V6l8-4z'] },

  { key: 'settings', label: 'Settings', paths: ['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z', 'M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.7a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.2-1.2a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.7a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.7a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.7a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z'] },
  { key: 'terminal', label: 'Terminal', paths: ['M4 5h16v14H4V5z', 'M7 9l2 2-2 2', 'M11 13h4'] },
  { key: 'zap', label: 'Zap', paths: ['M13 2 3 14h8l-1 8 10-12h-8l1-8z'] },
  { key: 'cloud', label: 'Cloud', paths: ['M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10-1.2A3.5 3.5 0 0 0 7 18z'] },
  { key: 'lock', label: 'Lock', paths: ['M7 11V8a5 5 0 0 1 10 0v3', 'M6 11h12v10H6V11z'] },

  { key: 'globe', label: 'Globe', paths: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'] },
  { key: 'search', label: 'Search', paths: ['M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z', 'M21 21l-4.3-4.3'] },
  { key: 'bell', label: 'Bell', paths: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7', 'M10 19a2 2 0 0 0 4 0'] },
  { key: 'calendar', label: 'Calendar', paths: ['M4 5h16v16H4V5z', 'M8 3v4', 'M16 3v4', 'M4 9h16'] }
];

const ICON_KEY_SET = new Set<string>(TAB_ICON_DEFS.map((d) => d.key));

export const normalizeTabIconKey = (raw: unknown): TabIconKey | undefined => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value && ICON_KEY_SET.has(value) ? (value as TabIconKey) : undefined;
};

export const tabIconFallbackForName = (name: string): TabIconKey => {
  const normalized = name.trim().toLowerCase();
  if (normalized === 'main' || normalized === 'home') return 'home';
  if (normalized === 'media') return 'film';
  if (normalized === 'mobile') return 'tv';
  return 'layoutGrid';
};

export const getTabIconPaths = (icon: TabIconKey): string[] =>
  TAB_ICON_DEFS.find((d) => d.key === icon)?.paths ?? TAB_ICON_DEFS[0].paths;

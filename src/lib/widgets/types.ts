export type WidgetKind =
  | 'stat'
  | 'chart'
  | 'service'
  | 'prowlarr'
  | 'sabnzbd'
  | 'speedtest'
  | 'grafana'
  | 'monitor'
  | 'systemMonitor'
  | 'calendar'
  | 'clock'
  | 'requests'
  | 'plex'
  | 'history';

export type WidgetLayout = {
  span: number;
  height?: number;
  columnStart?: number;
};

export type WidgetMobile = {
  hide?: boolean;
  span?: number;
  order?: number;
};

export type WidgetInstance<T = unknown> = {
  id: string;
  kind: WidgetKind;
  title: string;
  source?: string;
  link?: string;
  layout?: WidgetLayout;
  mobile?: WidgetMobile;
  options?: Record<string, unknown>;
  data?: T;
  health?: 'healthy' | 'unhealthy' | 'unknown';
};

export type DashboardSettings = {
  scale?: number;
  showHealthCircles?: boolean;
  widgetOpacity?: number;
  widgetBlurEnabled?: boolean;
  widgetBlur?: number;
  widgetBackgroundColor?: string;
  settingsBackgroundColor?: string;
  backgroundImage?: string;
  backgroundBlur?: number;
  overlayAlpha?: number;
  gridGap?: number;
  fontBody?: string;
  fontHeading?: string;
  globalTitleFontFamily?: string;
  globalTitleFontWeight?: number;
  globalTitleColor?: string;
  globalHeaderFontFamily?: string;
  globalHeaderFontWeight?: number;
  globalHeaderColor?: string;
  cardTitleSize?: number;
  cardTitleAboveSize?: number;
  layoutMode?: 'grid' | 'masonry';
  tabs?: DashboardTab[];
  tabIndicatorStyle?: 'underline' | 'box' | 'neon' | 'dot';
  tabIndicatorColor?: string;
  tabPosition?: 'left' | 'center';
  defaultTabIdWeb?: string;
  defaultTabIdMobile?: string;
  defaultTabId?: string;
};

export type DashboardTab = {
  id: string;
  name: string;
  icon?: string;
};

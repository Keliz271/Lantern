import MetricGridWidget from '$components/widgets/MetricGridWidget.svelte';
import ChartWidget from '$components/widgets/ChartWidget.svelte';
import ServiceWidget from '$components/widgets/ServiceWidget.svelte';
import ProwlarrWidget from '$components/widgets/ProwlarrWidget.svelte';
import SabnzbdWidget from '$components/widgets/SabnzbdWidget.svelte';
import SpeedTestWidget from '$components/widgets/SpeedTestWidget.svelte';
import GrafanaWidget from '../components/widgets/GrafanaWidget.svelte';
import CalendarWidget from '$components/widgets/CalendarWidget.svelte';
import ClockWidget from '$components/widgets/ClockWidget.svelte';
import SeerrRequestsWidget from '$components/widgets/SeerrRequestsWidget.svelte';
import MediaHistoryWidget from '$components/widgets/MediaHistoryWidget.svelte';
import MonitorWidget from '$components/widgets/MonitorWidget.svelte';
import type { WidgetKind } from './types';

type WidgetComponent = new (...args: any[]) => any;

export const widgetRegistry: Record<WidgetKind, { component: WidgetComponent }> = {
  stat: { component: MetricGridWidget },
  chart: { component: ChartWidget },
  service: { component: ServiceWidget },
  prowlarr: { component: ProwlarrWidget },
  sabnzbd: { component: SabnzbdWidget },
  speedtest: { component: SpeedTestWidget },
  grafana: { component: GrafanaWidget },
  monitor: { component: MonitorWidget },
  systemMonitor: { component: MonitorWidget },
  calendar: { component: CalendarWidget },
  clock: { component: ClockWidget },
  requests: { component: SeerrRequestsWidget },
  plex: { component: MediaHistoryWidget },
  history: { component: MediaHistoryWidget }
};

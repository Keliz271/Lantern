import { writable } from 'svelte/store';
import type { WidgetInstance } from '$widgets/types';

export const widgets = writable<WidgetInstance[]>([]);

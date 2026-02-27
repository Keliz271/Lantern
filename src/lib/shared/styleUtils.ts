const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR_RE.test(value);

export const normalizeHexColor = (value: unknown, fallback = '#eef4ff') =>
  isHexColor(value) ? value : fallback;

export const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export const toCssImage = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'none';
  const safe = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `url("${safe}")`;
};

export const toWidgetBackgroundRgb = (value?: string) => {
  if (!isHexColor(value)) return '20, 27, 35';
  const hex = value.slice(1);
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;
  const asNumber = Number.parseInt(normalized, 16);
  if (!Number.isFinite(asNumber)) return '20, 27, 35';
  const red = (asNumber >> 16) & 255;
  const green = (asNumber >> 8) & 255;
  const blue = asNumber & 255;
  return `${red}, ${green}, ${blue}`;
};

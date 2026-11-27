import type { ComponentType } from '../types/architecture.generated';

export interface TypeToken {
  /** Unique two-letter glyph, shown in the node badge and the legend. */
  glyph: string;
  light: string;
  dark: string;
}

/**
 * One distinct accent per component type. The node shape and layout are
 * identical for every type; colour and glyph carry the type.
 */
export const TYPE_TOKENS: Record<ComponentType, TypeToken> = {
  client: { glyph: 'CL', light: '#526579', dark: '#AAB8C5' },
  api_gateway: { glyph: 'GW', light: '#A66A1F', dark: '#E9AD57' },
  load_balancer: { glyph: 'LB', light: '#A66A1F', dark: '#E9AD57' },
  service: { glyph: 'SV', light: '#2865A3', dark: '#79B7F2' },
  worker: { glyph: 'WK', light: '#39779A', dark: '#72BBD8' },
  database: { glyph: 'DB', light: '#7445A6', dark: '#BD91EB' },
  cache: { glyph: 'CA', light: '#7445A6', dark: '#BD91EB' },
  message_queue: { glyph: 'MQ', light: '#6749A5', dark: '#AE97ED' },
  object_storage: { glyph: 'OS', light: '#6354A5', dark: '#A99BF1' },
  cdn: { glyph: 'CD', light: '#287B83', dark: '#6FC5C9' },
  auth_provider: { glyph: 'AU', light: '#896424', dark: '#D6B76C' },
  search_index: { glyph: 'SX', light: '#347B68', dark: '#74C7A7' },
  scheduler: { glyph: 'SC', light: '#347B68', dark: '#74C7A7' },
  external_service: { glyph: 'EX', light: '#475569', dark: '#AAB3BB' },
};

export const COMPONENT_TYPES = Object.keys(TYPE_TOKENS) as ComponentType[];

export function accentFor(type: ComponentType, theme: 'light' | 'dark'): string {
  const token = TYPE_TOKENS[type];
  return theme === 'light' ? token.light : token.dark;
}

export function glyphFor(type: ComponentType): string {
  return TYPE_TOKENS[type].glyph;
}

export function typeLabel(type: ComponentType): string {
  return type.replace(/_/g, ' ');
}

const GROUP_ACCENTS = ['#5B9BFF', '#59C896', '#BD8BFF', '#E8AE55'] as const;

export function groupAccentFor(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return GROUP_ACCENTS[hash % GROUP_ACCENTS.length];
}

/** Node text/background pairs, checked for WCAG AA contrast in both themes. */
export const NODE_COLORS = {
  light: { background: '#FFFFFF', text: '#0F172A' },
  dark: { background: '#1F2937', text: '#F9FAFB' },
} as const;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

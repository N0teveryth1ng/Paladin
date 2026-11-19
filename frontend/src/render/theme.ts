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
  client: { glyph: 'CL', light: '#1D4ED8', dark: '#60A5FA' },
  api_gateway: { glyph: 'GW', light: '#6D28D9', dark: '#A78BFA' },
  load_balancer: { glyph: 'LB', light: '#0369A1', dark: '#38BDF8' },
  service: { glyph: 'SV', light: '#047857', dark: '#34D399' },
  worker: { glyph: 'WK', light: '#B45309', dark: '#FBBF24' },
  database: { glyph: 'DB', light: '#B91C1C', dark: '#F87171' },
  cache: { glyph: 'CA', light: '#BE185D', dark: '#F472B6' },
  message_queue: { glyph: 'MQ', light: '#7E22CE', dark: '#C084FC' },
  object_storage: { glyph: 'OS', light: '#0E7490', dark: '#22D3EE' },
  cdn: { glyph: 'CD', light: '#4D7C0F', dark: '#A3E635' },
  auth_provider: { glyph: 'AU', light: '#4338CA', dark: '#818CF8' },
  search_index: { glyph: 'SX', light: '#C2410C', dark: '#FB923C' },
  scheduler: { glyph: 'SC', light: '#0F766E', dark: '#2DD4BF' },
  external_service: { glyph: 'EX', light: '#475569', dark: '#94A3B8' },
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

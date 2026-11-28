import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Legend } from '../render/Legend';
import {
  COMPONENT_TYPES,
  NODE_COLORS,
  TYPE_TOKENS,
  accentFor,
  contrastRatio,
  glyphFor,
} from '../render/theme';

const HERE = dirname(fileURLToPath(import.meta.url));
const EDGE_COMPONENT = resolve(HERE, '../render/edges/ArchitectureEdge.tsx');
const LEGEND_COMPONENT = resolve(HERE, '../render/Legend.tsx');

afterEach(cleanup);

describe('type tokens and themes', () => {
  it('gives each of the 14 component types a unique colour pair and glyph', () => {
    expect(COMPONENT_TYPES).toHaveLength(14);
    expect(new Set(COMPONENT_TYPES).size).toBe(14);

    const light = new Set(COMPONENT_TYPES.map((type) => accentFor(type, 'light')));
    const dark = new Set(COMPONENT_TYPES.map((type) => accentFor(type, 'dark')));
    const glyphs = new Set(COMPONENT_TYPES.map((type) => glyphFor(type)));

    expect(light.size).toBe(14);
    expect(dark.size).toBe(14);
    expect(glyphs.size).toBe(14);
    expect([...glyphs].every((glyph) => /^[A-Z]{2}$/.test(glyph))).toBe(true);

    for (const type of COMPONENT_TYPES) {
      expect(TYPE_TOKENS[type].light).toMatch(/^#[0-9A-F]{6}$/);
      expect(TYPE_TOKENS[type].dark).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('meets 4.5:1 node text contrast in both themes', () => {
    const light = contrastRatio(NODE_COLORS.light.text, NODE_COLORS.light.background);
    const dark = contrastRatio(NODE_COLORS.dark.text, NODE_COLORS.dark.background);
    console.log(`contrast: light ${light.toFixed(2)}:1, dark ${dark.toFixed(2)}:1`);
    expect(light).toBeGreaterThanOrEqual(4.5);
    expect(dark).toBeGreaterThanOrEqual(4.5);
  });

  it('draws sync and async edges with different Tailwind stroke patterns and arrowheads', async () => {
    const edgeSource = await readFile(EDGE_COMPONENT, 'utf8');
    const legendSource = await readFile(LEGEND_COMPONENT, 'utf8');
    expect(legendSource).toContain('legend-sync [&]:stroke-zinc-300');
    expect(legendSource).toContain('legend-async [&]:stroke-zinc-300');
    expect(legendSource).toContain('[stroke-dasharray:6_4]');
    expect(legendSource).toContain('legend-arrow-filled fill-zinc-300');
    expect(legendSource).toContain('legend-arrow-open fill-none');
    expect(edgeSource).toContain("edge.type === 'async' && 'edge-async [stroke-dasharray:7_5]'");
  });

  it('renders the legend with both edge kinds and all 14 type tokens', () => {
    render(createElement(Legend, { theme: 'light' }));
    expect(screen.getByText(/sync · solid, filled arrow/)).toBeTruthy();
    expect(screen.getByText(/async · dashed, open arrow/)).toBeTruthy();
    expect(screen.getByText(/assumed · dashed border and pill/)).toBeTruthy();
    expect(screen.getByText(/invalid issue/)).toBeTruthy();
    expect(screen.getByText(/judgment issue/)).toBeTruthy();
    expect(screen.getAllByTestId('legend-type')).toHaveLength(14);
  });
});

import type { LayoutResult } from '../layout/layoutTypes';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char] ?? char);
}

function mermaidId(value: string): string {
  return `n_${value.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

export function toMermaid(layout: LayoutResult): string {
  const lines = ['flowchart LR'];
  for (const node of layout.nodes) {
    if (node.kind === 'component' && node.component) {
      lines.push(`  ${mermaidId(node.id)}["${node.component.name.replace(/["\n\r]/g, ' ')}"]`);
    }
  }
  for (const edge of layout.edges) {
    const from = layout.nodes.find((node) => node.id === edge.from);
    const to = layout.nodes.find((node) => node.id === edge.to);
    if (from?.kind !== 'component' || to?.kind !== 'component') continue;
    const arrow = edge.type === 'async' ? '-.->' : '-->';
    const label = edge.displayLabel.replace(/["|\n\r]/g, ' ').trim();
    lines.push(`  ${mermaidId(edge.from)} ${arrow}${label ? `|${label}|` : ''} ${mermaidId(edge.to)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function toSvg(layout: LayoutResult, theme: 'light' | 'dark'): string {
  const padding = 48;
  const width = Math.max(800, layout.width + padding * 2);
  const height = Math.max(500, layout.height + padding * 2);
  const dark = theme === 'dark';
  const bg = dark ? '#151718' : '#f7f8fa';
  const nodeBg = dark ? '#1b1d1f' : '#ffffff';
  const fg = dark ? '#edf0f2' : '#20262e';
  const muted = dark ? '#aeb5bb' : '#78818c';
  const border = dark ? '#758087' : '#cfd5dc';
  const edge = dark ? '#d5d9dc' : '#68727e';
  const nodes = layout.nodes;
  const point = (nodeId: string): { x: number; y: number } | undefined => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return undefined;
    return { x: node.absoluteX + padding, y: node.absoluteY + padding };
  };
  const renderedEdges = layout.edges.map((item) => {
    const source = nodes.find((node) => node.id === item.from);
    const target = nodes.find((node) => node.id === item.to);
    const a = point(item.from); const b = point(item.to);
    if (!source || !target || !a || !b) return '';
    const sx = a.x + source.width; const sy = a.y + source.height / 2;
    const tx = b.x; const ty = b.y + target.height / 2;
    const mid = (sx + tx) / 2;
    const label = item.displayLabel;
    const lx = mid; const ly = (sy + ty) / 2 - 8;
    const labelW = Math.min(220, Math.max(52, label.length * 6.5 + 18));
    return `<path d="M ${sx} ${sy} H ${mid} V ${ty} H ${tx}" fill="none" stroke="${edge}" stroke-width="2"${item.type === 'async' ? ' stroke-dasharray="6 5"' : ''} marker-end="url(#arrow)"/><rect x="${lx - labelW / 2}" y="${ly - 10}" width="${labelW}" height="20" rx="5" fill="${bg}" stroke="${border}"/><text x="${lx}" y="${ly + 4}" text-anchor="middle" fill="${fg}" font-size="11">${escapeXml(label)}</text>`;
  }).join('');
  const renderedNodes = nodes.map((node) => {
    const p = point(node.id);
    if (!p) return '';
    if (node.kind === 'group' && node.group) {
      return `<rect x="${p.x}" y="${p.y}" width="${node.width}" height="${node.height}" rx="8" fill="${dark ? '#243342' : '#e9f1fb'}" stroke="${dark ? '#4c86c4' : '#6c9bd0'}"/><text x="${p.x + 12}" y="${p.y + 22}" fill="${fg}" font-size="13">${escapeXml(node.group.name)}</text>`;
    }
    const component = node.component;
    if (!component) return '';
    const db = ['database', 'cache', 'search_index'].includes(component.type);
    const shape = db
      ? `<ellipse cx="${p.x + node.width / 2}" cy="${p.y + 12}" rx="${node.width / 2}" ry="12" fill="${nodeBg}" stroke="${border}"/><path d="M ${p.x} ${p.y + 12} V ${p.y + node.height - 12} C ${p.x} ${p.y + node.height + 4}, ${p.x + node.width} ${p.y + node.height + 4}, ${p.x + node.width} ${p.y + node.height - 12} V ${p.y + 12}" fill="${nodeBg}" stroke="${border}"/><ellipse cx="${p.x + node.width / 2}" cy="${p.y + node.height - 12}" rx="${node.width / 2}" ry="12" fill="none" stroke="${border}"/>`
      : `<rect x="${p.x}" y="${p.y}" width="${node.width}" height="${node.height}" rx="8" fill="${nodeBg}" stroke="${border}"/>`;
    const second = [component.type.replaceAll('_', ' '), component.technology].filter(Boolean).join(' · ');
    return `${shape}<text x="${p.x + 14}" y="${p.y + 29}" fill="${fg}" font-size="13" font-weight="600">${escapeXml(component.name)}</text><text x="${p.x + 14}" y="${p.y + 49}" fill="${muted}" font-size="10">${escapeXml(second)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${edge}"/></marker></defs><rect width="100%" height="100%" fill="${bg}"/><text x="${padding}" y="28" fill="${fg}" font-size="16" font-weight="600">${escapeXml(layout.title)}</text>${renderedEdges}${renderedNodes}</svg>`;
}

export function downloadSvg(layout: LayoutResult, theme: 'light' | 'dark'): void {
  const blob = new Blob([toSvg(layout, theme)], { type: 'image/svg+xml;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${layout.title.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'paladin-diagram'}.svg`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

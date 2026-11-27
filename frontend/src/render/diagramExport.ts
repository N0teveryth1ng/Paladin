import type { LayoutResult } from '../layout/layoutTypes';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char] ?? char);
}

function mermaidId(value: string): string {
  return `n_${value.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function wrapLabel(text: string, width: number, assumed = false): string[] {
  const maxChars = Math.max(12, Math.floor((width - 28) / 7));
  const firstLineChars = Math.max(8, maxChars - (assumed ? 11 : 0));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const limit = lines.length === 0 ? firstLineChars : maxChars;
    if (word.length > limit) {
      if (line) lines.push(line);
      line = '';
      const chunkLimit = lines.length === 0 ? firstLineChars : maxChars;
      for (let index = 0; index < word.length; index += chunkLimit) {
        const chunk = word.slice(index, index + chunkLimit);
        if (index + chunkLimit < word.length) lines.push(chunk);
        else line = chunk;
      }
    } else if (line.length + word.length + (line ? 1 : 0) <= limit) {
      line += `${line ? ' ' : ''}${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
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
  const edgeParts = layout.edges.map((item) => {
    const source = nodes.find((node) => node.id === item.from);
    const target = nodes.find((node) => node.id === item.to);
    const a = point(item.from); const b = point(item.to);
    if (!source || !target || !a || !b) return { path: '', label: '' };
    const sx = a.x + source.width; const sy = a.y + source.height / 2;
    const tx = b.x; const ty = b.y + target.height / 2;
    const route = item.section?.length
      ? item.section.map((point) => ({ x: point.x + padding, y: point.y + padding }))
      : [{ x: sx, y: sy }, { x: (sx + tx) / 2, y: sy }, { x: (sx + tx) / 2, y: ty }, { x: tx, y: ty }];
    const path = route.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    const labelX = item.labelBox.x + padding;
    const labelY = item.labelBox.y + padding;
    const labelWidth = item.labelBox.width;
    const labelHeight = item.labelBox.height;
    const lines = wrapLabel(item.label, labelWidth, item.assumed);
    const firstLineY = labelY + labelHeight / 2 - ((lines.length - 1) * 15) / 2 + 4;
    const badge = item.assumed
      ? `<rect x="${labelX + 8}" y="${labelY + labelHeight / 2 - 10}" width="66" height="20" rx="6" fill="${dark ? '#55442c' : '#f4e7cb'}"/><text x="${labelX + 41}" y="${labelY + labelHeight / 2 + 4}" text-anchor="middle" fill="${dark ? '#f5b85f' : '#93621e'}" font-size="10" font-weight="600">Assumed</text>`
      : '';
    const textX = labelX + (item.assumed ? 82 : 0);
    const textWidth = labelWidth - (item.assumed ? 82 : 0);
    const labelText = lines.map((line, index) => `<tspan x="${textX + textWidth / 2}" dy="${index === 0 ? 0 : 15}">${escapeXml(line)}</tspan>`).join('');
    return {
      path: `<path d="${path}" fill="none" stroke="${edge}" stroke-width="2"${item.type === 'async' ? ' stroke-dasharray="7 5"' : ''} marker-end="url(#arrow)"/>`,
      label: `<rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="8" fill="${nodeBg}" stroke="${border}"/>${badge}<text x="${textX + textWidth / 2}" y="${firstLineY}" text-anchor="middle" fill="${fg}" font-size="12" font-weight="500">${labelText}</text>`,
    };
  });
  const renderedEdgePaths = edgeParts.map((item) => item.path).join('');
  const renderedEdgeLabels = edgeParts.map((item) => item.label).join('');
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${edge}"/></marker></defs><rect width="100%" height="100%" fill="${bg}"/><text x="${padding}" y="28" fill="${fg}" font-size="16" font-weight="600">${escapeXml(layout.title)}</text>${renderedEdgePaths}${renderedNodes}${renderedEdgeLabels}</svg>`;
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

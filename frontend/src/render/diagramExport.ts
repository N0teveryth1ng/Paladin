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
    const label = edge.label.replace(/["|\n\r]/g, ' ').trim();
    lines.push(`  ${mermaidId(edge.from)} ${arrow}${label ? `|${label}|` : ''} ${mermaidId(edge.to)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function toSvg(layout: LayoutResult, theme: 'light' | 'dark'): string {
  const padding = 48;
  const viewWidth = Math.max(800, layout.width + padding * 2);
  const viewHeight = Math.max(500, layout.height + padding * 2);
  const width = Math.ceil(viewWidth);
  const height = Math.ceil(viewHeight);
  const connectorStroke = 1.8;
  const markerSize = 12;
  const dark = theme === 'dark';
  const bg = dark ? '#151718' : '#f7f8fa';
  const nodeBg = dark ? '#232a31' : '#ffffff';
  const fg = dark ? '#f3f6f8' : '#1a2129';
  const muted = dark ? '#c2cad1' : '#5f6975';
  const border = dark ? '#90a4b8' : '#8fa0b5';
  const edge = dark ? '#dbe4ec' : '#4f6075';
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
    const lines = wrapLabel(item.displayLabel, labelWidth, item.assumed);
    const firstLineY = labelY + labelHeight / 2 - ((lines.length - 1) * 15) / 2 + 4;
    const badge = item.assumed
      ? `<rect x="${labelX + 8}" y="${labelY + labelHeight / 2 - 10}" width="66" height="20" rx="6" fill="${dark ? '#55442c' : '#f4e7cb'}"/><text x="${labelX + 41}" y="${labelY + labelHeight / 2 + 4}" text-anchor="middle" fill="${dark ? '#f5b85f' : '#93621e'}" font-size="10" font-weight="600">Assumed</text>`
      : '';
    const textX = labelX + (item.assumed ? 82 : 0);
    const textWidth = labelWidth - (item.assumed ? 82 : 0);
    const labelText = lines.map((line, index) => `<tspan x="${textX + textWidth / 2}" dy="${index === 0 ? 0 : 15}">${escapeXml(line)}</tspan>`).join('');
    return {
      path: `<path d="${path}" fill="none" stroke="${edge}" stroke-width="${connectorStroke}"${item.type === 'async' ? ' stroke-dasharray="7 5" marker-end="url(#arrow-open)"' : ' marker-end="url(#arrow-filled)"'}/>` ,
      label: `<rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="8" fill="${nodeBg}" stroke="${border}"><title>${escapeXml(item.label)}</title></rect>${badge}<text x="${textX + textWidth / 2}" y="${firstLineY}" text-anchor="middle" fill="${fg}" font-size="12" font-weight="500">${labelText}</text>`,
    };
  });
  const renderedEdgePaths = edgeParts.map((item) => item.path).join('');
  const renderedEdgeLabels = edgeParts.map((item) => item.label).join('');
  const renderedGroups = nodes.filter((node) => node.kind === 'group').map((node) => {
    const p = point(node.id);
    if (!p || !node.group) return '';
    return `<rect x="${p.x}" y="${p.y}" width="${node.width}" height="${node.height}" rx="8" fill="${dark ? '#263848' : '#e3eefb'}" stroke="${dark ? '#6fa6de' : '#5f93cc'}" stroke-width="1.5"/><text x="${p.x + 12}" y="${p.y + 22}" fill="${fg}" font-size="13" font-weight="600">${escapeXml(node.group.name)}</text>`;
  }).join('');
  const renderedComponents = nodes.filter((node) => node.kind === 'component').map((node) => {
    const p = point(node.id);
    if (!p) return '';
    const component = node.component;
    if (!component) return '';
    const db = ['database', 'cache', 'search_index'].includes(component.type);
    const shape = db
      ? `<ellipse cx="${p.x + node.width / 2}" cy="${p.y + 12}" rx="${node.width / 2}" ry="12" fill="${nodeBg}" stroke="${border}"/><path d="M ${p.x} ${p.y + 12} V ${p.y + node.height - 12} C ${p.x} ${p.y + node.height + 4}, ${p.x + node.width} ${p.y + node.height + 4}, ${p.x + node.width} ${p.y + node.height - 12} V ${p.y + 12}" fill="${nodeBg}" stroke="${border}"/><ellipse cx="${p.x + node.width / 2}" cy="${p.y + node.height - 12}" rx="${node.width / 2}" ry="12" fill="none" stroke="${border}"/>`
      : `<rect x="${p.x}" y="${p.y}" width="${node.width}" height="${node.height}" rx="8" fill="${nodeBg}" stroke="${border}"/>`;
    const second = [component.type.replaceAll('_', ' '), component.technology].filter(Boolean).join(' · ');
    return `${shape}<text x="${p.x + 14}" y="${p.y + 29}" fill="${fg}" font-size="13" font-weight="600">${escapeXml(component.name)}</text><text x="${p.x + 14}" y="${p.y + 49}" fill="${muted}" font-size="10">${escapeXml(second)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet"><defs><marker id="arrow-filled" markerUnits="userSpaceOnUse" markerWidth="${markerSize}" markerHeight="${markerSize}" viewBox="0 0 12 12" refX="12" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="${edge}"/></marker><marker id="arrow-open" markerUnits="userSpaceOnUse" markerWidth="${markerSize}" markerHeight="${markerSize}" viewBox="0 0 12 12" refX="12" refY="6" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="${edge}" stroke-width="1.5"/></marker></defs><rect width="100%" height="100%" fill="${bg}"/><text x="${padding}" y="28" fill="${fg}" font-size="16" font-weight="600">${escapeXml(layout.title)}</text>${renderedGroups}${renderedEdgePaths}${renderedComponents}${renderedEdgeLabels}</svg>`;
}

export function downloadSvg(layout: LayoutResult, theme: 'light' | 'dark'): void {
  const blob = new Blob([toSvg(layout, theme)], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `${fileName(layout.title)}.svg`);
}

function renderPngBlob(layout: LayoutResult, theme: 'light' | 'dark'): Promise<Blob | null> {
  return new Promise((resolve) => {
    const svgBlob = new Blob([toSvg(layout, theme)], { type: 'image/svg+xml;charset=utf-8' });
    const sourceUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const maxDimension = 8192;
      const requestedScale = 2;
      const scale = Math.min(requestedScale, maxDimension / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(sourceUrl); resolve(null); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { URL.revokeObjectURL(sourceUrl); resolve(blob); }, 'image/png');
    };
    image.onerror = () => { URL.revokeObjectURL(sourceUrl); resolve(null); };
    image.src = sourceUrl;
  });
}

export function downloadPng(layout: LayoutResult, theme: 'light' | 'dark'): void {
  void renderPngBlob(layout, theme).then((blob) => { if (blob) downloadBlob(blob, `${fileName(layout.title)}.png`); });
}

export async function copyPngToClipboard(layout: LayoutResult, theme: 'light' | 'dark'): Promise<boolean> {
  const blob = await renderPngBlob(layout, theme);
  if (!blob) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function downloadWorkspaceBundle(
  layout: LayoutResult,
  theme: 'light' | 'dark',
  draft: unknown,
  positions: Record<string, { x: number; y: number }>,
  name: string,
): Promise<void> {
  const base = fileName(name);
  const payload: WorkspaceFile = { version: 1, saved_at: new Date().toISOString(), name, draft, positions };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), `${base}.paladin.json`);
  const png = await renderPngBlob(layout, theme);
  if (png) downloadBlob(png, `${base}.png`);
}

function fileName(title: string): string {
  return title.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'paladin-diagram';
}

export interface WorkspaceFile {
  version: number;
  saved_at?: string;
  name?: string;
  draft: unknown;
  positions?: Record<string, { x: number; y: number }>;
}

export function downloadWorkspaceFile(
  draft: unknown,
  positions: Record<string, { x: number; y: number }>,
  name: string,
): void {
  const payload: WorkspaceFile = {
    version: 1,
    saved_at: new Date().toISOString(),
    name,
    draft,
    positions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `${fileName(name)}.paladin.json`);
}

export async function openWorkspaceFile(): Promise<WorkspaceFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.paladin.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Partial<WorkspaceFile>;
        if (!parsed || typeof parsed !== 'object' || !('draft' in parsed)) {
          resolve(null);
          return;
        }
        resolve({
          version: typeof parsed.version === 'number' ? parsed.version : 1,
          saved_at: typeof parsed.saved_at === 'string' ? parsed.saved_at : undefined,
          name: typeof parsed.name === 'string' ? parsed.name : file.name.replace(/\.paladin\.json$|\.json$/i, ''),
          draft: parsed.draft,
          positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions as Record<string, { x: number; y: number }> : {},
        });
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

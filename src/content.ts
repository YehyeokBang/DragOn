import TurndownService from 'turndown';

type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CopyMarkdownMessage = { type: 'copy_markdown' };

type GetSelectionMessage = { type: 'get_selection' };

type ClearSelectionMessage = { type: 'clear_selection' };

type RenderSelectionMessage = { type: 'render_selection' };

type ShowCaptureMessage = {
  type: 'show_capture';
  dataUrl: string;
  rect: SelectionRect;
  dpr: number;
};

type ToastMessage = { type: 'toast'; text: string };

type IncomingMessage =
  | CopyMarkdownMessage
  | GetSelectionMessage
  | ClearSelectionMessage
  | RenderSelectionMessage
  | ShowCaptureMessage
  | ToastMessage
  | { type: 'ping' };

type SelectionInfo = {
  hasSelection: boolean;
  rect?: SelectionRect;
  dpr?: number;
  pageLeft?: number;
  pageRight?: number;
  pageTop?: number;
  pageBottom?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  scrollX?: number;
  scrollY?: number;
  docHeight?: number;
  isLong?: boolean;
};

const FLAG = '__dragon_injected__';
const OVERLAY_ID = 'dragon-overlay';
const TOAST_ID = 'dragon-toast';

function setup() {
  ensureStyle();

  chrome.runtime.onMessage.addListener(
    (message: IncomingMessage, _sender, sendResponse) => {
      if (message.type === 'copy_markdown') {
        void copyMarkdown();
        return;
      }

      if (message.type === 'get_selection') {
        const info = getSelectionInfo();
        sendResponse(info);
        return true;
      }

      if (message.type === 'ping') {
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'clear_selection') {
        clearSelection();
        return;
      }

      if (message.type === 'show_capture') {
        void showCaptureOverlay(message.dataUrl, message.rect, message.dpr);
        return;
      }

      if (message.type === 'render_selection') {
        void renderSelectionImage();
        return;
      }

      if (message.type === 'toast') {
        showToast(message.text);
      }
    }
  );
}

function ensureStyle() {
  if (document.getElementById('dragon-style')) return;

  const style = document.createElement('style');
  style.id = 'dragon-style';
  style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(10, 12, 16, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
}
#${OVERLAY_ID} * {
  box-sizing: border-box;
}
#${OVERLAY_ID} .dragon-panel {
  background: #ffffff;
  color: #111111;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  max-width: min(900px, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#${OVERLAY_ID} .dragon-header {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e8e8e8;
}
#${OVERLAY_ID} .dragon-preview {
  padding: 16px;
  overflow: auto;
  background: #f8f8f8;
}
#${OVERLAY_ID} .dragon-preview canvas {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  background: white;
}
#${OVERLAY_ID} .dragon-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e8e8e8;
  justify-content: flex-end;
}
#${OVERLAY_ID} .dragon-button {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #d0d0d0;
  background: #ffffff;
  color: #111111;
  font-size: 13px;
  cursor: pointer;
}
#${OVERLAY_ID} .dragon-button.primary {
  background: #111111;
  color: #ffffff;
  border-color: #111111;
}
#${TOAST_ID} {
  position: fixed;
  right: 16px;
  top: 16px;
  z-index: 2147483647;
  background: rgba(18, 18, 20, 0.92);
  color: white;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 120ms ease, transform 120ms ease;
  pointer-events: none;
}
#${TOAST_ID}.show {
  opacity: 1;
  transform: translateY(0);
}
`;
  document.head.appendChild(style);
}

function getSelectionInfo(): SelectionInfo {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { hasSelection: false };
  }

  const range = selection.getRangeAt(0);
  const rect = getBoundingRectFromRange(range);
  const bounds = getRangePageBounds(range);
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { hasSelection: false };
  }

  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const docHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  );

  const pageLeft = bounds?.left ?? rect.left + scrollX;
  const pageRight = bounds?.right ?? rect.left + rect.width + scrollX;
  const pageTop = bounds?.top ?? rect.top + scrollY;
  const pageBottom = bounds?.bottom ?? rect.top + rect.height + scrollY;

  const isLong =
    pageBottom - pageTop > viewportHeight ||
    pageTop < scrollY ||
    pageBottom > scrollY + viewportHeight;

  return {
    hasSelection: true,
    rect,
    dpr: window.devicePixelRatio || 1,
    pageLeft,
    pageRight,
    pageTop,
    pageBottom,
    viewportWidth,
    viewportHeight,
    scrollX,
    scrollY,
    docHeight,
    isLong
  };
}

function getSelectionHtml(): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  const container = document.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}

function getBoundingRectFromRange(range: Range): SelectionRect | null {
  const clientRects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0
  );

  if (clientRects.length === 0) {
    const rect = range.getBoundingClientRect();
    return normalizeRect(rect);
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const rect of clientRects) {
    if (rect.left < left) left = rect.left;
    if (rect.top < top) top = rect.top;
    if (rect.right > right) right = rect.right;
    if (rect.bottom > bottom) bottom = rect.bottom;
  }

  return normalizeRect({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  } as DOMRect);
}

function getRangePageBounds(range: Range) {
  const clientRects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0
  );

  if (clientRects.length === 0) {
    const rect = range.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    return {
      left: rect.left + scrollX,
      right: rect.right + scrollX,
      top: rect.top + scrollY,
      bottom: rect.bottom + scrollY
    };
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;

  for (const rect of clientRects) {
    const rLeft = rect.left + scrollX;
    const rRight = rect.right + scrollX;
    const rTop = rect.top + scrollY;
    const rBottom = rect.bottom + scrollY;
    if (rLeft < left) left = rLeft;
    if (rTop < top) top = rTop;
    if (rRight > right) right = rRight;
    if (rBottom > bottom) bottom = rBottom;
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

  return { left, right, top, bottom };
}

function normalizeRect(rect: DOMRect): SelectionRect | null {
  const viewport = window.visualViewport;
  const offsetLeft = viewport?.offsetLeft ?? 0;
  const offsetTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;

  const left = clamp(rect.left - offsetLeft, 0, viewportWidth);
  const top = clamp(rect.top - offsetTop, 0, viewportHeight);
  const right = clamp(rect.right - offsetLeft, 0, viewportWidth);
  const bottom = clamp(rect.bottom - offsetTop, 0, viewportHeight);
  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) return null;

  return { left, top, width, height };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function copyMarkdown() {
  const html = getSelectionHtml();
  const selection = window.getSelection();
  const plainText = selection?.toString() ?? '';

  if (!html || plainText.trim().length === 0) {
    showToast('No selection');
    return;
  }

  let markdown: string | null = null;
  try {
    const turndown = createTurndown();
    markdown = postprocessMarkdown(turndown.turndown(html).trim());
  } catch {
    markdown = null;
  }

  if (!markdown) {
    const copied = await copyText(plainText);
    if (copied) {
      showToast('Copied as plain text');
    } else {
      showToast('Copy failed');
    }
    return;
  }

  const copied = await copyText(markdown);
  if (copied) {
    showToast('Markdown copied');
  } else {
    showToast('Copy failed');
  }
}

function createTurndown() {
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    strongDelimiter: '**'
  });

  service.addRule('lineBreak', {
    filter: 'br',
    replacement: () => '\n'
  });

  return service;
}

function postprocessMarkdown(markdown: string): string {
  let output = markdown;
  output = output.replace(/\\\[|\\\]/g, (match) => (match === '\\[' ? '[' : ']'));
  output = output.replace(/^•\s+/gm, '- ');
  output = output.replace(/^(\d+)\\\.\s+/gm, '$1. ');
  output = output.replace(/(\d+)\\\./g, '$1.');
  return output;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return fallbackCopy(text);
  }
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.setAttribute('readonly', 'true');
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

async function showCaptureOverlay(dataUrl: string, rect: SelectionRect, dpr: number) {
  const canvas = await cropCanvas(dataUrl, rect, dpr);
  if (!canvas) {
    showToast('Capture failed (iframe/cross-origin/permission)');
    return;
  }

  const overlay = buildOverlay(canvas);
  document.body.appendChild(overlay);
}

function buildOverlay(canvas: HTMLCanvasElement): HTMLElement {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;

  const panel = document.createElement('div');
  panel.className = 'dragon-panel';

  const header = document.createElement('div');
  header.className = 'dragon-header';
  header.textContent = 'Selection capture';

  const preview = document.createElement('div');
  preview.className = 'dragon-preview';
  preview.appendChild(canvas);

  const actions = document.createElement('div');
  actions.className = 'dragon-actions';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'dragon-button primary';
  downloadBtn.textContent = 'Download PNG';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'dragon-button';
  copyBtn.textContent = 'Copy to clipboard';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'dragon-button';
  closeBtn.textContent = 'Close';

  actions.append(downloadBtn, copyBtn, closeBtn);
  panel.append(header, preview, actions);
  overlay.appendChild(panel);

  const closeOverlay = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeOverlay();
    }

    if (event.key === 'Enter') {
      void copyCanvasToClipboard(canvas);
      closeOverlay();
    }
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeOverlay();
  });

  document.addEventListener('keydown', onKeyDown);

  closeBtn.addEventListener('click', () => closeOverlay());
  downloadBtn.addEventListener('click', () => downloadCanvas(canvas));
  copyBtn.addEventListener('click', () => void copyCanvasToClipboard(canvas));

  return overlay;
}

function downloadCanvas(canvas: HTMLCanvasElement) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dragon-selection.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

async function copyCanvasToClipboard(canvas: HTMLCanvasElement) {
  if (!('ClipboardItem' in window)) {
    showToast('Copy failed');
    return;
  }

  canvas.toBlob(async (blob) => {
    if (!blob) {
      showToast('Copy failed');
      return;
    }

    try {
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      showToast('Image copied');
    } catch {
      showToast('Copy failed');
    }
  }, 'image/png');
}

async function cropCanvas(dataUrl: string, rect: SelectionRect, dpr: number) {
  const img = new Image();
  img.src = dataUrl;

  await img.decode().catch(() => null);
  if (!img.width || !img.height) return null;

  const sx = Math.max(0, Math.floor(rect.left * dpr));
  const sy = Math.max(0, Math.floor(rect.top * dpr));
  const sw = Math.min(img.width - sx, Math.ceil(rect.width * dpr));
  const sh = Math.min(img.height - sy, Math.ceil(rect.height * dpr));

  if (sw <= 0 || sh <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function showToast(text: string) {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
  }

  toast.textContent = text;
  toast.classList.add('show');

  setTimeout(() => {
    toast?.classList.remove('show');
  }, 1800);
}

function clearSelection() {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
}

async function renderSelectionImage() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    showToast('No selection');
    return;
  }

  const range = selection.getRangeAt(0);
  const bounds = getRangePageBounds(range);
  if (!bounds) {
    showToast('Capture failed');
    return;
  }

  const width = Math.max(0, bounds.right - bounds.left);
  const height = Math.max(0, bounds.bottom - bounds.top);
  if (width <= 0 || height <= 0) {
    showToast('No selection');
    return;
  }

  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.position = 'relative';
  wrapper.style.boxSizing = 'border-box';

  const bg = getComputedStyle(document.body).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    wrapper.style.background = bg;
  }

  const styleTag = document.createElement('style');
  styleTag.textContent = collectDocumentStyles();
  wrapper.appendChild(styleTag);
  wrapper.appendChild(fragment);

  absolutizeImageSources(wrapper);
  await inlineImagesAsDataUrls(wrapper);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    ${new XMLSerializer().serializeToString(wrapper)}
  </foreignObject>
</svg>`;

  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const canvas = await rasterizeSvg(svgUrl, width, height);
  if (!canvas) {
    showToast('Capture failed');
    return;
  }

  const overlay = buildOverlay(canvas);
  document.body.appendChild(overlay);
}

function collectDocumentStyles() {
  let cssText = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        cssText += `${rule.cssText}\n`;
      }
    } catch {
      continue;
    }
  }
  return cssText;
}

function absolutizeImageSources(root: HTMLElement) {
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) {
      return;
    }
    try {
      img.setAttribute('src', new URL(src, window.location.href).toString());
    } catch {
      return;
    }
  });
}

async function inlineImagesAsDataUrls(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll('img'));
  const placeholder = await getPlaceholderDataUrl();

  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;

      try {
        const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) {
          img.setAttribute('src', placeholder);
          img.removeAttribute('srcset');
          return;
        }
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        img.setAttribute('src', dataUrl);
        img.removeAttribute('srcset');
      } catch {
        img.setAttribute('src', placeholder);
        img.removeAttribute('srcset');
        return;
      }
    })
  );
}

let placeholderDataUrl: string | null = null;

async function getPlaceholderDataUrl() {
  if (placeholderDataUrl) return placeholderDataUrl;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90">
  <rect x="1.5" y="1.5" width="117" height="87" rx="10" ry="10" fill="#f3f4f6" stroke="#d1d5db" stroke-width="3"/>
  <path d="M22 66 L44 42 L58 56 L72 40 L98 66 Z" fill="#e5e7eb"/>
  <circle cx="80" cy="32" r="9" fill="#e5e7eb"/>
  <line x1="26" y1="22" x2="94" y2="68" stroke="#9ca3af" stroke-width="4" stroke-linecap="round"/>
</svg>`;

  placeholderDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return placeholderDataUrl;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

async function rasterizeSvg(svgUrl: string, width: number, height: number) {
  const img = new Image();
  img.src = svgUrl;
  await img.decode().catch(() => null);
  if (!img.width || !img.height) return null;

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

if (!(window as unknown as Record<string, boolean>)[FLAG]) {
  (window as unknown as Record<string, boolean>)[FLAG] = true;
  setup();
}

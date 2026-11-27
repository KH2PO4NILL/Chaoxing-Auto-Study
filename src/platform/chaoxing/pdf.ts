import { selectors, visible } from './dom';
import type { PdfReader } from './types';

export function readPdf(documents: Document[]): PdfReader | undefined {
  const viewports = documents.flatMap((doc) => Array.from(
    doc.querySelectorAll<HTMLElement>('#viewerContainer:has(.pdfViewer)'),
  ).filter((node) => visible(node) && !node.closest(selectors.question)));
  const panFrames = documents
    .filter((doc) => /^\/ananas\/modules\/pdf\//i.test(new URL(doc.URL).pathname))
    .flatMap((doc) => Array.from(doc.querySelectorAll<HTMLIFrameElement>('#docContainer #img iframe#panView')))
    .filter((frame) => visible(frame) && Boolean(frame.getAttribute('src')));
  if (viewports.length + panFrames.length > 1) return { reason: '当前显示多个 PDF，请在学习通阅读器中选择文档。' };
  const pan = panFrames[0];
  if (pan) return { frame: pan, source: pan.src };
  const viewport = viewports[0];
  if (!viewport) {
    const embedded = documents.some((doc) => Array.from(doc.querySelectorAll(`${selectors.pdfFrame}, ${selectors.pdfEmbed}`))
      .some((node) => visible(node) && !node.closest(selectors.question)));
    return embedded ? { reason: '等待 PDF 阅读器就绪。若页面一直如此，请使用学习通原阅读器。' } : undefined;
  }
  const documentView = viewport.querySelector<HTMLElement>('.pdfViewer')!;
  const lastPage = documentView.querySelector('.page[data-page-number]:last-child');
  const count = viewport.ownerDocument.querySelector<HTMLInputElement>('#pageNumber')?.max;
  if (!lastPage || (count && lastPage.getAttribute('data-page-number') !== count)
    || !viewport.clientHeight || !lastPage.getBoundingClientRect().height) {
    return { reason: 'PDF 页面尚未加载完成。' };
  }
  const frame = viewport.ownerDocument.defaultView?.frameElement;
  const source = JSON.stringify([viewport.ownerDocument.URL, frame?.getAttribute('src'), lastPage.getAttribute('data-page-number')]);
  return { viewport, lastPage, source };
}

export interface PdfStep {
  state: 'scrolled' | 'end' | 'loading' | 'unavailable' | 'hidden';
  percent?: number;
  token?: string;
}

export function scrollPdf(viewport: HTMLElement, lastPage: Element, advance: boolean): PdfStep {
  const doc = viewport.ownerDocument;
  if (doc.hidden) return { state: 'hidden' };
  if (!viewport.clientHeight || !lastPage.getBoundingClientRect().height) return { state: 'loading' };
  const before = viewport.scrollTop;
  const max = viewport.scrollHeight - viewport.clientHeight;
  const progress = () => max > 1 ? Math.max(0, Math.min(100, Math.round(100 * viewport.scrollTop / max))) : undefined;
  if (max - before <= 1) {
    const top = viewport === doc.scrollingElement ? 0 : viewport.getBoundingClientRect().top + viewport.clientTop;
    return lastPage.getBoundingClientRect().bottom <= top + viewport.clientHeight + 2
      ? { state: 'end', percent: progress() } : { state: 'unavailable' };
  }
  if (advance) {
    const step = Math.max(1, Math.floor(viewport.clientHeight * 0.8));
    viewport.scrollTo({ top: Math.min(max, before + step), behavior: 'instant' });
    if (viewport.scrollTop <= before) return { state: 'unavailable' };
  }
  return { state: 'scrolled', percent: progress() };
}

import { scrollPdf, type PdfStep } from './pdf';

const panOrigin = 'https://pan-yz.chaoxing.com';
const protocol = 'chaoxing-auto-study:pdf';

export function panReaderUrl(url: URL): boolean {
  return url.origin === panOrigin && /^\/screen\/v2\/file_[a-z0-9]+\/?$/i.test(url.pathname);
}

export function mountPanReader(window: Window): void {
  const { document } = window;
  let lastPage: Element | undefined;
  let token = '';
  window.addEventListener('message', (event: MessageEvent) => {
    const port = event.ports[0];
    const command = event.data;
    if (event.source !== window.top || window.parent === window.top || !/^https:\/\/[a-z0-9.-]+\.chaoxing\.com$/i.test(event.origin)
      || !port || command?.protocol !== protocol || typeof command.advance !== 'boolean') return;
    try {
      const page = document.querySelector('.fileBox > ul > li[id^="anchor"]:last-child');
      const viewport = document.scrollingElement;
      if (page !== lastPage) {
        lastPage = page ?? undefined;
        token = window.crypto.randomUUID();
      }
      let reply: PdfStep = { state: 'loading', token };
      if (command.advance && command.token !== token) reply = { state: 'unavailable' };
      else if (page && viewport?.nodeType === Node.ELEMENT_NODE) {
        const offset = viewport.clientHeight;
        const images = Array.from(document.querySelectorAll<HTMLImageElement>('.fileBox > ul > li[id^="anchor"] > img'));
        const pending = images.some((image) => {
          if (image.complete && image.naturalWidth) return false;
          const bounds = image.parentElement!.getBoundingClientRect();
          return bounds.bottom >= 0 && bounds.top <= offset;
        });
        if (!pending) reply = { ...scrollPdf(viewport as HTMLElement, page, command.advance), token };
      }
      port.postMessage(reply);
    } finally { port.close(); }
  });
}

export function stepPanReader(frame: HTMLIFrameElement, advance: boolean, token: string | undefined, signal: AbortSignal): Promise<PdfStep> {
  const target = frame.contentWindow;
  if (!target || signal.aborted) return Promise.resolve({ state: 'unavailable' });
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (reply: PdfStep) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      channel.port1.close();
      resolve(reply);
    };
    const abort = () => finish({ state: 'unavailable' });
    const timer = setTimeout(() => finish({ state: 'loading' }), 1500);
    signal.addEventListener('abort', abort, { once: true });
    channel.port1.onmessage = ({ data }) => {
      if (typeof data?.token === 'string' && ['scrolled', 'end', 'loading', 'unavailable', 'hidden'].includes(data.state)) {
        const percent = typeof data.percent === 'number' && Number.isFinite(data.percent)
          ? Math.max(0, Math.min(100, Math.round(data.percent))) : undefined;
        finish({ state: data.state, token: data.token, percent });
      } else finish({ state: 'unavailable' });
    };
    try { target.postMessage({ protocol, advance, token }, panOrigin, [channel.port2]); }
    catch { channel.port2.close(); finish({ state: 'unavailable' }); }
  });
}

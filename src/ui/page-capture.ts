import { encodeScreenshot } from '../practice/screenshot';

interface CaptureDevices extends MediaDevices {
  setCaptureHandleConfig?(config: { handle?: string; permittedOrigins: string[] }): void;
}

interface TabTrack extends MediaStreamTrack {
  getCaptureHandle?(): { handle: string } | null;
}

interface TabCaptureOptions extends DisplayMediaStreamOptions {
  preferCurrentTab: boolean;
  selfBrowserSurface: 'include';
  surfaceSwitching: 'exclude';
  monitorTypeSurfaces: 'exclude';
}

function playFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    video.play().then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function snapshot(document: Document, signal: AbortSignal): Promise<HTMLCanvasElement | undefined> {
  const window = document.defaultView!;
  const devices: CaptureDevices | undefined = window.navigator.mediaDevices;
  if (!devices?.getDisplayMedia || !devices.setCaptureHandleConfig) {
    throw new Error('当前浏览器无法框选当前标签页，可用系统截图后粘贴。');
  }
  signal.throwIfAborted();
  const handle = window.crypto.randomUUID();
  const video = document.createElement('video');
  let stream: MediaStream | undefined;
  try {
    devices.setCaptureHandleConfig({ handle, permittedOrigins: [window.location.origin] });
    const options: TabCaptureOptions = { video: { displaySurface: 'browser' }, audio: false,
      preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude' };
    try {
      stream = await devices.getDisplayMedia(options);
    } catch (error) {
      if ((error as DOMException).name === 'NotAllowedError' || (error as DOMException).name === 'AbortError') return;
      throw new Error('无法启动浏览器截图，可用系统截图后粘贴。');
    }
    signal.throwIfAborted();
    const track = stream.getVideoTracks()[0] as TabTrack | undefined;
    if (track?.getCaptureHandle?.()?.handle !== handle) {
      throw new Error('请重新框选，并在浏览器窗口选择当前学习通标签页。');
    }
    video.muted = true;
    video.srcObject = stream;
    const frameSignal = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
    await playFrame(video, frameSignal).catch(() => {
      throw new Error('浏览器没有返回截图画面，请重试或粘贴图片。');
    });
    signal.throwIfAborted();
    if (track.getCaptureHandle?.()?.handle !== handle || !video.videoWidth || !video.videoHeight) {
      throw new Error('截图画面不可用，请重新选择当前标签页。');
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 3840 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法生成截图画面，请重试。');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    devices.setCaptureHandleConfig({ permittedOrigins: [] });
  }
}

export class PageCapture {
  private running = false;

  constructor(private readonly layer: HTMLElement, private readonly outline: HTMLElement, private readonly cancel: HTMLButtonElement) {}

  async run(signal: AbortSignal): Promise<string | undefined> {
    if (this.running) throw new Error('请先结束上一次截图。');
    this.running = true;
    try {
      const frame = await snapshot(this.layer.ownerDocument, signal);
      if (!frame || signal.aborted) return;
      return await this.select(frame, signal);
    } finally { this.running = false; }
  }

  private select(frame: HTMLCanvasElement, signal: AbortSignal): Promise<string | undefined> {
    const { layer, outline, cancel } = this;
    const events = new AbortController();
    const options = { signal: events.signal };
    let start: { x: number; y: number; pointer: number } | undefined;
    const point = (event: PointerEvent) => {
      const bounds = layer.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
        y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
      };
    };
    const region = (event: PointerEvent) => {
      const end = point(event);
      return { x: Math.min(start!.x, end.x), y: Math.min(start!.y, end.y),
        width: Math.abs(end.x - start!.x), height: Math.abs(end.y - start!.y) };
    };
    frame.className = 'capture-image';
    frame.setAttribute('aria-hidden', 'true');
    layer.prepend(frame);
    layer.hidden = false;
    layer.focus();
    return new Promise((resolve, reject) => {
      const clean = () => {
        events.abort();
        signal.removeEventListener('abort', dismiss);
        layer.hidden = outline.hidden = true;
        frame.remove();
      };
      const dismiss = () => { clean(); resolve(undefined); };
      signal.addEventListener('abort', dismiss, { once: true });
      cancel.addEventListener('click', dismiss, options);
      layer.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          cancel.focus();
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }, options);
      layer.addEventListener('pointerdown', (event) => {
        if (start || event.button !== 0 || cancel.contains(event.target as Node)) return;
        start = { ...point(event), pointer: event.pointerId };
        layer.setPointerCapture(event.pointerId);
      }, options);
      layer.addEventListener('pointermove', (event) => {
        if (event.pointerId !== start?.pointer) return;
        const area = region(event);
        Object.assign(outline.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.width}px`, height: `${area.height}px` });
        outline.hidden = false;
      }, options);
      layer.addEventListener('pointerup', (event) => {
        if (event.pointerId !== start?.pointer) return;
        const { x, y, width, height } = region(event);
        start = undefined;
        if (width < 12 || height < 12) { outline.hidden = true; return; }
        const sx = frame.width / layer.clientWidth;
        const sy = frame.height / layer.clientHeight;
        try {
          resolve(encodeScreenshot(layer.ownerDocument, frame, { x: x * sx, y: y * sy, width: width * sx, height: height * sy }));
        } catch (error) { reject(error); }
        finally { clean(); }
      }, options);
      layer.addEventListener('pointercancel', (event) => {
        if (event.pointerId !== start?.pointer) return;
        start = undefined;
        outline.hidden = true;
      }, options);
    });
  }
}

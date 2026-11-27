import { stepPanReader } from '../platform/chaoxing/pan-reader';
import { scrollPdf } from '../platform/chaoxing/pdf';
import type { CourseContext, PdfReader } from '../platform/chaoxing/types';

type Viewer = Exclude<PdfReader, { reason: string }>;
const readingInterval = 4000;

function sameViewer(a: Viewer, b?: PdfReader): boolean {
  if (!b || 'reason' in b || a.source !== b.source) return false;
  if ('frame' in a) return 'frame' in b && a.frame === b.frame;
  return 'viewport' in b && a.viewport === b.viewport && a.lastPage === b.lastPage;
}

export class Reading {
  private active?: { viewer: Viewer; controller: AbortController; token?: string; pending: number };
  private observed?: Viewer;
  private position?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private message = '';

  constructor(private readonly live: () => CourseContext | undefined, private readonly changed: () => void) {}

  view(context: CourseContext) {
    const pdf = context.pdf;
    const ready = pdf && !('reason' in pdf);
    return {
      visible: Boolean(pdf || context.kind === 'pdf'),
      canStart: Boolean(ready && context.identity && !this.active),
      running: Boolean(this.active),
      message: this.message || (pdf && 'reason' in pdf ? pdf.reason : ready
        ? '点击开始后，原阅读器会从当前位置逐屏滚动。' : '请在学习通打开 PDF 阅读器。'),
      percent: this.position,
    };
  }

  start(): void {
    const context = this.live();
    const pdf = context?.pdf;
    if (!context?.identity || !pdf || 'reason' in pdf || this.active) return;
    this.observed = pdf;
    this.active = { viewer: pdf, controller: new AbortController(), pending: 0 };
    this.position = undefined;
    this.message = '正在自动阅读 PDF。';
    const element = 'frame' in pdf ? pdf.frame : pdf.viewport;
    element.scrollIntoView({ block: 'nearest' });
    void this.advance(false);
    this.changed();
  }

  sync(context: CourseContext): void {
    if (!this.observed || sameViewer(this.observed, context.pdf)) return;
    this.observed = context.pdf && !('reason' in context.pdf) ? context.pdf : undefined;
    this.position = undefined;
    if (this.active) this.stop('PDF 阅读器已变化，请重新开始。');
    else this.message = '';
  }

  stop(message = '已暂停 PDF 阅读。'): void {
    if (!this.active) return;
    this.dispose();
    this.message = message;
    this.changed();
  }

  private schedule(): void {
    this.timer = setTimeout(() => { void this.advance(true); }, readingInterval);
  }

  private async advance(move: boolean): Promise<void> {
    const active = this.active;
    if (!active) return;
    const { viewer } = active;
    if (!sameViewer(viewer, this.live()?.pdf)) {
      this.stop('PDF 阅读器已变化，请重新开始。');
      return;
    }
    const step = 'frame' in viewer
      ? await stepPanReader(viewer.frame, move && Boolean(active.token), active.token, active.controller.signal)
      : scrollPdf(viewer.viewport, viewer.lastPage, move);
    if (this.active !== active) return;
    this.position = step.percent ?? this.position;
    switch (step.state) {
      case 'hidden':
        this.stop('标签页已离开前台，PDF 阅读已暂停。');
        return;
      case 'end':
        this.stop('已滚动至 PDF 末尾。请查看学习通的完成标记。');
        return;
      case 'unavailable':
        this.stop('无法继续滚动，请在学习通原阅读器中完成阅读。');
        return;
      case 'loading':
        if (++active.pending >= 3) {
          this.stop('PDF 阅读器或页面未就绪，请刷新后重试，或在原阅读器中阅读。');
          return;
        }
        this.message = '正在等待 PDF 页面加载。';
        break;
      case 'scrolled':
        active.pending = 0;
        active.token = step.token;
        this.message = '正在自动阅读 PDF。';
        break;
    }
    this.schedule();
    this.changed();
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.active?.controller.abort();
    this.active = undefined;
  }
}

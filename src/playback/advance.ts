import { sameSection } from '../platform/chaoxing/types';
import type { CourseContext, NextSection, SectionEntry, SectionIdentity } from '../platform/chaoxing/types';

const delay = 10_000;
type AdvanceMode = 'video' | 'section';

export class Advance {
  private mode?: AdvanceMode;
  private message = '';
  private pending?: { entry: SectionEntry; deadline: number; timer: ReturnType<typeof setTimeout> };

  constructor(private readonly live: () => CourseContext | undefined,
    private readonly next: (identity: SectionIdentity, requireVideo: boolean) => NextSection,
    private readonly enter: (identity: SectionIdentity, entry: SectionEntry, autoplay: boolean) => void,
    private readonly changed: () => void) {}

  view() {
    return { armed: Boolean(this.mode), seconds: this.pending ? Math.max(1, Math.ceil((this.pending.deadline - Date.now()) / 1000)) : undefined,
      message: this.message };
  }

  arm(mode: AdvanceMode): void {
    if (this.mode === 'section' || this.mode === mode) return;
    this.dispose();
    this.mode = mode;
    this.sync(this.live());
    this.changed();
  }

  stop(message = '已取消自动跳转。', videoOnly = false): void {
    if (!this.mode || (videoOnly && this.mode !== 'video')) return;
    this.dispose();
    this.message = message;
    this.changed();
  }

  sync(context?: CourseContext): void {
    if (!this.mode) return;
    if (!context?.identity || !context.screenshotAvailable) {
      this.stop('当前课程目录无法确认，自动跳转已停止。');
      return;
    }
    const candidate = this.next(context.identity, this.mode === 'video');
    if ('reason' in candidate) {
      this.stop(candidate.reason);
      return;
    }
    if (!context.completed || context.interaction) {
      this.clearTimer();
      this.message = '等待学习通确认本节任务全部完成。';
      return;
    }
    if (this.pending && this.sameEntry(this.pending.entry, candidate)) return;
    this.clearTimer();
    this.message = '本节任务已完成。';
    const deadline = Date.now() + delay;
    const timer = setTimeout(() => this.go(), delay);
    this.pending = { entry: candidate, deadline, timer };
  }

  private sameEntry(a: SectionEntry, b: SectionEntry): boolean {
    return a.action === b.action && sameSection(a.target, b.target);
  }

  private go(): void {
    const mode = this.mode;
    const pending = this.pending;
    const context = this.live();
    if (!mode || !pending) return;
    const candidate = context?.identity && this.next(context.identity, mode === 'video');
    if (!context?.identity || !context.screenshotAvailable || !context.completed || context.interaction
      || !candidate || 'reason' in candidate || !this.sameEntry(pending.entry, candidate)) {
      this.clearTimer();
      this.sync(context);
      this.changed();
      return;
    }
    this.dispose();
    this.message = '正在进入下一节。';
    this.enter(context.identity, candidate, mode === 'video');
    this.changed();
  }

  private clearTimer(): void {
    clearTimeout(this.pending?.timer);
    this.pending = undefined;
  }

  dispose(): void {
    this.clearTimer();
    this.mode = undefined;
  }
}

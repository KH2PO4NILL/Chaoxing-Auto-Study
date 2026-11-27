import type { CourseContext, SectionEntry, SectionIdentity } from '../platform/chaoxing/types';
import type { PlaybackMode } from '../settings/store';
import { continuationMs, type Continuation } from './continuation';

export interface PlaybackView {
  state: 'idle' | 'starting' | 'playing' | 'paused' | 'waiting' | 'ended' | 'stopped' | 'navigating';
  message: string;
  time: number;
  duration: number;
  canStart: boolean;
}

interface PageAccess {
  live(): CourseContext | undefined;
  enter(action: HTMLElement): void;
}

export class Playback {
  private media?: HTMLVideoElement;
  private listeners?: AbortController;
  private attempt = 0;
  private mode: PlaybackMode = 'section';
  private active = false;
  private consumed = false;
  private state: PlaybackView['state'] = 'idle';
  private message = '选择播放模式后点击开始。';
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly page: PageAccess, private readonly continuation: Continuation,
    private readonly afterVideo: () => void, private readonly changed: () => void) {}

  get navigating(): boolean { return this.state === 'navigating'; }

  view(context?: CourseContext): PlaybackView {
    const canStart = Boolean(context?.identity && !context.blockedMedia && this.media && !this.media.ended);
    let message = this.message;
    if (this.state === 'idle') {
      if (!context?.identity) message = '课程、章或小节尚未识别，请使用原页面。';
      else if (context.kind === 'practice') message = '当前是章节练习，可切换到练习页签。';
      else if (context.kind === 'pdf') message = '当前是 PDF 阅读，可使用下方的阅读控制。';
      else if (context.blockedMedia && !this.media) message = '播放器不可访问或当前视频不唯一，请使用原播放器。';
      else if (!this.media) message = '等待当前小节的播放器出现。';
      else if (this.media.ended) message = '当前视频已结束。可在原播放器重新播放。';
    }
    return { state: this.state, message, canStart, time: this.media?.currentTime ?? 0, duration: this.media?.duration ?? 0 };
  }

  private set(state: PlaybackView['state'], message: string): void {
    this.state = state;
    this.message = message;
    this.changed();
  }

  sync(context: CourseContext): void {
    const video = context.media;
    if (video !== this.media) {
      const previous = this.media;
      this.listeners?.abort();
      ++this.attempt;
      this.media = video;
      this.consumed = false;
      if (video) this.bind(video);
      if (previous && this.active && this.state === 'playing') this.set('paused', '播放器已更新，点击继续恢复播放。');
    }
    if (!this.active) return;
    if (context.interaction) {
      if (this.state !== 'waiting') {
        ++this.attempt;
        this.set('waiting', '视频要求操作，请在学习通处理后点击继续。');
      }
      return;
    }
    if (context.kind === 'practice' || context.kind === 'pdf' || context.kind === 'other' || (context.blockedMedia && !video)) {
      this.finish('stopped', '当前内容需要手动处理，播放流程已停止。');
      return;
    }
    if (this.state === 'starting' && video && this.timer !== undefined) {
      this.clearTimer();
      this.start(this.mode);
    }
  }

  resumeHandoff(): void {
    this.active = true;
    this.mode = 'chapter';
    this.timer = setTimeout(() => this.finish('stopped', '下一节的播放器未就绪，请手动开始。'), continuationMs);
    this.set('starting', '已进入下一节，等待播放器就绪。');
  }

  start(mode: PlaybackMode): void {
    const context = this.page.live();
    const video = this.media;
    if (!context?.identity || !video || context.media !== video || video.ended || this.navigating) return;
    this.clearTimer();
    this.mode = mode;
    this.active = true;
    this.consumed = false;
    if (context.interaction) {
      this.set('waiting', '请先在学习通完成当前操作。');
      return;
    }
    const attempt = ++this.attempt;
    this.set('starting', '正在启动播放器。');
    if (!video.paused && video.readyState >= 3) {
      this.set('playing', '正在播放。');
      return;
    }
    void video.play().catch((error: unknown) => {
      if (attempt !== this.attempt || !this.isLive(video) || this.state !== 'starting') return;
      if ((error as { name?: string } | undefined)?.name === 'NotAllowedError') {
        this.set('waiting', '浏览器要求用户操作，请点击继续或原播放器的播放按钮。');
      } else {
        this.finish('stopped', '播放器启动失败，请在原播放器检查后重试。');
      }
    });
  }

  pause(): void {
    if (!this.active || !this.media || !this.isLive(this.media)) return;
    ++this.attempt;
    this.media.pause();
    this.set('paused', '已暂停，点击继续可恢复。');
  }

  stop(): void {
    const video = this.media;
    const pause = this.active && video && this.isLive(video);
    this.finish('stopped', '已停止播放任务。');
    if (pause) video.pause();
  }

  private isLive(video: HTMLVideoElement): boolean {
    return video === this.media && video === this.page.live()?.media;
  }

  private bind(video: HTMLVideoElement): void {
    this.listeners = new AbortController();
    const options = { signal: this.listeners.signal };
    video.addEventListener('playing', () => {
      if (this.active && this.isLive(video) && !this.page.live()?.interaction) this.set('playing', '正在播放。');
    }, options);
    video.addEventListener('pause', () => {
      if (!this.active || video.ended || !this.isLive(video)) return;
      ++this.attempt;
      if (this.page.live()?.interaction) this.set('waiting', '请在学习通处理视频内的操作。');
      else if (this.state !== 'waiting') this.set('paused', '播放器已暂停，点击继续可恢复。');
    }, options);
    video.addEventListener('ended', () => this.end(video), options);
    video.addEventListener('error', () => {
      if (this.active && this.isLive(video)) this.finish('stopped', '播放器发生错误，请在原页面检查。');
    }, options);
    for (const event of ['timeupdate', 'durationchange']) video.addEventListener(event, this.changed, options);
  }

  private end(video: HTMLVideoElement): void {
    if (!this.active || this.state !== 'playing' || this.consumed || !video.ended || video.seeking || !this.isLive(video)) return;
    this.consumed = true;
    const context = this.page.live();
    if (!context?.identity) return;
    if (context.interaction) {
      this.set('waiting', '请在学习通处理视频内的操作。');
      return;
    }
    if (this.mode === 'section') {
      this.finish('ended', '本节视频已结束。');
      return;
    }
    this.finish('ended', context.pdf || context.hasPractice
      ? '本节视频已结束。请先处理本节的阅读或练习。' : '本节视频已结束。');
    this.afterVideo();
  }

  enterNext(identity: SectionIdentity, next: SectionEntry, autoplay: boolean): void {
    if (this.navigating) return;
    if (!this.continuation.write(identity, next.target, autoplay ? 'chapter' : 'advance')) {
      this.finish('ended', '浏览器无法保存接续信息，请手动打开下一节。');
      return;
    }
    this.clearTimer();
    this.active = false;
    this.timer = setTimeout(() => this.finish('stopped', '未能确认到达下一节，请从课程目录打开。'), continuationMs);
    this.set('navigating', '正在进入下一节。');
    try { this.page.enter(next.action); } catch {
      this.finish('stopped', '未能打开下一节，请从课程目录打开。');
    }
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private finish(state: PlaybackView['state'], message: string): void {
    this.active = false;
    ++this.attempt;
    this.clearTimer();
    this.continuation.clear();
    this.set(state, message);
  }

  dispose(): void {
    this.active = false;
    ++this.attempt;
    this.clearTimer();
    this.listeners?.abort();
  }
}

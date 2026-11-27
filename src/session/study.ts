import { aiMessage, type AiClient } from '../ai/client';
import { Chat, type ChatView } from '../chat/task';
import { Advance } from '../playback/advance';
import { Continuation } from '../playback/continuation';
import { Reading } from '../playback/reading';
import { Playback, type PlaybackView } from '../playback/task';
import type { Chaoxing } from '../platform/chaoxing/adapter';
import { sameSection, type CourseContext, type Question } from '../platform/chaoxing/types';
import { AutomaticPractice } from '../practice/automatic';
import { Practice, type PracticeView } from '../practice/task';
import type { PlaybackMode, ServiceInput, Settings, SettingsView } from '../settings/store';

export interface StudyView {
  context: CourseContext;
  playback: PlaybackView;
  advance: ReturnType<Advance['view']>;
  reading: ReturnType<Reading['view']>;
  practice: PracticeView;
  autoPractice: ReturnType<AutomaticPractice['view']> & { available: boolean };
  chat: ChatView;
  settings: SettingsView;
  checking: boolean;
  settingsMessage: string;
}

interface Scope {
  version: number;
  context: CourseContext;
  kind: CourseContext['kind'];
  question: Question;
  playback: Playback;
  advance: Advance;
  reading: Reading;
  practice: Practice;
  autoPractice: AutomaticPractice;
  chat: Chat;
  previousMedia?: { element: HTMLVideoElement; source: string };
}

const unavailable: Question = { reason: '当前章节尚未识别，请使用学习通页面。' };

function canAutoPractice(context?: CourseContext): boolean {
  return Boolean(context?.questionAvailable && (context.hasPractice || context.kind === 'practice') && !context.interaction);
}

function mediaSource(video: HTMLVideoElement): string {
  return video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || video.currentSrc;
}

export class StudySession {
  private version = 0;
  private scope?: Scope;
  private unwatch?: () => void;
  private check?: AbortController;
  private settingsMessage = '';
  private readonly continuation: Continuation;

  constructor(window: Window, private readonly page: Chaoxing, private readonly settings: Settings,
    private readonly client: AiClient, private readonly publish: (view?: StudyView) => void) {
    this.continuation = new Continuation(window);
  }

  mount(): void {
    this.watch();
    this.refresh();
  }

  private watch(): void {
    this.unwatch?.();
    this.unwatch = this.page.watch(() => this.refresh(), () => this.manualNavigation());
  }

  private manualNavigation(): void {
    this.continuation.clear();
    this.scope?.practice.invalidate('');
    this.scope?.autoPractice.stop('已停止自动答题。', false);
    this.scope?.chat.clear(false);
    this.scope?.reading.stop('已停止 PDF 阅读。');
    this.scope?.advance.stop();
    const playback = this.scope?.playback;
    if (playback && playback.view(this.scope?.context).state !== 'idle') playback.stop();
  }

  private live(version: number): CourseContext | undefined {
    const scope = this.scope;
    const context = this.page.context();
    if (!scope || scope.version !== version || !context || scope.context.scopeKey !== context.scopeKey
      || (scope.kind !== 'unknown' && context.kind !== 'unknown' && scope.kind !== context.kind)) return undefined;
    return this.currentMedia(context, scope.previousMedia);
  }

  private currentMedia(context: CourseContext, previous?: Scope['previousMedia']): CourseContext {
    if (context.media && previous?.element === context.media && previous.source === mediaSource(context.media)) {
      return { ...context, media: undefined };
    }
    return context;
  }

  private question(version: number): Question {
    const context = this.live(version);
    if (!context?.identity && !context?.questionAvailable) return unavailable;
    return this.page.question();
  }

  private refresh(): void {
    const context = this.page.context();
    const old = this.scope;
    if (!context) {
      if (old) this.continuation.clear();
      this.endScope();
      this.render();
      return;
    }
    if (!old || old.context.scopeKey !== context.scopeKey
      || (old.kind !== 'unknown' && context.kind !== 'unknown' && old.kind !== context.kind)) {
      const previous = old?.context.identity;
      const media = old?.context.media;
      const previousMedia = media && !sameSection(previous, context.identity)
        ? { element: media, source: mediaSource(media) } : undefined;
      const resume = context.identity && (!old || old.playback.navigating || !previous)
        ? this.continuation.take(context.identity, previous) : false;
      if (previous && !resume) this.continuation.clear();
      this.endScope();
      this.page.resetQuestion();
      const version = ++this.version;
      const update = () => { if (this.scope?.version === version) this.render(); };
      const advance: Advance = new Advance(() => this.live(version), (identity, requireVideo) => this.page.next(identity, requireVideo),
        (identity, entry, autoplay) => playback.enterNext(identity, entry, autoplay), update);
      const playback = new Playback({ live: () => this.live(version), enter: (action) => this.page.enter(action) },
        this.continuation, () => advance.arm('video'), update);
      const practice = new Practice(() => this.question(version), (snapshot, ids) => this.page.fill(snapshot, ids),
        () => Boolean(this.live(version)?.screenshotAvailable), this.settings, this.client, update);
      const autoPractice = new AutomaticPractice(() => canAutoPractice(this.live(version)), () => this.page.questionBatch(),
        (root) => this.page.question(root), ({ root, snapshot }, ids) => this.page.fill(snapshot, ids, root),
        this.settings, this.client, update);
      const chat = new Chat(this.settings, this.client, () => Boolean(this.live(version)?.screenshotAvailable), update);
      const reading = new Reading(() => this.live(version), update);
      this.scope = { version, context, kind: context.kind, question: unavailable, playback, advance, reading, practice, autoPractice, chat, previousMedia };
      if (old) this.watch();
      if (resume === 'chapter') playback.resumeHandoff();
      else if (resume === 'advance') advance.arm('section');
    }
    const scope = this.scope;
    if (!scope) return;
    if (scope.kind === 'unknown') scope.kind = context.kind;
    if (scope.context.screenshotAvailable && !context.screenshotAvailable) scope.chat.clear(false);
    scope.context = this.currentMedia(context, scope.previousMedia);
    if (scope.context.media) scope.previousMedia = undefined;
    scope.question = scope.context.identity || scope.context.questionAvailable ? this.page.question() : unavailable;
    scope.playback.sync(scope.context);
    scope.advance.sync(scope.context);
    scope.reading.sync(scope.context);
    scope.practice.sync(scope.question, scope.context.screenshotAvailable);
    if (!canAutoPractice(scope.context)) scope.autoPractice.stop('当前页面不可自动答题。', false);
    this.render();
  }

  private render(): void {
    const scope = this.scope;
    if (!scope) { this.publish(); return; }
    const { playback, advance, reading, practice, autoPractice, chat, context, question } = scope;
    this.publish({ context, playback: playback.view(context), advance: advance.view(), reading: reading.view(context), practice: practice.view(question), chat: chat.view(),
      autoPractice: { ...autoPractice.view(), available: canAutoPractice(context) },
      settings: this.settings.view(), checking: Boolean(this.check), settingsMessage: this.settingsMessage });
  }

  private endScope(): void {
    const scope = this.scope;
    this.scope = undefined;
    scope?.playback.dispose();
    scope?.advance.dispose();
    scope?.reading.dispose();
    scope?.practice.invalidate('', false);
    scope?.autoPractice.stop('', false);
    scope?.chat.clear(false);
    this.check?.abort();
    this.check = undefined;
    this.settingsMessage = '';
  }

  suspend(): void {
    if (!this.scope?.playback.navigating) this.continuation.clear();
    this.endScope();
    this.unwatch?.();
    this.unwatch = undefined;
  }

  setMode(mode: PlaybackMode): void {
    this.settings.setPlaybackMode(mode);
    if (mode === 'section') this.scope?.advance.stop('已取消连续播放接续。', true);
    this.render();
  }
  setCollapsed(value: boolean): void { this.settings.setCollapsed(value); this.render(); }
  start(): void {
    this.scope?.advance.stop('已取消之前的连续播放接续。', true);
    this.scope?.playback.start(this.settings.view().mode);
  }
  pause(): void { this.scope?.playback.pause(); }
  stop(): void { this.scope?.playback.stop(); this.scope?.advance.stop('已取消连续播放接续。', true); }
  toggleAdvance(): void {
    const advance = this.scope?.advance;
    if (advance?.view().armed) advance.stop();
    else advance?.arm('section');
  }
  readPdf(): void { this.scope?.reading.start(); }
  pausePdf(): void { this.scope?.reading.stop(); }
  prepare(screenshot = false): void { if (!this.scope?.autoPractice.view().running) this.scope?.practice.prepare(screenshot); }
  attachScreenshot(file: File): void { if (!this.scope?.autoPractice.view().running) void this.scope?.practice.attachScreenshot(file); }
  send(): void { if (!this.scope?.autoPractice.view().running) void this.scope?.practice.send(); }
  cancel(): void { this.scope?.practice.invalidate('已取消查询。'); }
  fill(): void {
    if (this.scope?.autoPractice.view().running) return;
    this.scope?.practice.fill();
    this.refresh();
  }
  toggleAutoPractice(): void {
    const scope = this.scope;
    if (!scope) return;
    if (scope.autoPractice.view().running) { scope.autoPractice.stop(); return; }
    const manual = scope.practice.view(scope.question);
    if (manual.busy || manual.review) return;
    scope.practice.invalidate('', false);
    void scope.autoPractice.start();
  }
  writeChat(text: string): void { this.scope?.chat.write(text); }
  includeChatQuestion(): void { if (this.scope) this.scope.chat.includeQuestion(this.question(this.scope.version)); }
  attachChatFile(file: File): void { this.scope?.chat.attachFile(file); }
  captureChat(read: (signal: AbortSignal) => Promise<string | undefined>): void { this.scope?.chat.capture(read); }
  removeChatImage(): void { this.scope?.chat.removeImage(); }
  sendChat(): void { void this.scope?.chat.send(); }
  stopChat(): void { this.scope?.chat.stop(); }
  clearChat(): void { this.scope?.chat.clear(); }

  private serviceChanged(message: string): void {
    this.check?.abort();
    this.check = undefined;
    this.scope?.practice.invalidate(message, false);
    this.scope?.autoPractice.stop(message, false);
    this.scope?.chat.clear(false);
  }

  storageChanged(key: string): void {
    if (this.settings.refresh(key)) this.serviceChanged('服务配置已变化，请重新查询。');
    this.render();
  }

  saveService(input: ServiceInput): boolean {
    try {
      this.settings.saveService(input);
      this.serviceChanged('服务配置已更新，可重新查询。');
      this.settingsMessage = '已保存服务设置。';
      this.render();
      return true;
    } catch (error) {
      this.settingsMessage = error instanceof Error && error.message.startsWith('请') ? error.message : '无法保存服务设置，请检查脚本管理器。';
      this.render();
      return false;
    }
  }

  clearKey(): void {
    try {
      this.settings.clearKey();
      this.serviceChanged('服务密钥已清除。');
      this.settingsMessage = '已清除服务密钥。';
    } catch { this.settingsMessage = '无法清除已记住的密钥，请检查脚本管理器。'; }
    this.render();
  }

  async testService(): Promise<void> {
    const config = this.settings.service();
    if (!config || !this.settings.view().hasKey) {
      this.settingsMessage = '请先保存地址、模型和密钥。';
      this.render();
      return;
    }
    this.check?.abort();
    const check = new AbortController();
    this.check = check;
    this.settingsMessage = '正在测试连接。';
    this.render();
    try {
      await this.client.test(config, check.signal);
      if (this.check === check) this.settingsMessage = '连接成功，服务返回了文本。';
    } catch (error) {
      if (this.check === check) this.settingsMessage = aiMessage(error);
    } finally {
      if (this.check === check) {
        this.check = undefined;
        this.render();
      }
    }
  }
}

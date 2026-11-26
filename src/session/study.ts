import { aiMessage, type AiClient } from '../ai/client';
import { Continuation } from '../playback/continuation';
import { Playback, type PlaybackView } from '../playback/task';
import type { Chaoxing } from '../platform/chaoxing/adapter';
import { sameSection, type CourseContext, type Question } from '../platform/chaoxing/types';
import { Practice, type PracticeView } from '../practice/task';
import type { PlaybackMode, ServiceInput, Settings, SettingsView } from '../settings/store';

export interface StudyView {
  context: CourseContext;
  playback: PlaybackView;
  practice: PracticeView;
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
  practice: Practice;
  previousMedia?: { element: HTMLVideoElement; source: string };
}

const unavailable: Question = { reason: '当前章节尚未识别，请使用学习通页面。' };

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
    if (!this.live(version)?.identity) return unavailable;
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
      const playback = new Playback({ live: () => this.live(version), next: (identity) => this.page.next(identity),
        enter: (action) => this.page.enter(action) }, this.continuation, update);
      const practice = new Practice(() => this.question(version), (snapshot, ids) => this.page.fill(snapshot, ids),
        this.settings, this.client, update);
      this.scope = { version, context, kind: context.kind, question: unavailable, playback, practice, previousMedia };
      if (old) this.watch();
      if (resume) playback.resumeHandoff();
    }
    const scope = this.scope;
    if (!scope) return;
    if (scope.kind === 'unknown') scope.kind = context.kind;
    scope.context = this.currentMedia(context, scope.previousMedia);
    if (scope.context.media) scope.previousMedia = undefined;
    scope.question = scope.context.identity ? this.page.question() : unavailable;
    scope.playback.sync(scope.context);
    scope.practice.sync(scope.question);
    this.render();
  }

  private render(): void {
    const scope = this.scope;
    if (!scope) { this.publish(); return; }
    const { playback, practice, context, question } = scope;
    this.publish({ context, playback: playback.view(context), practice: practice.view(question),
      settings: this.settings.view(), checking: Boolean(this.check), settingsMessage: this.settingsMessage });
  }

  private endScope(): void {
    const scope = this.scope;
    this.scope = undefined;
    scope?.playback.dispose();
    scope?.practice.invalidate('', false);
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

  setMode(mode: PlaybackMode): void { this.settings.setPlaybackMode(mode); this.render(); }
  setCollapsed(value: boolean): void { this.settings.setCollapsed(value); this.render(); }
  start(): void { this.scope?.playback.start(this.settings.view().mode); }
  pause(): void { this.scope?.playback.pause(); }
  stop(): void { this.scope?.playback.stop(); }
  prepare(): void { this.scope?.practice.prepare(); }
  send(): void { void this.scope?.practice.send(); }
  cancel(): void { this.scope?.practice.invalidate('已取消查询。'); }
  fill(): void { this.scope?.practice.fill(); this.refresh(); }

  private serviceChanged(message: string): void {
    this.check?.abort();
    this.check = undefined;
    this.scope?.practice.invalidate(message, false);
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

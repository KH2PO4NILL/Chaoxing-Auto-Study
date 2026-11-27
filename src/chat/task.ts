import { AiError, aiMessage } from '../ai/client';
import type { AiClient, ChatMessage } from '../ai/client';
import type { Question } from '../platform/chaoxing/types';
import { readScreenshot } from '../practice/screenshot';
import type { Settings } from '../settings/store';

export const chatTextLimit = 12_000;
const shownMessages = 40;
const contextMessages = 10;

export interface ChatView {
  messages: readonly ChatMessage[];
  draft: string;
  image?: string;
  origin: string;
  canSend: boolean;
  busy: boolean;
  attaching: boolean;
  capturing: boolean;
  status: string;
}

export class Chat {
  private messages: ChatMessage[] = [];
  private draft = '';
  private image?: string;
  private status = '';
  private request?: { controller: AbortController; message: ChatMessage };
  private attachment?: { controller: AbortController; capture: boolean };

  constructor(private readonly settings: Settings, private readonly client: AiClient,
    private readonly canUseImages: () => boolean, private readonly changed: () => void) {}

  view(): ChatView {
    const config = this.settings.service();
    return { messages: this.request ? [...this.messages, this.request.message] : this.messages,
      draft: this.draft, image: this.image, origin: config?.origin ?? '',
      canSend: Boolean(config && this.settings.keyFor(config.origin)),
      busy: Boolean(this.request), attaching: Boolean(this.attachment),
      capturing: Boolean(this.attachment?.capture), status: this.status };
  }

  write(text: string): void {
    this.draft = text.slice(0, chatTextLimit);
    this.changed();
  }

  includeQuestion(question: Question): void {
    if (this.request) return;
    if ('reason' in question) this.status = question.reason;
    else if (question.snapshot.requiresScreenshot || question.snapshot.stem.media.length
      || question.snapshot.options.some((option) => option.media.length)) this.status = '这道题需要看图或原页面，可点击「框选截图」。';
    else {
      const { stem, options } = question.snapshot;
      const content = [stem.text, ...options.map(({ text }, index) => {
        const label = index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
        return `${label}．${text}`;
      })].join('\n');
      const updated = this.draft.trim() ? `${this.draft.trim()}\n\n${content}` : content;
      if (updated.length > chatTextLimit) this.status = '题面和输入内容较长，请缩短输入或使用截图。';
      else { this.draft = updated; this.status = ''; }
    }
    this.changed();
  }

  attachFile(file: File): void { void this.attach(() => readScreenshot(file), false); }
  capture(read: (signal: AbortSignal) => Promise<string | undefined>): void { void this.attach(read, true); }

  private async attach(read: (signal: AbortSignal) => Promise<string | undefined>, capture: boolean): Promise<void> {
    if (this.request || this.attachment || !this.canUseImages()) return;
    const operation = { controller: new AbortController(), capture };
    this.attachment = operation;
    this.status = capture ? '' : '正在读取图片…';
    this.changed();
    try {
      const image = await read(operation.controller.signal);
      if (this.attachment !== operation) return;
      if (image && this.canUseImages()) {
        this.image = image;
        this.status = '';
      } else this.status = '已取消截图。';
    } catch (error) {
      if (this.attachment === operation) this.status = error instanceof Error ? error.message : '截图失败，请重试或粘贴图片。';
    } finally {
      if (this.attachment === operation) {
        this.attachment = undefined;
        this.changed();
      }
    }
  }

  removeImage(): void {
    if (this.request) return;
    this.image = undefined;
    this.changed();
  }

  async send(): Promise<void> {
    if (this.request || this.attachment || (!this.draft.trim() && !this.image)) return;
    const config = this.settings.service();
    if (!config || !this.settings.keyFor(config.origin)) {
      this.status = '请先配置服务地址、模型和密钥。';
      this.changed();
      return;
    }
    if (this.image && !this.canUseImages()) {
      this.status = '当前页面无法发送截图。';
      this.changed();
      return;
    }
    const message: ChatMessage = { role: 'user', text: this.draft.trim() || '请阅读截图并解释这道题。', image: this.image };
    const request = { controller: new AbortController(), message };
    this.request = request;
    this.status = '正在等待模型回复…';
    this.changed();
    try {
      const text = await this.client.chat(config, [...this.messages.slice(-contextMessages), message], request.controller.signal);
      if (this.request !== request) return;
      this.messages = [...this.messages, message, { role: 'assistant' as const, text }].slice(-shownMessages);
      this.draft = '';
      this.image = undefined;
      this.status = '';
    } catch (error) {
      if (this.request !== request) return;
      this.status = aiMessage(error);
      if (message.image && error instanceof AiError && [400, 415, 422].includes(error.status ?? 0)) {
        this.status += ' 请确认模型和接口支持图片输入。';
      }
    } finally {
      if (this.request === request) {
        this.request = undefined;
        this.changed();
      }
    }
  }

  stop(): void {
    const request = this.request;
    if (!request) return;
    this.request = undefined;
    request.controller.abort();
    this.status = '已停止生成，可重新发送。';
    this.changed();
  }

  clear(notify = true): void {
    const { request, attachment } = this;
    this.request = this.attachment = undefined;
    request?.controller.abort();
    attachment?.controller.abort();
    this.messages = [];
    this.draft = '';
    this.image = undefined;
    this.status = '';
    if (notify) this.changed();
  }
}

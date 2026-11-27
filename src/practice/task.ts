import { AiError, aiMessage } from '../ai/client';
import type { AiClient, Suggestion, VisualInput } from '../ai/client';
import { captureQuestionMedia, QuestionMediaError } from '../platform/chaoxing/question-media';
import { sameQuestion, sameSelection } from '../platform/chaoxing/types';
import type { FillResult, Question, QuestionSnapshot } from '../platform/chaoxing/types';
import type { ServiceConfig, Settings } from '../settings/store';
import { readScreenshot } from './screenshot';

interface Query {
  question: QuestionSnapshot;
  config: ServiceConfig;
  screenshot?: string;
}

export interface PracticeView {
  question: Question;
  review?: Query;
  loadingScreenshot: boolean;
  busy: boolean;
  suggestion?: Suggestion;
  canFill: boolean;
  message: string;
  filled?: string[];
}

export class Practice {
  private review?: Query;
  private screenshotAttempt?: object;
  private request?: { query: Query; controller: AbortController };
  private result?: { query: Query; suggestion: Suggestion };
  private message = '';
  private filled?: string[];
  private writing = false;

  constructor(private readonly read: () => Question, private readonly write: (question: QuestionSnapshot, ids: string[]) => FillResult,
    private readonly settings: Settings, private readonly client: AiClient, private readonly changed: () => void) {}

  view(question: Question): PracticeView {
    return { question, review: this.review, loadingScreenshot: Boolean(this.screenshotAttempt),
      busy: Boolean(this.request), suggestion: this.result?.suggestion,
      canFill: Boolean(this.result), message: this.message, filled: this.filled };
  }

  private matches(original: QuestionSnapshot, current: Question): boolean {
    return 'snapshot' in current && sameQuestion(original, current.snapshot) && sameSelection(original.selected, current.snapshot.selected);
  }

  sync(question: Question): void {
    if (this.writing) return;
    const original = (this.review ?? this.request?.query ?? this.result?.query)?.question;
    if (original && !this.matches(original, question)) this.invalidate('题目、选项或当前选择已变化，请重新查询。');
  }

  prepare(): void {
    this.invalidate('');
    const question = this.read();
    const config = this.settings.service();
    if (!('snapshot' in question)) this.message = question.reason;
    else if (!config || !this.settings.view().hasKey) this.message = '请先在设置中保存服务地址、模型和密钥。';
    else this.review = { question: question.snapshot, config };
    this.changed();
  }

  async attachScreenshot(file: File): Promise<void> {
    const review = this.review;
    if (!review?.question.requiresScreenshot) return;
    const attempt = {};
    this.screenshotAttempt = attempt;
    review.screenshot = undefined;
    this.message = '';
    this.changed();
    try {
      const screenshot = await readScreenshot(file);
      if (this.screenshotAttempt !== attempt) return;
      if (!this.matches(review.question, this.read())) {
        this.invalidate('题目、选项或当前选择已变化，请重新查询。');
        return;
      }
      review.screenshot = screenshot;
    } catch (error) {
      if (this.screenshotAttempt === attempt) this.message = error instanceof Error ? error.message : '无法读取截图。';
    } finally {
      if (this.screenshotAttempt === attempt) {
        this.screenshotAttempt = undefined;
        this.changed();
      }
    }
  }

  async send(): Promise<void> {
    const query = this.review;
    if (!query || (query.question.requiresScreenshot && !query.screenshot)) return;
    this.review = undefined;
    if (!this.matches(query.question, this.read())) {
      this.invalidate('题目、选项或当前选择已变化，请重新查询。');
      return;
    }
    const active = { query, controller: new AbortController() };
    this.request = active;
    const groups = [{ ...query.question.stem, id: '题干' }, ...query.question.options];
    const attachments = groups.flatMap(({ id, media }) => media.map((item, index) => ({
      item, location: `${id} · 附件 ${index + 1}`,
    })));
    this.message = attachments.length ? '正在读取题目图片和视频画面。' : '正在查询模型。';
    this.changed();
    try {
      const signal = active.controller.signal;
      const visuals: VisualInput[] = [];
      if (query.screenshot) {
        visuals.push({ location: '用户提供的本题截图', data: query.screenshot });
        query.screenshot = undefined;
      }
      if (attachments.length) {
        const frames = await Promise.all(attachments.map(async ({ item, location }) =>
          (await captureQuestionMedia(item, signal)).map((frame) => ({ ...frame, location }))));
        if (this.request !== active) return;
        if (!this.matches(query.question, this.read())) {
          this.invalidate('题目、选项或当前选择已变化，请重新查询。');
          return;
        }
        visuals.push(...frames.flat());
        this.message = '正在查询模型。';
        this.changed();
      }
      const suggestion = await this.client.query(query.config, query.question, visuals, signal);
      if (this.request !== active) return;
      if (!this.matches(query.question, this.read())) {
        this.invalidate('题目、选项或当前选择已变化，请重新查询。');
        return;
      }
      this.result = { query, suggestion };
      this.message = '模型建议已返回，请核对后决定是否填入。';
    } catch (error) {
      if (this.request === active) {
        this.message = error instanceof QuestionMediaError ? error.message : aiMessage(error);
        if ((attachments.length || query.question.requiresScreenshot)
          && error instanceof AiError && [400, 415, 422].includes(error.status ?? 0)) {
          this.message += ' 请确认模型和接口支持 Chat Completions 图片输入。';
        }
      }
    } finally {
      if (this.request === active) {
        active.controller.abort();
        this.request = undefined;
        this.changed();
      }
    }
  }

  fill(): void {
    const result = this.result;
    if (!result) return;
    this.result = undefined;
    if (!this.matches(result.query.question, this.read())) {
      this.invalidate('题目、选项或当前选择已变化，请重新查询。');
      return;
    }
    this.writing = true;
    try {
      const response = this.write(result.query.question, result.suggestion.optionIds);
      this.message = response.message;
      this.filled = response.selected;
    } finally { this.writing = false; }
    this.changed();
  }

  invalidate(message: string, notify = true): void {
    const request = this.request;
    this.request = this.review = this.result = undefined;
    this.screenshotAttempt = undefined;
    this.filled = undefined;
    this.message = message;
    request?.controller.abort();
    if (notify) this.changed();
  }
}

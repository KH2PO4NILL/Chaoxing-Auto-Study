import { aiMessage } from '../ai/client';
import type { AiClient, Suggestion } from '../ai/client';
import { sameQuestion, sameSelection } from '../platform/chaoxing/types';
import type { FillResult, Question, QuestionSnapshot } from '../platform/chaoxing/types';
import type { ServiceConfig, Settings } from '../settings/store';

interface Query {
  question: QuestionSnapshot;
  config: ServiceConfig;
}

export interface PracticeView {
  question: Question;
  review?: Query;
  busy: boolean;
  suggestion?: Suggestion;
  canFill: boolean;
  message: string;
  filled?: string[];
}

export class Practice {
  private review?: Query;
  private request?: { query: Query; controller: AbortController };
  private result?: { query: Query; suggestion: Suggestion };
  private message = '';
  private filled?: string[];
  private writing = false;

  constructor(private readonly read: () => Question, private readonly write: (question: QuestionSnapshot, ids: string[]) => FillResult,
    private readonly settings: Settings, private readonly client: AiClient, private readonly changed: () => void) {}

  view(question: Question): PracticeView {
    return { question, review: this.review, busy: Boolean(this.request), suggestion: this.result?.suggestion,
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

  async send(): Promise<void> {
    const query = this.review;
    if (!query) return;
    this.review = undefined;
    if (!this.matches(query.question, this.read())) {
      this.invalidate('题目、选项或当前选择已变化，请重新查询。');
      return;
    }
    const active = { query, controller: new AbortController() };
    this.request = active;
    this.message = '正在查询模型。';
    this.changed();
    try {
      const suggestion = await this.client.query(query.config, query.question, active.controller.signal);
      if (this.request !== active) return;
      if (!this.matches(query.question, this.read())) {
        this.invalidate('题目、选项或当前选择已变化，请重新查询。');
        return;
      }
      this.result = { query, suggestion };
      this.message = '模型建议已返回，请核对后决定是否填入。';
    } catch (error) {
      if (this.request === active) this.message = aiMessage(error);
    } finally {
      if (this.request === active) {
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
    this.filled = undefined;
    this.message = message;
    request?.controller.abort();
    if (notify) this.changed();
  }
}

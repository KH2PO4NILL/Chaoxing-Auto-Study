import { aiMessage } from '../ai/client';
import type { AiClient } from '../ai/client';
import { QuestionMediaError } from '../platform/chaoxing/question-media';
import { sameQuestion, sameSelection } from '../platform/chaoxing/types';
import type { FillResult, Question, QuestionTarget } from '../platform/chaoxing/types';
import type { Settings } from '../settings/store';
import { captureVisuals, questionAttachments } from './visuals';

export class AutomaticPractice {
  private run?: AbortController;
  private message = '';

  constructor(private readonly enabled: () => boolean,
    private readonly batch: () => { targets: QuestionTarget[]; skipped: number },
    private readonly read: (root: Element) => Question,
    private readonly write: (target: QuestionTarget, ids: string[]) => FillResult,
    private readonly settings: Settings, private readonly client: AiClient, private readonly changed: () => void) {}

  view() { return { running: Boolean(this.run), message: this.message }; }

  private matches(target: QuestionTarget): boolean {
    const current = this.read(target.root);
    return 'snapshot' in current && sameQuestion(target.snapshot, current.snapshot)
      && sameSelection(target.snapshot.selected, current.snapshot.selected);
  }

  async start(): Promise<void> {
    if (this.run || !this.enabled()) return;
    const config = this.settings.service();
    if (!config || !this.settings.keyFor(config.origin)) {
      this.message = '请先在设置中保存服务地址、模型和密钥。';
      this.changed();
      return;
    }
    const { targets, skipped: unavailable } = this.batch();
    if (!targets.length) {
      this.message = '当前页面没有可自动填入的未答题。请检查已选项、题型或截图需求。';
      this.changed();
      return;
    }
    const run = new AbortController();
    this.run = run;
    let filled = 0;
    let skipped = unavailable;
    try {
      for (const [index, target] of targets.entries()) {
        if (this.run !== run || !this.enabled()) return;
        if (!this.matches(target)) { skipped++; continue; }
        this.message = `正在处理第 ${index + 1} / ${targets.length} 道题，已填入 ${filled} 道。`;
        this.changed();
        const visuals = await captureVisuals(questionAttachments(target.snapshot), run.signal);
        if (this.run !== run || !this.enabled()) return;
        if (!this.matches(target)) { skipped++; continue; }
        const suggestion = await this.client.query(config, target.snapshot, visuals, run.signal);
        if (this.run !== run || !this.enabled()) return;
        if (!this.matches(target)) { skipped++; continue; }
        const result = this.write(target, suggestion.optionIds);
        if (!result.selected || !sameSelection(result.selected, suggestion.optionIds)) {
          this.message = `已填入 ${filled} 道。当前题未能完整写入，请检查页面选项。`;
          return;
        }
        filled++;
      }
      this.message = `已填入 ${filled} 道，跳过 ${skipped} 道。请在学习通核对并提交。`;
    } catch (error) {
      if (this.run === run) this.message = `已填入 ${filled} 道。自动答题已停止。 ${error instanceof QuestionMediaError ? error.message : aiMessage(error)}`;
    } finally {
      if (this.run === run) {
        if (!this.enabled()) this.message = '当前页面不可自动答题。';
        run.abort();
        this.run = undefined;
        this.changed();
      }
    }
  }

  stop(message = '已停止自动答题。', notify = true): void {
    const run = this.run;
    if (!run) return;
    this.run = undefined;
    run.abort();
    this.message = message;
    if (notify) this.changed();
  }
}

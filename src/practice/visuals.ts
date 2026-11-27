import type { VisualInput } from '../ai/client';
import { captureQuestionMedia } from '../platform/chaoxing/question-media';
import type { QuestionSnapshot } from '../platform/chaoxing/types';

export function questionAttachments(question: QuestionSnapshot) {
  const groups = [{ ...question.stem, id: '题干' }, ...question.options];
  return groups.flatMap(({ id, media }) => media.map((item, index) => ({
    item, location: `${id} · 附件 ${index + 1}`,
  })));
}

export async function captureVisuals(attachments: ReturnType<typeof questionAttachments>, signal: AbortSignal): Promise<VisualInput[]> {
  const frames = await Promise.all(attachments.map(async ({ item, location }) =>
    (await captureQuestionMedia(item, signal)).map((frame) => ({ ...frame, location }))));
  return frames.flat();
}

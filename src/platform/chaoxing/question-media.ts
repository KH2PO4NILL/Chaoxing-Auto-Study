import type { QuestionMedia } from './types';

export class QuestionMediaError extends Error {
  constructor(kind: QuestionMedia['kind']) {
    super(kind === 'image'
      ? '无法读取题目图片。请确认图片已加载，或在学习通手动处理。'
      : '无法提取题目视频的画面。请确认视频可播放，或在学习通手动处理。');
  }
}

function waitFor(element: HTMLMediaElement, event: string, ready: () => boolean, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (ready()) return Promise.resolve();
  if (element.error) return Promise.reject(element.error);
  return new Promise((resolve, reject) => {
    const listeners = new AbortController();
    const clear = () => {
      listeners.abort();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { clear(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    element.addEventListener('error', () => { clear(); reject(element.error); }, { signal: listeners.signal });
    element.addEventListener(event, () => {
      if (ready()) { clear(); resolve(); }
    }, { signal: listeners.signal });
  });
}

function imageData(element: HTMLImageElement | HTMLVideoElement, width: number, height: number): string {
  if (!width || !height) throw new Error('empty frame');
  const canvas = element.ownerDocument.createElement('canvas');
  const scale = Math.min(1, 1280 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(element, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', 0.83);
  if (data.length > 1_000_000 || !data.startsWith('data:image/jpeg;base64,')) throw new Error('invalid frame');
  return data;
}

function readImage(source: string, original: HTMLImageElement, signal: AbortSignal): Promise<string> {
  if (original.complete && original.naturalWidth && original.currentSrc === source) {
    try { return Promise.resolve(imageData(original, original.naturalWidth, original.naturalHeight)); }
    catch { /* An image loaded without CORS can still allow an anonymous retry. */ }
  }
  const image = original.ownerDocument.createElement('img');
  image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';
  return new Promise((resolve, reject) => {
    const clear = () => {
      image.onload = image.onerror = null;
      signal.removeEventListener('abort', abort);
      image.removeAttribute('src');
    };
    const abort = () => { clear(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    image.onload = () => {
      try { resolve(imageData(image, image.naturalWidth, image.naturalHeight)); }
      catch (error) { reject(error); }
      finally { clear(); }
    };
    image.onerror = () => { clear(); reject(new Error('image load failed')); };
    image.src = source;
  });
}

async function videoFrames(source: string, document: Document, signal: AbortSignal): Promise<{ data: string; time: number }[]> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.src = source;
  try {
    await waitFor(video, 'loadeddata', () => video.readyState >= 2, signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error('invalid video');
    const frames: { data: string; time: number }[] = [];
    for (const fraction of [0.1, 0.5, 0.9]) {
      signal.throwIfAborted();
      video.currentTime = video.duration * fraction;
      await waitFor(video, 'seeked', () => !video.seeking && video.readyState >= 2, signal);
      frames.push({ time: video.currentTime, data: imageData(video, video.videoWidth, video.videoHeight) });
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

export async function captureQuestionMedia(item: QuestionMedia, signal: AbortSignal): Promise<{ data: string; time?: number }[]> {
  signal.throwIfAborted();
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
  try {
    if (item.kind === 'image') return [{ data: await readImage(item.source, item.element, bounded) }];
    return await videoFrames(item.source, item.element.ownerDocument, bounded);
  } catch {
    signal.throwIfAborted();
    throw new QuestionMediaError(item.kind);
  }
}

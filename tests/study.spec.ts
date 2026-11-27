import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Request, type Route } from '@playwright/test';

const asset = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const courseHtml = asset('./fixtures/course.html');
const practiceHtml = asset('./fixtures/practice.html');
const questionVideo = readFileSync(new URL('./fixtures/question.webm', import.meta.url));
const bundle = asset('../dist/chaoxing-auto-study.user.js');
const course = (section = '11', variant = '') => `https://mooc1.chaoxing.com/mycourse/studentstudy?courseId=42&chapterId=${section}${variant ? `&fixture=${variant}` : ''}`;
const ai = 'https://model.example/v1';
const alpha = 'test-key-alpha';
const settingsKey = 'gm:study.settings';
const credentialKey = 'gm:study.credential';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

test.beforeEach(async ({ page }) => {
  await page.route('https://mooc1.chaoxing.com/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/studentstudy')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: courseHtml });
    if (path.endsWith('/knowledge/cards')) return route.fulfill({ contentType: 'text/html', body: url.searchParams.has('fixture')
      ? '<iframe src="/mooc2/work/dowork" title="标准题面"></iframe>' : '<iframe src="/mooc-ans/work/doHomeWorkNew" title="题目"></iframe>' });
    if (path.endsWith('/work/dowork')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html>
      <fieldset id="modern-question">
        <legend>双绞线互相绞合的作用是什么？</legend>
        <div><input type="radio" id="option-a" name="choice" value="A" hidden><label for="option-a">降低信号干扰</label></div>
        <div><input type="radio" id="option-b" name="choice" value="B"><label for="option-b">提高传输速度</label></div>
      </fieldset>` });
    if (path.endsWith('/work/doHomeWorkNew')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: practiceHtml });
    if (path.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${path.includes('reference') ? 'blue' : 'red'}"/></svg>` });
    if (path === '/question.webm') {
      const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
      if (!range) return route.fulfill({ contentType: 'video/webm', headers: { 'Accept-Ranges': 'bytes' }, body: questionVideo });
      const start = Number(range[1]);
      const end = range[2] ? Math.min(questionVideo.length - 1, Number(range[2])) : questionVideo.length - 1;
      return route.fulfill({ status: 206, contentType: 'video/webm',
        headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${questionVideo.length}` },
        body: questionVideo.subarray(start, end + 1) });
    }
    if (path.endsWith('/pdf/index.html')) return route.fulfill({ contentType: 'text/html', body:
      '<div id="docContainer"><div id="img"><iframe id="panView" src="https://pan-yz.chaoxing.com/screen/v2/file_demo" style="height:100px"></iframe></div></div>' });
    if (path.endsWith('/video/index.html')) return route.fulfill({ contentType: 'text/html', body:
      new URL(route.request().url()).searchParams.has('question')
        ? '<video src="/question.webm" controls preload="metadata"></video>' : '<video controls></video>' });
    return route.fulfill({ contentType: 'text/html', body: '<p>普通页面</p>' });
  });
  await page.route('https://pan-yz.chaoxing.com/screen/v2/file_*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <style>body,ul{margin:0;padding:0}img{height:90px;display:block}li{list-style:none;height:100px;position:relative}span{position:absolute;inset:0 auto auto 0}</style>
    <div class="fileBox"><ul>${[1, 2, 3].map((n) =>
      `<li id="anchor${n}"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3C/svg%3E"><span>${n}</span></li>`).join('')}</ul></div>` }));
  await page.route('https://other.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>其他网站</p>' }));
  await page.addInitScript({ content: `
    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      return attachShadow.call(this, this.id === 'chaoxing-auto-study-host' ? { ...options, mode: 'open' } : options);
    };
    window.GM_getValue = (key) => JSON.parse(localStorage.getItem('gm:' + key) || 'null') ?? undefined;
    window.GM_setValue = (key, value) => localStorage.setItem('gm:' + key, JSON.stringify(value));
    window.GM_deleteValue = (key) => localStorage.removeItem('gm:' + key);
    window.GM_addValueChangeListener = (key, fn) => {
      const listener = (event) => { if (event.key === 'gm:' + key) fn(key, undefined, undefined, true); };
      window.addEventListener('storage', listener);
      return listener;
    };
    window.GM_removeValueChangeListener = (listener) => window.removeEventListener('storage', listener);
    document.addEventListener('DOMContentLoaded', () => { ${bundle}\n });
  ` });
});

async function openPanel(page: Page) {
  const toggle = page.locator('#toggle');
  await expect(toggle).toBeAttached();
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await expect(page.getByRole('complementary', { name: '学习助手' })).toBeVisible();
}

async function openPlayback(page: Page) {
  await openPanel(page);
  await page.getByRole('tab', { name: '播放', exact: true }).click();
}

async function start(page: Page, chapter = false) {
  await openPlayback(page);
  if (chapter) await page.getByLabel('播放模式').selectOption('chapter');
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await expect(page.locator('#toggle')).toContainText('播放中');
}

const video = (page: Page) => page.locator('#content video');
const frame = (page: Page) => page.frameLocator('#iframe').frameLocator('iframe');
const finish = (page: Page) => video(page).evaluate((element) => (element as HTMLVideoElement & { finish(): void }).finish());
const entries = (page: Page) => page.evaluate(() => sessionStorage.getItem('entries'));

async function service(page: Page, { origin = ai, key = alpha, remember = false } = {}) {
  await openPanel(page);
  await page.getByRole('tab', { name: '设置' }).click();
  await page.getByLabel('HTTPS API 基础地址').fill(origin);
  await page.getByLabel('模型名称').fill('mock-model');
  await page.getByLabel('服务密钥', { exact: true }).fill(key);
  await page.getByLabel('记住密钥').setChecked(remember);
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.locator('#settings-status')).toContainText('已保存');
}

async function mockAi(page: Page, respond: (route: Route, request: Request) => Promise<void>, hostname = 'model.example') {
  await page.route(`https://${hostname}/v1/chat/completions`, (route, request) => request.method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors }) : respond(route, request));
}

function model(route: Route, ids: string[], explanation = '示例解析') {
  return route.fulfill({ headers: cors, json: { choices: [{ message: { content: JSON.stringify({ optionIds: ids, explanation }) } }] } });
}

async function review(page: Page, id: string) {
  await page.getByRole('tab', { name: '练习' }).click();
  await frame(page).locator(`#${id} h3`).click();
  await page.getByRole('button', { name: /^(查询答案|重新查询)$/ }).click();
  await expect(page.getByRole('heading', { name: '确认发送给模型' })).toBeVisible();
}

async function query(page: Page, id: string) {
  await review(page, id);
  await page.getByRole('button', { name: '确认查询' }).click();
}

test('A1 · the bundle mounts once on the study page and leaves other pages alone', async ({ page }) => {
  await page.goto(course());
  await expect(page.locator('#toggle')).toContainText('待命');
  await page.addScriptTag({ content: bundle });
  await expect(page.locator('#chaoxing-auto-study-host')).toHaveCount(1);
  await start(page);
  await expect(page.getByLabel('播放模式')).toHaveValue('section');
  await finish(page);
  await expect(page.locator('#play-status')).toContainText('本节视频已结束');
  await expect(page.locator('#progress')).toContainText('有待完成任务');
  await page.reload();
  await expect(page.locator('#toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#toggle')).toContainText('待命');
  for (const prefix of ['/mooc-ans', '/mooc2-ans']) {
    await page.goto(course().replace('/mycourse', `${prefix}/mycourse`));
    await expect(page.locator('#chaoxing-auto-study-host')).toHaveCount(1);
  }
  for (const url of ['https://other.example/', 'https://mooc1.chaoxing.com/mooc-ans/exam/test', 'https://mooc1.chaoxing.com/mycourse/studentstudy-example']) {
    await page.goto(url);
    await expect(page.locator('#chaoxing-auto-study-host')).toHaveCount(0);
  }
});

test('A1 · the right sidebar keeps its navigation accessible when the viewport shrinks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(course('21'));
  const toggle = page.locator('#toggle');
  const sidebar = page.getByRole('complementary', { name: '学习助手' });
  await expect(toggle).toBeVisible();
  await expect(sidebar).toBeHidden();
  await toggle.press('Enter');
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole('tab', { name: 'AI 聊天' })).toBeFocused();
  const desktop = (await sidebar.boundingBox())!;
  expect(desktop.y).toBe(0);
  expect(desktop.height).toBe(720);
  expect(desktop.x + desktop.width).toBe(1280);
  await page.getByRole('tab', { name: 'AI 聊天' }).press('ArrowRight');
  await page.getByRole('tab', { name: '播放' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: '练习' })).toBeFocused();
  await page.getByRole('tab', { name: '练习' }).press('Escape');
  await expect(sidebar).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await expect(page.getByRole('tab', { name: '练习' })).toBeFocused();
  await page.getByRole('tab', { name: '练习' }).press('ArrowRight');
  await page.setViewportSize({ width: 350, height: 320 });
  const compact = (await sidebar.boundingBox())!;
  expect(compact.height).toBe(320);
  expect(compact.x).toBeGreaterThanOrEqual(0);
  expect(compact.x + compact.width).toBe(350);
  await page.getByRole('button', { name: '清除密钥' }).scrollIntoViewIfNeeded();
  expect(await page.locator('#sidebar-content').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '收起学习助手' }).click();
  await expect(toggle).toBeVisible();
  await page.reload();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

for (const variant of ['', 'spa']) {
  test(`A2 · ${variant || 'full-page'} handoff consumes one natural end and stops at the chapter boundary`, async ({ page }) => {
    if (variant) await page.clock.install();
    await page.goto(course('11', variant));
    if (variant) await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await start(page, true);
    await video(page).evaluate((element) => {
      const video = element as HTMLVideoElement & { finish(): void };
      video.dispatchEvent(new Event('ended'));
      video.finish();
      video.finish();
    });
    await expect(page.locator('#advance-status')).toContainText('等待学习通确认');
    if (variant) await page.clock.runFor(12_000);
    expect(await entries(page)).toBe(null);
    await page.locator('#cur11 .jobUnfinishCount').evaluate((marker) => { marker.className = 'icon_Completed'; });
    if (variant) await page.clock.runFor(500);
    await expect(page.locator('#advance-status')).toContainText('10 秒');
    if (variant) {
      await page.clock.runFor(9_000);
      await expect(page).toHaveURL(/chapterId=11/);
      await page.clock.runFor(1_000);
    }
    await expect(page).toHaveURL(/chapterId=12/, { timeout: 12_000 });
    await expect(page.locator('#toggle')).toContainText('播放中');
    expect(await entries(page)).toBe('1');
    await finish(page);
    await expect(page.locator('#advance-status')).toContainText('已到本章末尾');
    await expect(page.locator('#progress')).toContainText('已完成');
    expect(await entries(page)).toBe('1');
  });
}

test('A3 · delayed mount, native pause, replacement, stop and manual navigation', async ({ page }) => {
  await page.goto(course('11', 'delayed'));
  await openPlayback(page);
  await expect(page.locator('#start')).toBeDisabled();
  await page.evaluate(() => (window as Window & { addVideo(): void }).addVideo());
  await start(page, true);
  await video(page).evaluate((element) => (element as HTMLVideoElement).pause());
  await expect(page.locator('#toggle')).toContainText('已暂停');
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('#toggle')).toContainText('播放中');
  await page.evaluate(() => {
    const old = document.querySelector('video') as HTMLVideoElement & { finish(): void };
    (window as Window & { addVideo(): void }).addVideo();
    old.finish();
  });
  await expect(page.locator('#play-status')).toContainText('播放器已更新');
  await page.getByRole('button', { name: '继续' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await finish(page);
  expect(await entries(page)).toBe(null);
  await page.getByRole('link', { name: '随堂练习' }).click();
  await expect(page.locator('#toggle')).toContainText('待命');
  await expect(page.locator('#play-status')).toContainText('章节练习');
});

test('A3 · interaction, autoplay rejection and inaccessible frames show the next action', async ({ page }) => {
  await page.goto(course('11', 'blocked'));
  await openPlayback(page);
  await page.locator('#start').click();
  await expect(page.locator('#play-status')).toContainText('浏览器要求用户操作');
  await page.evaluate(() => { (window as Window & { allowPlayback?: boolean }).allowPlayback = true; });
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('#toggle')).toContainText('播放中');
  await page.evaluate(() => {
    const dialog = document.createElement('div');
    dialog.dataset.videoInteraction = '';
    dialog.textContent = '视频内互动';
    document.body.prepend(dialog);
  });
  await expect(page.locator('#toggle')).toContainText('等待操作');
  await page.locator('[data-video-interaction]').evaluate((element) => element.remove());
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('#toggle')).toContainText('播放中');
  await page.goto(course('11', 'cross-frame'));
  await openPlayback(page);
  await expect(page.locator('#play-status')).toContainText('请使用原播放器');
  await expect(page.locator('#start')).toBeDisabled();
  await page.goto(course('11', 'frame-video'));
  await openPlayback(page);
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#chaoxing-auto-study-host')).toHaveCount(1);
});

for (const [variant, reason] of [['locked-next', '已锁定'], ['practice-next', '下一项是练习'], ['unknown-next', '未明确标记'], ['pdf-next', '下一项是 PDF 阅读']]) {
  test(`A3 · ${variant} stops in place`, async ({ page }) => {
    await page.goto(course('11', variant));
    await start(page, true);
    await finish(page);
    await expect(page.locator('#advance-status')).toContainText(reason!);
    expect(await entries(page)).toBe(null);
  });
}

test('A3 · refresh ignores a matching handoff and clears it', async ({ page }) => {
  await page.goto(course('12'));
  await page.evaluate(() => {
    const base = { courseId: '42', chapterId: '10' };
    sessionStorage.setItem('chaoxing-auto-study.next', JSON.stringify({ from: { ...base, sectionId: '11' },
      target: { ...base, sectionId: '12' }, mode: 'chapter', expiresAt: Date.now() + 10_000 }));
    // Seed the reload before the pagehide handler to simulate navigation interrupted by refresh.
    window.addEventListener('pagehide', () => sessionStorage.setItem('chaoxing-auto-study.next', JSON.stringify({
      from: { ...base, sectionId: '11' }, target: { ...base, sectionId: '12' }, mode: 'chapter', expiresAt: Date.now() + 10_000,
    })), { once: true });
  });
  await page.reload();
  await expect(page.locator('#toggle')).toContainText('待命');
  expect(await page.evaluate(() => sessionStorage.getItem('chaoxing-auto-study.next'))).toBeNull();
});

test('A10 · explicit next-section mode waits for all tasks, cancels a countdown, and can enter a practice section', async ({ page }) => {
  await page.clock.install();
  await page.goto(course('11', 'spa-practice-next'));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await openPlayback(page);
  await page.locator('#cur11').evaluate((row) => {
    row.setAttribute('data-progress', '已完成');
    const counter = document.createElement('input');
    counter.type = 'hidden';
    counter.className = 'jobUnfinishCount';
    counter.value = '1';
    row.querySelector('.jobUnfinishCount')!.replaceWith(counter);
  });
  await page.getByRole('button', { name: '本节完成后跳转' }).click();
  await expect(page.locator('#advance-status')).toContainText('等待学习通确认');
  await page.clock.runFor(12_000);
  expect(await entries(page)).toBe(null);
  await page.locator('#cur11 .jobUnfinishCount').evaluate((counter: HTMLInputElement) => {
    counter.parentElement!.removeAttribute('data-progress');
    counter.value = '0';
  });
  await page.clock.runFor(500);
  await expect(page.locator('#advance-status')).toContainText('10 秒');
  await page.getByRole('button', { name: '取消自动跳转' }).click();
  await page.clock.runFor(12_000);
  expect(await entries(page)).toBe(null);
  await page.getByRole('button', { name: '本节完成后跳转' }).click();
  await page.clock.runFor(9_999);
  await expect(page).toHaveURL(/chapterId=11/);
  await page.clock.runFor(1);
  await expect(page).toHaveURL(/chapterId=12/);
  await page.clock.runFor(100);
  await expect(page.locator('#toggle')).toContainText('待命');
  await expect(page.locator('#advance-status')).toContainText('已到本章末尾');
});

test('A4 · preview, answer, fill, and edit all three supported question types', async ({ page }) => {
  const outgoing: { payload: unknown; headers: Record<string, string> }[] = [];
  await mockAi(page, async (route, request) => {
    const payload = request.postDataJSON();
    outgoing.push({ payload, headers: await request.allHeaders() });
    const question = JSON.parse(payload.messages[1].content);
    await model(route, question.type === 'multiple' ? ['opt3', 'opt1'] : ['opt2'], '<img src=x> 纯文本');
  });
  await page.goto(course('21'));
  await service(page);
  await review(page, 'q1');
  await expect(page.locator('#destination')).toHaveText('https://model.example');
  await expect(page.locator('#send-options li')).toHaveText(['9', '7']);
  expect(outgoing).toHaveLength(0);
  await page.getByRole('button', { name: '确认查询' }).click();
  for (const [id, selected, editable] of [['q1', ['B'], 'A'], ['q2', ['A', 'C'], 'B'], ['q3', ['true'], 'false']] as const) {
    if (id !== 'q1') await query(page, id);
    await expect(page.locator('#explanation')).toHaveText('<img src=x> 纯文本');
    await expect(page.locator('#explanation img')).toHaveCount(0);
    const inputs = frame(page).locator(`#${id} input:is([type=radio],[type=checkbox])`);
    const selectedValues = () => inputs.evaluateAll((elements) => elements.filter((e) => (e as HTMLInputElement).checked).map((e) => (e as HTMLInputElement).value));
    expect(await selectedValues()).toEqual([]);
    await page.getByRole('button', { name: '填入本题' }).click();
    await expect.poll(selectedValues).toEqual([...selected]);
    await frame(page).locator(`#${id} input[value="${editable}"]`).check();
    expect(await selectedValues()).toContain(editable);
    await expect(frame(page).locator('#submitted')).toHaveText('未提交');
  }
  expect(outgoing).toHaveLength(3);
  expect(outgoing[0]?.payload).toMatchObject({ model: 'mock-model', stream: false });
  expect(outgoing[0]?.headers).toMatchObject({ authorization: `Bearer ${alpha}` });
  expect(outgoing[0]?.headers).not.toHaveProperty('cookie');
  expect(outgoing[0]?.headers).not.toHaveProperty('referer');
  const { options, stem, type } = JSON.parse((outgoing[0]?.payload as { messages: { content: string }[] }).messages[1]!.content);
  expect({ options, stem, type }).toEqual({ type: 'single', stem: '哪一个是质数？', options: [{ id: 'opt1', text: '9' }, { id: 'opt2', text: '7' }] });
  await frame(page).locator('#q4 h3').click();
  await expect(page.locator('#stem')).toContainText('包含图片');
  await expect(page.locator('#query')).toBeDisabled();
  await frame(page).getByRole('button', { name: '提交' }).click();
  await expect(frame(page).locator('#submitted')).toHaveText('已提交');
});

test('A5 · incomplete rows and exam frames cannot be queried', async ({ page }) => {
  await page.goto(course('21'));
  await openPanel(page);
  await page.getByRole('tab', { name: '练习' }).click();
  await frame(page).locator('#q1 h3').click();
  await frame(page).locator('#q1 input[value=B]').evaluate((input) => input.remove());
  await expect(page.locator('#stem')).toContainText('选项内容或控件不完整');
  await expect(page.locator('#query')).toBeDisabled();
  await frame(page).locator('#exercise').evaluate((form) => form.setAttribute('data-assessment', 'exam'));
  await expect(page.locator('#stem')).toContainText('请在章节练习中点击');
  await expect(page.locator('#query')).toBeDisabled();
  await expect(page.getByRole('button', { name: '截图查询' })).toBeHidden();
});

test('A4 · images in the stem and image-only options are sent only after confirmation and map back to the correct option', async ({ page }) => {
  const sent: { type: string; text?: string; image_url?: { url: string } }[][] = [];
  await mockAi(page, async (route, request) => {
    sent.push(request.postDataJSON().messages[1].content);
    await model(route, ['opt2']);
  });
  await page.goto(course('21'));
  await service(page);
  await review(page, 'q5');
  await expect(page.locator('#send-stem')).toContainText('1 张图片');
  await expect(page.locator('#send-options li')).toHaveText(['［1 张图片］', '［1 张图片］']);
  expect(sent).toHaveLength(0);
  await page.getByRole('button', { name: '确认查询' }).click();
  await expect(page.locator('#suggested-options li')).toHaveText('第 2 项 ［1 张图片］');
  expect(sent[0]?.filter((part) => part.image_url)).toHaveLength(3);
  expect(sent[0]?.filter((part) => part.image_url).every((part) => part.image_url?.url.startsWith('data:image/jpeg;base64,'))).toBe(true);
  expect(sent[0]?.filter((part) => part.type === 'text').slice(1).map((part) => part.text)).toEqual([
    '题干 · 附件 1', 'opt1 · 附件 1', 'opt2 · 附件 1',
  ]);
  expect(JSON.stringify(sent)).not.toContain('chaoxing.com');
  await page.getByRole('button', { name: '填入本题' }).click();
  await expect(frame(page).locator('#q5 input[value=B]')).toBeChecked();
  await expect(frame(page).locator('#submitted')).toHaveText('未提交');
});

test('A4 · a question video produces three distinct timestamped frames and leaves the player untouched', async ({ page }) => {
  const sent: { type: string; text?: string; image_url?: { url: string } }[][] = [];
  await mockAi(page, async (route, request) => {
    sent.push(request.postDataJSON().messages[1].content);
    await model(route, ['opt2']);
  });
  await page.goto(course('21'));
  await service(page);
  await review(page, 'q6');
  await expect(page.locator('#send-media')).toContainText('3 张静帧');
  await page.getByRole('button', { name: '确认查询' }).click();
  await expect(page.locator('#suggested-options li')).toHaveText('蓝色');
  const parts = sent[0]!;
  expect(parts.filter(({ text }) => text?.includes('秒画面'))).toHaveLength(3);
  expect(new Set(parts.filter(({ image_url }) => image_url).map(({ image_url }) => image_url?.url)).size).toBe(3);
  expect(await frame(page).locator('#q6 video').evaluate((video: HTMLVideoElement) => [video.paused, video.currentTime])).toEqual([true, 0]);
  await frame(page).locator('#q6 video').evaluate((element) => {
    const iframe = element.ownerDocument.createElement('iframe');
    iframe.src = '/ananas/modules/video/index.html?question';
    element.replaceWith(iframe);
  });
  await expect(frame(page).frameLocator('#q6 iframe').locator('video')).toBeVisible();
  await expect(page.locator('#query')).toBeEnabled();
  await query(page, 'q6');
  await expect(page.locator('#suggested-options li')).toHaveText('蓝色');
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
});

test('A5 · replacing an image during a query invalidates its answer', async ({ page }) => {
  let reply: (() => void) | undefined;
  await mockAi(page, async (route) => {
    await new Promise<void>((resolve) => { reply = resolve; });
    try { await model(route, ['opt2']); } catch { /* The browser can discard the response after abort. */ }
  });
  await page.goto(course('21'));
  await service(page);
  await query(page, 'q5');
  await expect.poll(() => Boolean(reply)).toBe(true);
  await frame(page).locator('#q5 h3 img').evaluate((image) => image.setAttribute('src', '/question-first.svg'));
  reply?.();
  await expect(page.locator('#practice-status')).toContainText('已变化');
  await expect(page.getByRole('button', { name: '填入本题' })).toBeHidden();
});

test('A4 · a special-font question can send a previewed screenshot without the DOM text', async ({ page }) => {
  const payloads: { messages: { content: { text?: string; image_url?: { url: string } }[] }[] }[] = [];
  await mockAi(page, async (route, request) => {
    payloads.push(request.postDataJSON());
    await model(route, ['opt1'], '降低信号干扰。');
  });
  await page.goto(course('21'));
  await service(page);
  await page.getByRole('tab', { name: '练习' }).click();
  await frame(page).locator('#q7 h3').click();
  await expect(page.locator('#stem')).toContainText('特殊字体');
  await page.getByRole('button', { name: '截图查询' }).click();
  const send = page.getByRole('button', { name: '确认查询' });
  await expect(send).toBeDisabled();
  const image = await frame(page).locator('#q7').screenshot();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '选择截图文件' }).click(),
  ]);
  await chooser.setFiles({ name: 'question.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByAltText('待发送的题目截图')).toBeVisible();
  await expect(page.getByRole('button', { name: '更换截图' })).toBeVisible();
  expect(payloads).toHaveLength(0);
  await send.click();
  await expect(page.locator('#explanation')).toHaveText('降低信号干扰。');
  await expect(page.locator('#suggested-options li')).toHaveText('第 1 项（按截图从上到下）');
  expect(payloads).toHaveLength(1);
  const content = payloads[0]?.messages[1]?.content;
  expect(JSON.parse(content![0]!.text!)).toMatchObject({
    type: 'single', options: [{ id: 'opt1', position: 1 }, { id: 'opt2', position: 2 }],
  });
  expect(JSON.stringify(content)).not.toMatch(/怭怫|怸低|question\.png/);
  expect(content?.filter((part) => part.image_url)).toHaveLength(1);
  expect(content?.find((part) => part.image_url)?.image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.getByAltText('待发送的题目截图')).not.toHaveAttribute('src');
  await frame(page).locator('#q7 ul').evaluate((list) => list.prepend(list.lastElementChild!));
  await expect(page.locator('#practice-status')).toContainText('已变化');
  await expect(page.getByRole('button', { name: '填入本题' })).toBeHidden();
  await page.getByRole('button', { name: '截图查询' }).click();
  const reordered = await frame(page).locator('#q7').screenshot();
  await page.locator('#screenshot-input').evaluate((target, bytes) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([new Uint8Array(bytes)], 'clipboard.png', { type: 'image/png' }));
    target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
  }, [...reordered]);
  await expect(page.getByAltText('待发送的题目截图')).toBeVisible();
  expect(payloads).toHaveLength(1);
  await send.click();
  await page.getByRole('button', { name: '填入本题' }).click();
  await expect(frame(page).locator('#q7 input[value=B]')).toBeChecked();
  await expect(frame(page).locator('#submitted')).toHaveText('未提交');
});

test('A4 · a pasted screenshot can be queried without a recognized question', async ({ page }) => {
  const inputs: unknown[] = [];
  await mockAi(page, async (route, request) => {
    inputs.push(request.postDataJSON().messages[1].content);
    await route.fulfill({ headers: cors, json: { choices: [{ message: {
      content: JSON.stringify({ answer: 'B．7', explanation: '7 只能被 1 和它自身整除。' }),
    } }] } });
  });
  await page.goto(course('21'));
  await service(page);
  const tab = page.getByRole('tab', { name: '练习' });
  await tab.click();
  await expect(page.getByRole('button', { name: '查询答案' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '截图查询' })).toBeEnabled();
  const image = await frame(page).locator('#q1').screenshot();
  await tab.evaluate((target, bytes) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([new Uint8Array(bytes)], 'clipboard.png', { type: 'image/png' }));
    target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
  }, [...image]);
  await expect(page.getByAltText('待发送的题目截图')).toBeVisible();
  expect(inputs).toHaveLength(0);
  await page.getByRole('button', { name: '确认查询' }).click();
  await expect(page.locator('#suggested-options li')).toHaveText('B．7');
  await expect(page.getByRole('button', { name: '填入本题' })).toBeHidden();
  await expect(frame(page).locator('#q1 input[value=B]')).not.toBeChecked();
  expect(inputs).toEqual([[{ type: 'image_url', image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) } }]]);
});

test('A8 · the nested cross-origin PDF reader scrolls, pauses, resumes and leaves the platform marker authoritative', async ({ page }) => {
  await page.clock.install();
  await page.goto(course('12', 'pdf-ready'));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await openPlayback(page);
  await page.getByRole('button', { name: '开始阅读' }).click();
  await expect(page.locator('#pdf-position')).toHaveText('PDF 滚动位置 0%');
  const reader = page.frameLocator('#pdf-frame').frameLocator('#panView');
  const offset = () => reader.locator('html').evaluate((html) => html.scrollTop);
  await page.clock.runFor(4000);
  await expect.poll(offset).toBe(80);
  await expect(page.locator('#pdf-position')).toHaveText('PDF 滚动位置 40%');
  await page.getByRole('button', { name: '暂停阅读' }).click();
  await page.clock.runFor(8000);
  expect(await offset()).toBe(80);
  await page.getByRole('button', { name: '开始阅读' }).click();
  await expect(page.locator('#pdf-position')).toHaveText('PDF 滚动位置 40%');
  for (const expected of [160, 200]) {
    await page.clock.runFor(4000);
    await expect.poll(offset).toBe(expected);
    await expect(page.locator('#pdf-position')).toHaveText(`PDF 滚动位置 ${expected / 2}%`);
  }
  await page.clock.runFor(4000);
  await expect(page.locator('#pdf-status')).toContainText('已滚动至 PDF 末尾');
  await expect(page.locator('#progress')).toContainText('有待完成任务');
});

test('A8 · a replaced PDF reader requires a fresh start', async ({ page }) => {
  await page.clock.install();
  await page.goto(course('12', 'pdf-ready'));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await openPlayback(page);
  await page.getByRole('button', { name: '开始阅读' }).click();
  await expect(page.locator('#pdf-position')).toHaveText('PDF 滚动位置 0%');
  await page.frameLocator('#pdf-frame').locator('#panView').evaluate((iframe: HTMLIFrameElement) => iframe.replaceWith(iframe.cloneNode()));
  await page.clock.runFor(8000);
  await expect(page.locator('#pdf-status')).toContainText('PDF 阅读器已变化');
  await expect(page.getByRole('button', { name: '开始阅读' })).toBeEnabled();
  const offset = await page.frameLocator('#pdf-frame').frameLocator('#panView').locator('html').evaluate((html) => html.scrollTop);
  expect(offset).toBe(0);
});

test('A8 · an inaccessible PDF is reported and mixed sections do not skip an open reader', async ({ page }) => {
  await page.goto(course('12', 'pdf-unavailable'));
  await openPlayback(page);
  await expect(page.locator('#pdf-status')).toContainText('使用学习通原阅读器');
  await expect(page.getByRole('button', { name: '开始阅读' })).toBeDisabled();
  await page.goto(course('11', 'mixed-pdf'));
  await start(page, true);
  await expect(page.getByRole('button', { name: '开始阅读' })).toBeEnabled();
  await finish(page);
  await expect(page.locator('#play-status')).toContainText('请先处理本节');
  expect(await entries(page)).toBeNull();
});

test('A5 · delayed replies are invalidated by cutover, selection changes, cancellation, and reordering', async ({ page }) => {
  let resolve: (() => void) | undefined;
  let count = 0;
  await mockAi(page, async (route) => {
    ++count;
    if (count <= 4) await new Promise<void>((done) => { resolve = done; });
    try { await model(route, count === 5 ? ['opt9'] : ['opt2']); } catch { /* A cancelled browser request may already be gone. */ }
  });
  await page.goto(course('21'));
  await service(page);
  const interactions = [
    () => frame(page).locator('#q2 h3').click(),
    () => frame(page).locator('#q1 input[value=A]').check(),
    () => page.getByRole('button', { name: '取消查询' }).click(),
    () => frame(page).locator('#q1 ul').evaluate((list) => list.prepend(list.lastElementChild!)),
  ];
  for (const [index, interact] of interactions.entries()) {
    await query(page, 'q1');
    await expect.poll(() => count).toBe(index + 1);
    await interact();
    resolve?.();
    await expect(page.locator('#practice-status')).toContainText(index === 2 ? '已取消查询' : '已变化');
    await expect(page.getByRole('button', { name: '填入本题' })).toBeHidden();
  }
  await query(page, 'q1');
  await expect(page.locator('#practice-status')).toContainText('无法匹配');
  await expect(frame(page).locator('#q1 input[value=A]')).toBeChecked();
  await expect(frame(page).locator('#q1 input[value=B]')).not.toBeChecked();
});

test('A5 · multi-select writes stop after a redraw and report the actual partial selection', async ({ page }) => {
  await mockAi(page, (route) => model(route, ['opt1', 'opt3']));
  await page.goto(course('21'));
  await service(page);
  await query(page, 'q2');
  await expect(page.getByRole('button', { name: '填入本题' })).toBeVisible();
  await frame(page).locator('#q2').evaluate((question) => {
    question.addEventListener('change', () => {
      const input = question.querySelector('input[value=C]')!;
      input.replaceWith(input.cloneNode(true));
    }, { once: true });
  });
  await page.getByRole('button', { name: '填入本题' }).click();
  await expect(page.locator('#practice-status')).toContainText('只填入了一部分');
  await expect(page.locator('#filled')).toContainText('4');
  await expect(frame(page).locator('#q2 input[value=C]')).not.toBeChecked();
});

test('A6 · test connection classifies errors, sends fixed text and leaves old credentials behind on an origin change', async ({ page }) => {
  let status = 401;
  const requests: Request[] = [];
  const respond = async (route: Route, request: Request) => {
    requests.push(request);
    await route.fulfill({ status, headers: cors, json: { choices: [{ message: { content: 'OK' } }] } });
  };
  await mockAi(page, respond);
  await mockAi(page, respond, 'second.example');
  await page.goto(course('21'));
  await service(page, { origin: `${ai}/chat/completions/`, remember: true });
  for (const [code, text] of [[401, '拒绝鉴权'], [429, '服务限流'], [200, '连接成功']] as const) {
    status = code;
    await page.getByRole('button', { name: '测试连接' }).click();
    await expect(page.locator('#settings-status')).toContainText(text);
  }
  expect(requests).toHaveLength(3);
  expect(requests[0]?.postDataJSON().messages).toEqual([{ role: 'user', content: '请回复 OK。' }]);
  await service(page, { origin: 'https://second.example/v1', key: '' });
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.locator('#settings-status')).toContainText('先保存');
  expect(requests).toHaveLength(3);
  await service(page, { origin: 'https://second.example/v1', key: 'test-new-key' });
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.locator('#settings-status')).toContainText('连接成功');
  expect(await requests[3]?.headerValue('authorization')).toBe('Bearer test-new-key');
});

test('A6 · a redirect cannot forward Authorization or question text', async ({ page }) => {
  let redirected = 0;
  await mockAi(page, (route) => route.fulfill({ status: 307, headers: { ...cors, Location: 'https://receiver.example/v1/chat/completions' } }));
  await mockAi(page, async (route) => { ++redirected; await model(route, ['opt2']); }, 'receiver.example');
  await page.goto(course('21'));
  await service(page);
  await query(page, 'q1');
  await expect(page.locator('#practice-status')).toContainText('无法连接服务');
  expect(redirected).toBe(0);
});

test('A6 · changing service while a request is pending invalidates its reply', async ({ page }) => {
  let returnReply: (() => void) | undefined;
  await mockAi(page, async (route) => {
    await new Promise<void>((done) => { returnReply = done; });
    try { await model(route, ['opt2']); } catch { /* The browser can discard the response after abort. */ }
  });
  await page.goto(course('21'));
  await service(page);
  await query(page, 'q1');
  await expect.poll(() => Boolean(returnReply)).toBe(true);
  await service(page, { origin: 'https://second.example/v1', key: '' });
  returnReply?.();
  await page.getByRole('tab', { name: '练习' }).click();
  await expect(page.locator('#practice-status')).toContainText('服务配置已更新');
  await expect(page.locator('#fill')).toBeHidden();
  await expect(frame(page).locator('#q1 input[value=B]')).not.toBeChecked();
});

test('A7 · old preferences migrate, cleared stored keys stay cleared, and only preferences survive reload', async ({ page }) => {
  await page.goto(course());
  await page.evaluate(({ settingsKey, credentialKey, ai, alpha }) => {
    localStorage.setItem(settingsKey, JSON.stringify({ schemaVersion: 0, playbackMode: 'chapter', panelCollapsed: false, apiBaseUrl: ai, model: 'mock-model' }));
    localStorage.setItem(credentialKey, JSON.stringify({ origin: new URL(ai).origin, key: alpha }));
  }, { settingsKey, credentialKey, ai, alpha });
  await mockAi(page, (route) => model(route, ['opt2']));
  await page.goto(course('21'));
  await openPlayback(page);
  await expect(page.getByLabel('播放模式')).toHaveValue('chapter');
  await query(page, 'q1');
  await expect(page.locator('#suggestion')).toBeVisible();
  await page.getByRole('tab', { name: '设置' }).click();
  await expect(page.locator('#key')).toHaveValue('');
  await expect(page.getByLabel('记住密钥')).toBeChecked();
  await page.getByRole('button', { name: '清除密钥' }).click();
  await page.reload();
  await openPlayback(page);
  await expect(page.getByLabel('播放模式')).toHaveValue('chapter');
  await page.getByRole('tab', { name: '设置' }).click();
  await expect(page.locator('#key-state')).toContainText('未配置');
  await page.getByRole('tab', { name: '练习' }).click();
  await expect(page.locator('#suggestion')).toBeHidden();
  const stored = await page.evaluate(({ settingsKey, credentialKey }) => ({
    prefs: JSON.parse(localStorage.getItem(settingsKey)!), key: localStorage.getItem(credentialKey),
  }), { settingsKey, credentialKey });
  expect(stored.prefs).toMatchObject({ schemaVersion: 1, mode: 'chapter', collapsed: false });
  expect(stored.key).toBeNull();
});

test('A9 · chat opens by default, reads a normal framed question and sends follow-up context', async ({ page }) => {
  const requests: { role: string; content: string }[][] = [];
  const response = '<b>差分接收可以抵消一部分干扰。</b> 行内 $x^2$，独立 $$\\frac{1}{2}$$，也支持 \\(y+1\\)。';
  await mockAi(page, async (route, request) => {
    requests.push(request.postDataJSON().messages);
    await route.fulfill({ headers: cors, json: { choices: [{ message: { content: response } }] } });
  });
  await page.goto(course('21', 'standard-question'));
  await openPanel(page);
  const input = page.getByRole('textbox', { name: '聊天消息' });
  await expect(input).toBeVisible();
  await expect(page.getByRole('tab', { name: 'AI 聊天' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await service(page);
  await page.getByRole('tab', { name: 'AI 聊天' }).click();
  await expect(frame(page).locator('legend')).toBeVisible();
  await expect(page.locator('#stem')).toHaveText('双绞线互相绞合的作用是什么？');
  await page.getByRole('button', { name: '读取本题' }).click();
  const question = '双绞线互相绞合的作用是什么？\nA．降低信号干扰\nB．提高传输速度';
  await expect(input).toHaveValue(question);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#chat-messages [data-role=assistant]')).toHaveCount(1);
  await expect(page.locator('#chat-messages b')).toHaveCount(0);
  await expect(page.locator('#chat-messages [data-role=assistant] math')).toHaveCount(3);
  await expect(page.locator('#chat-messages math mfrac')).toHaveCount(1);
  await input.fill('能举个例子吗？');
  await input.press('Control+Enter');
  await expect(page.locator('#chat-messages [data-role=assistant]')).toHaveCount(2);
  expect(requests[1]?.slice(1)).toEqual([
    { role: 'user', content: question },
    { role: 'assistant', content: response },
    { role: 'user', content: '能举个例子吗？' },
  ]);
  await expect(frame(page).locator('#option-a')).not.toBeChecked();
});

test('A9 · page capture crops the confirmed tab into the chat draft and releases the stream', async ({ page }) => {
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    let handle = '';
    Object.defineProperties(devices, {
      setCaptureHandleConfig: { value: (config: { handle?: string }) => { handle = config.handle ?? ''; } },
      getDisplayMedia: { value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = innerWidth;
        canvas.height = innerHeight;
        const context = canvas.getContext('2d')!;
        const paint = () => {
          context.fillStyle = '#dc2626';
          context.fillRect(0, 0, canvas.width, canvas.height);
        };
        paint();
        const stream = canvas.captureStream(20);
        const track = stream.getVideoTracks()[0]!;
        const timer = setInterval(paint, 40);
        const stop = track.stop.bind(track);
        Object.defineProperties(track, {
          getCaptureHandle: { value: () => document.body.dataset.wrongCapture ? null : { handle } },
          stop: { value: () => { stop(); clearInterval(timer); document.body.dataset.captureStopped = 'true'; } },
        });
        return stream;
      } },
    });
  });
  const received: unknown[] = [];
  await mockAi(page, async (route, request) => {
    received.push(request.postDataJSON().messages[1].content);
    await route.fulfill({ headers: cors, json: { choices: [{ message: { content: '截图已读取。' } }] } });
  });
  await page.goto(course('21'));
  await service(page);
  await page.getByRole('tab', { name: 'AI 聊天' }).click();
  await page.getByRole('button', { name: '框选截图' }).click();
  const layer = page.getByRole('dialog', { name: '拖动框选截图' });
  await expect(layer).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-capture-stopped', 'true');
  await page.mouse.move(160, 170);
  await page.mouse.down();
  await page.mouse.move(340, 270, { steps: 5 });
  await page.mouse.up();
  await expect(layer).toBeHidden();
  const draftImage = page.getByAltText('待发送的截图');
  await expect(draftImage).toBeVisible();
  expect(received).toHaveLength(0);
  await expect.poll(() => draftImage.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([180, 100]);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#chat-messages [data-role=assistant]')).toContainText('截图已读取');
  expect(received).toEqual([[{ type: 'text', text: '请阅读截图并解释这道题。' },
    { type: 'image_url', image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) } }]]);
  await page.evaluate(() => { document.body.dataset.wrongCapture = 'true'; });
  await page.getByRole('button', { name: '框选截图' }).click();
  await expect(page.locator('#chat-status')).toContainText('选择当前学习通标签页');
  await expect(draftImage).toBeHidden();
  expect(received).toHaveLength(1);
});

test('A11 · automatic practice fills successive questions and preserves selections changed while waiting', async ({ page }) => {
  const types: string[] = [];
  let release: (() => void) | undefined;
  await mockAi(page, async (route, request) => {
    const { type } = JSON.parse(request.postDataJSON().messages[1].content);
    types.push(type);
    if (type === 'single') await new Promise<void>((resolve) => { release = resolve; });
    try { await model(route, type === 'multiple' ? ['opt1', 'opt3'] : ['opt2']); } catch { /* A stopped request can be gone. */ }
  });
  await page.goto(course('21'));
  await service(page);
  await page.getByRole('tab', { name: '练习' }).click();
  await frame(page).locator('#q5,#q6').evaluateAll((items) => { for (const item of items) item.remove(); });
  const judgement = frame(page).locator('#q3 input[value=false]');
  const selection = frame(page).locator('#q1 input[value=A]');
  await judgement.check();
  await page.getByRole('button', { name: '开始自动答题' }).click();
  await expect.poll(() => types).toEqual(['single']);
  await selection.check();
  release?.();
  await expect(page.locator('#auto-practice-status')).toContainText('已填入 1 道，跳过 4 道');
  await expect(selection).toBeChecked();
  await expect(judgement).toBeChecked();
  await expect(frame(page).locator('#q2 input[value=A]')).toBeChecked();
  await expect(frame(page).locator('#q2 input[value=C]')).toBeChecked();
  await expect(frame(page).locator('#submitted')).toHaveText('未提交');
  expect(types).toEqual(['single', 'multiple']);

  await selection.evaluate((input: HTMLInputElement) => { input.checked = false; });
  await page.getByRole('button', { name: '开始自动答题' }).click();
  await expect.poll(() => types).toEqual(['single', 'multiple', 'single']);
  await page.getByRole('button', { name: '停止自动答题' }).click();
  release?.();
  await expect(page.locator('#auto-practice-status')).toContainText('已停止自动答题');
  await expect(frame(page).locator('#q1 input[value=B]')).not.toBeChecked();
});

test('A12 · practice replies render LaTeX as MathML and keep other reply text visible', async ({ page }) => {
  await mockAi(page, (route) => model(route, ['opt2'], '行内 \\(7=7\\)，独立 \\[\\frac{7}{1}=7\\]。<img src=x>'));
  await page.goto(course('21'));
  await service(page);
  await query(page, 'q1');
  await expect(page.locator('#explanation math')).toHaveCount(2);
  await expect(page.locator('#explanation math mfrac')).toHaveCount(1);
  await expect(page.locator('#explanation')).toContainText('<img src=x>');
  await expect(page.locator('#explanation img')).toHaveCount(0);
});

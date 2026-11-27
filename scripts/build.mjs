import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const license = (await readFile(new URL('../LICENSE', import.meta.url), 'utf8')).trim();
const matches = ['', '/mooc-ans', '/mooc2-ans'].map(
  (prefix) => `// @match        https://*.chaoxing.com${prefix}/mycourse/studentstudy*`,
);
const metadata = [
  '// ==UserScript==',
  '// @name         超级超星 · 学习助手',
  '// @namespace    https://github.com/KH2PO4NILL/Chaoxing-Auto-Study',
  `// @version      ${version}`,
  '// @license      MIT',
  '// @description  在学习通课程页使用 AI 聊天、截图查题、播放视频和阅读 PDF',
  ...matches,
  '// @match        https://pan-yz.chaoxing.com/screen/v2/file_*',
  '// @grant        GM_getValue',
  '// @grant        GM_setValue',
  '// @grant        GM_deleteValue',
  '// @grant        GM_addValueChangeListener',
  '// @grant        GM_removeValueChangeListener',
  '// @sandbox      DOM',
  '// @run-at       document-end',
  '// ==/UserScript==',
].join('\n');

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  charset: 'utf8',
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/chaoxing-auto-study.user.js',
  banner: { js: `${metadata}\n/*\n${license}\n*/` },
});

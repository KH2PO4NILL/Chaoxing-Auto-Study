# 超级超星 · 学习助手

桌面学习通课程页的 Tampermonkey 脚本。`0.1.0` 提供课程视频控制和章节练习的 AI 建议，两个功能可独立使用。页面兼容情况见 [验证记录](VERIFICATION.md)。

## 安装与停用

1. 在 Edge 或 Chrome 安装 Tampermonkey，并在扩展设置中启用「允许用户脚本」。若浏览器只提供开发者模式，按 Tampermonkey 的说明启用。 [Tampermonkey 安装权限说明](https://www.tampermonkey.net/faq.php?q=Q209)
2. 下载 [chaoxing-auto-study.user.js](dist/chaoxing-auto-study.user.js)。在 Tampermonkey 管理面板的「实用工具」中选择「导入」，选中该文件并确认安装。也可选择「添加新脚本」，将文件全文覆盖到编辑器并保存。 [Tampermonkey 用户脚本安装说明](https://www.tampermonkey.net/faq.php?q=Q102)
3. 打开学习通的一门课程，进入具体小节，从右下角展开「学习助手」。需要停用时，在 Tampermonkey 管理面板关闭或移除该脚本，再刷新课程页。

## 使用

- **播放**　在播放页签选择「仅本节」或「连续播放本章」，再点击「开始」。连续模式在视频自然结束后沿目录进入同章下一节，要求下一项明确标记为视频并且可进入。遇到练习、锁定项、类型不明或章末时，面板会显示停止原因。平台的完成标记与视频播放状态分别显示。
- **练习**　点击课程页里的题目，在面板选择「查询答案」。确认页列出接收请求的服务地址、题干和选项。查看模型建议后可选择「填入本题」，再在课程页检查或修改。最终提交使用学习通的按钮。实现范围为可读取的纯文本单选、多选和判断题。
- **配置模型**　在设置中填写提供商给出的 HTTPS API 基础地址（例如 `https://api.example.com/v1`）、模型名称和密钥。脚本会追加 `/chat/completions`。保存后可测试连接，测试请求使用固定短文本，可能产生费用。

## AI 请求与数据

服务需支持非流式 Chat Completions，并允许从课程页发起带 `Authorization` 和 `Content-Type` 请求头的浏览器跨域请求。若连接失败，请检查服务的 CORS 设置与课程页的浏览器网络策略。脚本通过浏览器 Fetch 直接连接配置的 HTTPS 地址，拒绝重定向。请求省略 Cookie 和页面 URL，跨域时浏览器会发送站点来源。 [Fetch 标准](https://fetch.spec.whatwg.org/)

默认密钥仅存于当前页面会话。勾选「记住密钥」才写入 Tampermonkey 专用存储。密钥按协议、主机和端口绑定，可在设置中清除。题干、选项和模型回复随页面会话结束而清理。播放偏好、面板折叠偏好、服务地址和模型名称会保留。

## 本地构建与验证

需要 Node.js 22 或更新版本。首次运行测试时准备 Playwright 浏览器。

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
```

构建生成 [dist/chaoxing-auto-study.user.js](dist/chaoxing-auto-study.user.js)。测试使用虚构课程与模拟 AI 响应。功能验收见 [goal.md](goal.md)，代码边界见 [AGENTS.md](AGENTS.md)。

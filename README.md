# 超级超星 · 学习助手

桌面学习通课程页的 Tampermonkey 脚本。`0.1.5` 在右侧边栏提供 AI 聊天、截图查题、课程视频控制和 PDF 自动滚动。页面兼容情况见 [验证记录](VERIFICATION.md)。

## 安装与停用

1. 在 Edge 或 Chrome 安装 Tampermonkey，并在扩展设置中启用「允许用户脚本」。若浏览器只提供开发者模式，按 Tampermonkey 的说明启用。 [Tampermonkey 安装权限说明](https://www.tampermonkey.net/faq.php?q=Q209)
2. 下载 [chaoxing-auto-study.user.js](dist/chaoxing-auto-study.user.js)。在 Tampermonkey 管理面板的「实用工具」中选择「导入」，选中该文件并确认安装。也可选择「添加新脚本」，将文件全文覆盖到编辑器并保存。 [Tampermonkey 用户脚本安装说明](https://www.tampermonkey.net/faq.php?q=Q102)
3. 打开学习通的一门课程，进入具体小节，点击页面右侧的「学习助手」展开侧栏。点击侧栏顶部的箭头可收起，也可在侧栏内按 Esc。需要停用时，在 Tampermonkey 管理面板关闭或移除该脚本，再刷新课程页。

## 使用

- **AI 聊天**　展开侧栏后默认打开聊天。可直接输入问题，或在原页面点选一道题，再点「读取本题」，将能读取的文字题干和选项带到输入框。核对后点「发送」，可以继续追问。
- **网页内框选**　在聊天页点击「框选截图」，在浏览器弹窗里选择**当前学习通标签页**，拖出要截的区域。松开后截图会附在输入框旁，可直接提问或移除，再点「发送」提交。按 Esc 或点「取消截图」退出。也可在聊天框粘贴系统截图。模型需支持图片输入。 [浏览器标签页截图说明](https://developer.chrome.com/docs/web-platform/screen-sharing-controls)
- **播放**　在播放页签选择「仅本节」或「连续播放本章」，再点击「开始」。连续模式在视频自然结束后沿目录进入同章下一节，要求下一项明确标记为视频并且可进入。本节仍显示练习或 PDF 阅读器时，助手会停在本节。
- **PDF 阅读**　打开章节里的 PDF，在播放页签点击「开始阅读」。阅读器从当前位置自动逐屏滚动，可以随时暂停。到达末尾后请查看面板中的学习通完成标记。若阅读器布局不可用，面板会提示使用原阅读器。
- **练习**　点击课程页里的单选、多选或判断题，再点击「查询答案」。预览会列出服务域名、题干、选项和附件。可读取的题干或选项图片随查询发送，每段视频发送 3 张带时间的静帧，供支持图片输入的模型分析。需要听视频音频、依赖静帧之间的内容或遇到无法读取的嵌入媒体时，请在课程页处理。核对建议后可点「填入本题」，然后按学习通原有流程提交。
- **截图查询**　在「练习」页签点击「截图查询」，框选一道题的完整题干和选项并复制，再按 Ctrl+V 粘贴或选择图片文件。核对预览和服务域名后确认。即使网页题目尚未识别，也可以根据截图获取建议，然后在学习通手动选择答案。
- **配置模型**　在设置中填写提供商给出的 HTTPS API 基础地址（例如 `https://api.example.com/v1`）、模型名称和密钥。脚本会追加 `/chat/completions`。保存后可测试连接，测试请求使用固定短文本，可能产生费用。

## AI 请求与数据

服务需支持非流式 Chat Completions，并允许从课程页发起带 `Authorization` 和 `Content-Type` 请求头的浏览器跨域请求。若连接失败，请检查服务的 CORS 设置与课程页的浏览器网络策略。脚本通过浏览器 Fetch 直接连接配置的 HTTPS 地址，拒绝重定向。请求省略 Cookie 和页面 URL，跨域时浏览器会发送站点来源。 [Fetch 标准](https://fetch.spec.whatwg.org/)

图片、视频静帧和用户提供的截图以图片数据发送。所选模型及服务须支持 Chat Completions 的 `image_url` 图片输入。PDF 内容保留在原阅读器中。 [Chat Completions 图片输入](https://developers.openai.com/api/reference/resources/chat)

默认密钥仅存于当前页面会话。勾选「记住密钥」才写入 Tampermonkey 专用存储。密钥按协议、主机和端口绑定，可在设置中清除。最近的对话会随追问发送给同一服务。题干、选项、截图和对话随章节会话结束而清理。播放偏好、面板折叠偏好、服务地址和模型名称会保留。

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

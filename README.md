# 词间 · 英语复习

[打开网页版](https://cijian-word-review.lizn0421.chatgpt.site)

Android 和网页共用 `web/` 中的界面、词表解析和复习逻辑。Android APK 内置这些资源，可以离线使用。两端各自保存数据，可通过 JSON 备份迁移或合并。

## 导入词表

1. 在电脑上登录 [Google 翻译](https://translate.google.com/)，点击「已保存」→「导出到 Google 表格」。
2. 在 Google 表格选「文件 → 下载 → 逗号分隔值 (.csv)」。
3. 在词间的「导入与设置」选择文件。也可以直接粘贴两列内容，首行为 `英文,中文`，可增加 `例句` 列。支持 TSV。
4. 导入会把英中和中英词条统一为英文、中文顺序，并合并相同词条。不同释义可分别保留。应用显示新增、重复和跳过的数量。

[Google 翻译帮助](https://support.google.com/translate/answer/6142480?hl=zh-Hans)

## 复习

默认每天最多引入 5 张新卡。先练到期卡，回想后翻卡，按实际回想情况评分。新卡的初始间隔分别是 10 分钟、30 分钟、1 天、4 天，后续按卡片的记忆表现调整。可在词库标记难词，加入原句。两次选「忘了」也会把词条留在难词列表。

第一周每天留 5–10 分钟练英到中。赶时间时先做几张到期卡片。第二周给反复忘记的词补一条你遇到过的原句。想练主动表达时，可把方向改成中到英或交替练习。

- [主动回忆与外语词汇实验](https://doi.org/10.1126/science.1152408)
- [间隔复习的定量综述](https://doi.org/10.1037/0033-2909.132.3.354)

## 本地运行网页

```sh
python3 -m http.server 8080 --directory web
```

打开 <http://localhost:8080/>。

## 构建 Android APK

需要 Linux、JDK、Android SDK Platform 35、Build Tools 35.0.0 和 `zip`。设置 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT`。

```sh
./scripts/build-android.sh
```

输出 `build/cijian-v1.0.0.apk`。最低 Android 6.0，要求系统 WebView 支持现代 JavaScript 和 HTML 对话框。请保留本地签名文件 `build/cijian-debug.jks` 以便用同一签名构建后续 APK。切换签名前可先导出 JSON。

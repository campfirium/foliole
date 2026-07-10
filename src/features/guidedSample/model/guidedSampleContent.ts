import type { GuidedSampleLocale } from './guidedSampleLocale';

export const GUIDED_SAMPLE_MARKER = '<!-- foliole-guided-sample:v1 -->';

export const GUIDED_SAMPLE_ASSET_IDS = [
  '182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104',
  '42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49',
  '4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc',
  '58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b'
] as const;

type GuidedSampleAssetId = (typeof GUIDED_SAMPLE_ASSET_IDS)[number];

export interface GuidedSampleTopicTemplate {
  attachmentIds?: GuidedSampleAssetId[];
  content: string;
}

interface GuidedSampleTopicContent {
  children: GuidedSampleTopicTemplate[];
  root: GuidedSampleTopicTemplate;
  rootTitle: string;
}

const guidedSampleContentByLocale: Record<GuidedSampleLocale, GuidedSampleTopicContent> = {
  'en-US': {
    rootTitle: 'Welcome to Foliole',
    root: {
      attachmentIds: ['58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b'],
      content: `# Welcome to Foliole

![image](asset://58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b.png)

Start by clicking Read in the bottom action bar, or press 3 or F.`
    },
    children: [
      {
        attachmentIds: ['58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b'],
        content: `# Reading: Break the Whole into Pieces

![image](asset://58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b.png)

Reading does not need to be completed in one pass.
You can choose by context: show the current content soon (Soon in the bottom action bar, or press 1), show it later (Later, or press 2), show it again after a reading pass (Read, or press 3), or stop showing it automatically when done (Dismiss, or press 4).

If the bottom action bar is not visible, click Enter Flow in the bottom-left corner.`
      },
      {
        attachmentIds: ['4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc'],
        content: `# Highlight: Extract the Essence

![image](asset://4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc.png)

Select the text you want to extract. The floating toolbar will appear.

Use Highlight there, or press Alt + Z, to highlight the passage and create a new child Topic.`
      },
      {
        attachmentIds: ['42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49'],
        content: `# Cloze: Create a Test Item

![image](asset://42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49.png)

Select the text you want to test.
Use Cloze in the floating toolbar, or press Alt + X.
Foliole creates an Item that asks you to remember the hidden part.`
      },
      {
        attachmentIds: ['182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104'],
        content: `# Test: Make It Stick

![image](asset://182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104.png)

When an Item created from a cloze appears, try to recall the answer first.
Then grade it in the bottom action bar: choose Again if you missed it (or press 1), Hard if you partly remembered it (or press 2), Good if you remembered it (or press 3), and Easy if it was too easy (or press 4).
Your grade affects when it appears again, and testing itself helps strengthen memory.`
      },
      { content: `# Rewrite: Clarify Understanding


During later reviews, you can keep rewriting the material, making it easier to understand and remember.` },
      { content: `# Schedule: Show It at the Right Time


Material priority, reading actions, and test grades all contribute to Foliole's schedule, helping material appear again at the right time.` },
      { content: `# Repeat: Internalize Knowledge


Spaced repetition internalizes knowledge step by step.
Incremental reading makes reading actually complete.
Foliole makes incremental reading smooth.` }
    ]
  },
  'zh-CN': {
    rootTitle: '欢迎使用 Foliole',
    root: {
      attachmentIds: ['58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b'],
      content: `# 欢迎使用 Foliole

![image](asset://58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b.png)

请先点击底部动作条里的 Read，或按 3 或 F。`
    },
    children: [
      {
        attachmentIds: ['58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b'],
        content: `# 阅读：化整为零

![image](asset://58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b.png)

在 Foliole 中，阅读不必一次完成。
可以根据具体情境，选择让当前内容稍后展现（底部动作条中的 Soon，或按 1）、以后展现（Later，或按 2）、读了一段后下次再展现（Read，或按 3），或者读完后不再自动展现（Dismiss，或按 4）。

如果没有看到底部动作条，请点击左下角的“进入 Flow”按钮。`
      },
      {
        attachmentIds: ['4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc'],
        content: `# 高亮：摘录精华

![image](asset://4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc.png)

选中想摘录的文本后，会出现浮动工具条。点击其中的 Highlight，或按 Alt + Z，高亮这段内容，并生成一个新的子主题。`
      },
      {
        attachmentIds: ['42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49'],
        content: `# 挖空：生成检测

![image](asset://42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49.png)

选中想检测的内容后，点击浮动工具条里的 Cloze（或按 Alt + X），生成一个以挖空内容为答案的检测项。`
      },
      {
        attachmentIds: ['182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104'],
        content: `# 检测：强化记忆

![image](asset://182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104.png)

挖空生成的检测项展现时，先尝试回想答案。
再在底部动作条中评分：不记得选 Again（或按 1），记得一些选 Hard（或按 2），记得选 Good（或按 3），太简单选 Easy（或按 4）。
评分会影响下次展现时间，检测本身也会强化记忆。`
      },
      { content: `# 改写：澄清理解


在后续的回顾过程中，可以持续改写材料，让它更容易理解和记忆。` },
      { content: `# 调度：适时展现


材料优先级、阅读动作和检测评分会共同影响系统调度，让材料在合适的时候再次展现。` },
      { content: `# 重复：内化知识


间隔重复，让知识逐步内化。
渐进阅读，让阅读真正完成。
Foliole，让渐进阅读流畅发生。` }
    ]
  }
};

export function getGuidedSampleContent(locale: GuidedSampleLocale) {
  return guidedSampleContentByLocale[locale];
}

export function getGuidedSampleRootTitles() {
  return new Set(Object.values(guidedSampleContentByLocale).map((content) => content.rootTitle));
}

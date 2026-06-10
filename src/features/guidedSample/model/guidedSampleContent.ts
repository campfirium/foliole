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

Start by clicking Read, or press 3 / F`
    },
    children: [
      {
        attachmentIds: ['58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b'],
        content: `# Reading: Break the Whole into Pieces

![image](asset://58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b.png)

Click Soon / Later / Read / Dismiss, or press 1 / 2 / 3 / 4.

Show soon / show later / mark this part read and show it later / stop showing automatically.`
      },
      {
        attachmentIds: ['4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc'],
        content: `# Highlight: Extract the Essence

![image](asset://4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc.png)

Select a passage, then click the Highlight icon in the floating toolbar, or press Alt + Z.

Extract the essence into a new Topic.`
      },
      {
        attachmentIds: ['42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49'],
        content: `# Cloze: Create a Test Item

![image](asset://42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49.png)

Select the part to cloze, then click the Cloze icon in the floating toolbar, or press Alt+ X

Create a test item with the clozed text as the answer..`
      },
      {
        attachmentIds: ['182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104'],
        content: `# Test: Make It Stick

![image](asset://182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104.png)

Click Again / Hard / Good / Easy, or press 1 / 2 / 3 / 4.
missed / hard / remembered / easy.

Shape the next review time, testing itself also strengthens memory.`
      },
      { content: `# Rewrite: Clarify Understanding


Rewrite an excerpt or test item.

Create a clearer version that is easier to understand and remember.` },
      { content: `# Schedule: Show It at the Right Time


Actions and priority affect where material appears next.

Help material show up again at the right time.` },
      { content: `# Repeat: Internalize Knowledge


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

请先点击 Read，或按 3 / F`
    },
    children: [
      {
        attachmentIds: ['58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b'],
        content: `# 阅读：化整为零

![image](asset://58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b.png)

点击 Soon / Later / Read / Dismiss，或按 1 / 2 / 3 / 4

等下展现 / 以后展现 / 读了一段下次再展现 / 读完了不要自动展现了`
      },
      {
        attachmentIds: ['4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc'],
        content: `# 高亮：摘录精华

![image](asset://4ddbd1c101f60c761cfa1ea909cc2763a53bd570070902474484bf742b5e40cc.png)

选中内容，点击浮动工具条上的高亮图标，或按 Alt + Z
摘录精华片段`
      },
      {
        attachmentIds: ['42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49'],
        content: `# 挖空：生成检测

![image](asset://42fdfebb23322a456d50d29e86839c98ac7f223cae0edd04f3bf1a2f16322c49.png)

选中内容，点击浮动工具条上的挖空图标，或按 Alt+X
生成以挖空内容为答案的检测项。`
      },
      {
        attachmentIds: ['182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104'],
        content: `# 检测：强化记忆

![image](asset://182c3d2d400ec24b504eef26956bd67a0698df5e1fed98cf65d1f2c44bf1f104.png)

点击 again / hard / good / easy，或按 1 / 2 / 3 / 4
不记得 / 记得些 / 记得 / 太简单

影响下次复习时间，检测本身也会强化记忆`
      },
      { content: `# 改写：澄清理解


对摘录或检测项进行改写

让内容更清楚，也更容易记住` },
      { content: `# 调度：适时展现


动作和优先级会影响内容之后的展现

让材料在合适的时候再次展现` },
      { content: `# 重复：内化知识


渐进阅读，让阅读真正完成

Foliole，让渐进阅读流畅发生` }
    ]
  }
};

export function getGuidedSampleContent(locale: GuidedSampleLocale) {
  return guidedSampleContentByLocale[locale];
}

export function getGuidedSampleRootTitles() {
  return new Set(Object.values(guidedSampleContentByLocale).map((content) => content.rootTitle));
}

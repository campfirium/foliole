import type { DemoPack } from '../demoPack';

export const GENERATED_DEMO_PACKS: Record<string, DemoPack> = {
  "en": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "en",
    "translatableFields": [
      "topics[].title",
      "topics[].description",
      "topics[].summary",
      "topics[].blocks[].text",
      "topics[].highlights[].title",
      "topics[].highlights[].excerpt",
      "topics[].reviewItems[].title",
      "topics[].reviewItems[].prompt",
      "topics[].reviewItems[].answer"
    ],
    "source": {
      "rootNodeId": null,
      "rootTitle": "docs/i18n/guides",
      "warnings": []
    },
    "topics": [
      {
        "id": "welcome-to-foliole",
        "slug": "welcome-to-foliole",
        "parentId": null,
        "childTopicIds": [
          "welcome-to-foliole.reading-break-the-whole-into-pieces",
          "welcome-to-foliole.highlight-extract-the-essence",
          "welcome-to-foliole.cloze-create-a-test-item",
          "welcome-to-foliole.test-make-it-stick",
          "welcome-to-foliole.rewrite-clarify-understanding",
          "welcome-to-foliole.schedule-show-it-at-the-right-time",
          "welcome-to-foliole.repeat-internalize-knowledge"
        ],
        "title": "Welcome to Foliole",
        "description": "Start by clicking Read in the bottom action bar, or press 3 or F.",
        "summary": "Start by clicking Read in the bottom action bar, or press 3 or F.",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Start by clicking Read in the bottom action bar, or press 3 or F.",
            "id": "welcome-to-foliole-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.reading-break-the-whole-into-pieces",
        "slug": "welcome-to-foliole.reading-break-the-whole-into-pieces",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "Reading: Break the Whole into Pieces",
        "description": "Reading does not need to be completed in one pass. You can choose by context: show the current content soon (Soon in the bottom action bar, or press 1), show it later (Later, or press 2), show it again after a reading pass (Read, or press 3), or stop showing it automatically when done (Dismiss, or press 4).",
        "summary": "Reading does not need to be completed in one pass. You can choose by context: show the current content soon (Soon in the bottom action bar, or press 1), show it later (Later, or press 2), show it again after a reading pass (Read, or press 3), or stop showing it automatically when done (Dismiss, or press 4).",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.reading-break-the-whole-into-pieces"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Reading does not need to be completed in one pass.\nYou can choose by context: show the current content soon (Soon in the bottom action bar, or press 1), show it later (Later, or press 2), show it again after a reading pass (Read, or press 3), or stop showing it automatically when done (Dismiss, or press 4).",
            "id": "welcome-to-foliole.reading-break-the-whole-into-pieces-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.highlight-extract-the-essence",
        "slug": "welcome-to-foliole.highlight-extract-the-essence",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "Highlight: Extract the Essence",
        "description": "Select the text you want to extract. The floating toolbar will appear.",
        "summary": "Select the text you want to extract. The floating toolbar will appear.",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.highlight-extract-the-essence"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Select the text you want to extract. The floating toolbar will appear.\nUse Highlight there, or press Alt + Z, to highlight the passage and create a new child Topic.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.cloze-create-a-test-item",
        "slug": "welcome-to-foliole.cloze-create-a-test-item",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "Cloze: Create a Test Item",
        "description": "Select the text you want to test. Use Cloze in the floating toolbar, or press Alt + X. Foliole creates an Item that asks you to remember the hidden part.",
        "summary": "Select the text you want to test. Use Cloze in the floating toolbar, or press Alt + X. Foliole creates an Item that asks you to remember the hidden part.",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.cloze-create-a-test-item"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Select the text you want to test.\nUse Cloze in the floating toolbar, or press Alt + X.\nFoliole creates an Item that asks you to remember the hidden part.",
            "id": "welcome-to-foliole.cloze-create-a-test-item-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.test-make-it-stick",
        "slug": "welcome-to-foliole.test-make-it-stick",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "Test: Make It Stick",
        "description": "When an Item created from a cloze appears, try to recall the answer first. Then grade it in the bottom action bar: choose Again if you missed it (or press 1), Hard if you partly remembered it (or press 2), Good if you remembered it (or press 3), and Easy if it was too easy (or press 4). Your grade affects when it appears again, and testing itself helps strengthen memory.",
        "summary": "When an Item created from a cloze appears, try to recall the answer first. Then grade it in the bottom action bar: choose Again if you missed it (or press 1), Hard if you partly remembered it (or press 2), Good if you remembered it (or press 3), and Easy if it was too easy (or press 4). Your grade affects when it appears again, and testing itself helps strengthen memory.",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.test-make-it-stick"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "When an Item created from a cloze appears, try to recall the answer first.\nThen grade it in the bottom action bar: choose Again if you missed it (or press 1), Hard if you partly remembered it (or press 2), Good if you remembered it (or press 3), and Easy if it was too easy (or press 4).\nYour grade affects when it appears again, and testing itself helps strengthen memory.",
            "id": "welcome-to-foliole.test-make-it-stick-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.rewrite-clarify-understanding",
        "slug": "welcome-to-foliole.rewrite-clarify-understanding",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "Rewrite: Clarify Understanding",
        "description": "During later reviews, you can keep rewriting the material, making it easier to understand and remember.",
        "summary": "During later reviews, you can keep rewriting the material, making it easier to understand and remember.",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.rewrite-clarify-understanding"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "During later reviews, you can keep rewriting the material, making it easier to understand and remember.",
            "id": "welcome-to-foliole.rewrite-clarify-understanding-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.schedule-show-it-at-the-right-time",
        "slug": "welcome-to-foliole.schedule-show-it-at-the-right-time",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "Schedule: Show It at the Right Time",
        "description": "Material priority, reading actions, and test grades all contribute to Foliole's schedule, helping material appear again at the right time.",
        "summary": "Material priority, reading actions, and test grades all contribute to Foliole's schedule, helping material appear again at the right time.",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.schedule-show-it-at-the-right-time"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Material priority, reading actions, and test grades all contribute to Foliole's schedule, helping material appear again at the right time.",
            "id": "welcome-to-foliole.schedule-show-it-at-the-right-time-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.repeat-internalize-knowledge",
        "slug": "welcome-to-foliole.repeat-internalize-knowledge",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "Repeat: Internalize Knowledge",
        "description": "Spaced repetition internalizes knowledge step by step. Incremental reading makes reading actually complete. Foliole makes incremental reading smooth.",
        "summary": "Spaced repetition internalizes knowledge step by step. Incremental reading makes reading actually complete. Foliole makes incremental reading smooth.",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.repeat-internalize-knowledge"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Spaced repetition internalizes knowledge step by step.\nIncremental reading makes reading actually complete.\nFoliole makes incremental reading smooth.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "zh-hans": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "zh-hans",
    "translatableFields": [
      "topics[].title",
      "topics[].description",
      "topics[].summary",
      "topics[].blocks[].text",
      "topics[].highlights[].title",
      "topics[].highlights[].excerpt",
      "topics[].reviewItems[].title",
      "topics[].reviewItems[].prompt",
      "topics[].reviewItems[].answer"
    ],
    "source": {
      "rootNodeId": null,
      "rootTitle": "docs/i18n/guides",
      "warnings": []
    },
    "topics": [
      {
        "id": "welcome-to-foliole",
        "slug": "welcome-to-foliole",
        "parentId": null,
        "childTopicIds": [
          "welcome-to-foliole.reading-break-the-whole-into-pieces",
          "welcome-to-foliole.highlight-extract-the-essence",
          "welcome-to-foliole.cloze-create-a-test-item",
          "welcome-to-foliole.test-make-it-stick",
          "welcome-to-foliole.rewrite-clarify-understanding",
          "welcome-to-foliole.schedule-show-it-at-the-right-time",
          "welcome-to-foliole.repeat-internalize-knowledge"
        ],
        "title": "欢迎使用 Foliole",
        "description": "请先点击底部动作条里的 Read，或按 3 或 F。",
        "summary": "请先点击底部动作条里的 Read，或按 3 或 F。",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "请先点击底部动作条里的 Read，或按 3 或 F。",
            "id": "welcome-to-foliole-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.reading-break-the-whole-into-pieces",
        "slug": "welcome-to-foliole.reading-break-the-whole-into-pieces",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "阅读：化整为零",
        "description": "在 Foliole 中，阅读不必一次完成。 可以根据具体情境，选择让当前内容稍后展现（底部动作条中的 Soon，或按 1）、以后展现（Later，或按 2）、读了一段后下次再展现（Read，或按 3），或者读完后不再自动展现（Dismiss，或按 4）。",
        "summary": "在 Foliole 中，阅读不必一次完成。 可以根据具体情境，选择让当前内容稍后展现（底部动作条中的 Soon，或按 1）、以后展现（Later，或按 2）、读了一段后下次再展现（Read，或按 3），或者读完后不再自动展现（Dismiss，或按 4）。",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.reading-break-the-whole-into-pieces"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "在 Foliole 中，阅读不必一次完成。\n可以根据具体情境，选择让当前内容稍后展现（底部动作条中的 Soon，或按 1）、以后展现（Later，或按 2）、读了一段后下次再展现（Read，或按 3），或者读完后不再自动展现（Dismiss，或按 4）。",
            "id": "welcome-to-foliole.reading-break-the-whole-into-pieces-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.highlight-extract-the-essence",
        "slug": "welcome-to-foliole.highlight-extract-the-essence",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "高亮：摘录精华",
        "description": "选中想摘录的文本后，会出现浮动工具条。点击其中的 Highlight，或按 Alt + Z，高亮这段内容，并生成一个新的子主题。",
        "summary": "选中想摘录的文本后，会出现浮动工具条。点击其中的 Highlight，或按 Alt + Z，高亮这段内容，并生成一个新的子主题。",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.highlight-extract-the-essence"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "选中想摘录的文本后，会出现浮动工具条。点击其中的 Highlight，或按 Alt + Z，高亮这段内容，并生成一个新的子主题。",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.cloze-create-a-test-item",
        "slug": "welcome-to-foliole.cloze-create-a-test-item",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "挖空：生成检测",
        "description": "选中想检测的内容后，点击浮动工具条里的 Cloze（或按 Alt + X），生成一个以挖空内容为答案的检测项。",
        "summary": "选中想检测的内容后，点击浮动工具条里的 Cloze（或按 Alt + X），生成一个以挖空内容为答案的检测项。",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.cloze-create-a-test-item"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "选中想检测的内容后，点击浮动工具条里的 Cloze（或按 Alt + X），生成一个以挖空内容为答案的检测项。",
            "id": "welcome-to-foliole.cloze-create-a-test-item-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.test-make-it-stick",
        "slug": "welcome-to-foliole.test-make-it-stick",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "检测：强化记忆",
        "description": "挖空生成的检测项展现时，先尝试回想答案。 再在底部动作条中评分：不记得选 Again（或按 1），记得一些选 Hard（或按 2），记得选 Good（或按 3），太简单选 Easy（或按 4）。 评分会影响下次展现时间，检测本身也会强化记忆。",
        "summary": "挖空生成的检测项展现时，先尝试回想答案。 再在底部动作条中评分：不记得选 Again（或按 1），记得一些选 Hard（或按 2），记得选 Good（或按 3），太简单选 Easy（或按 4）。 评分会影响下次展现时间，检测本身也会强化记忆。",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.test-make-it-stick"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "挖空生成的检测项展现时，先尝试回想答案。\n再在底部动作条中评分：不记得选 Again（或按 1），记得一些选 Hard（或按 2），记得选 Good（或按 3），太简单选 Easy（或按 4）。\n评分会影响下次展现时间，检测本身也会强化记忆。",
            "id": "welcome-to-foliole.test-make-it-stick-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.rewrite-clarify-understanding",
        "slug": "welcome-to-foliole.rewrite-clarify-understanding",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "改写：澄清理解",
        "description": "在后续的回顾过程中，可以持续改写材料，让它更容易理解和记忆。",
        "summary": "在后续的回顾过程中，可以持续改写材料，让它更容易理解和记忆。",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.rewrite-clarify-understanding"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "在后续的回顾过程中，可以持续改写材料，让它更容易理解和记忆。",
            "id": "welcome-to-foliole.rewrite-clarify-understanding-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.schedule-show-it-at-the-right-time",
        "slug": "welcome-to-foliole.schedule-show-it-at-the-right-time",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "调度：适时展现",
        "description": "材料优先级、阅读动作和检测评分会共同影响系统调度，让材料在合适的时候再次展现。",
        "summary": "材料优先级、阅读动作和检测评分会共同影响系统调度，让材料在合适的时候再次展现。",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.schedule-show-it-at-the-right-time"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "材料优先级、阅读动作和检测评分会共同影响系统调度，让材料在合适的时候再次展现。",
            "id": "welcome-to-foliole.schedule-show-it-at-the-right-time-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "welcome-to-foliole.repeat-internalize-knowledge",
        "slug": "welcome-to-foliole.repeat-internalize-knowledge",
        "parentId": "welcome-to-foliole",
        "childTopicIds": [],
        "title": "重复：内化知识",
        "description": "间隔重复，让知识逐步内化。 渐进阅读，让阅读真正完成。 Foliole，让渐进阅读流畅发生。",
        "summary": "间隔重复，让知识逐步内化。 渐进阅读，让阅读真正完成。 Foliole，让渐进阅读流畅发生。",
        "runtime": {
          "state": "topic",
          "topicId": "welcome-to-foliole.repeat-internalize-knowledge"
        },
        "readingSeed": {
          "intervalDurationMs": 0,
          "intervalGrowthFactor": 1,
          "lastHandledAt": {
            "dayOffset": 0
          },
          "nextAt": {
            "dayOffset": 0
          },
          "priority": 0,
          "readingPosition": 0,
          "repetitionCount": 0,
          "state": "active"
        },
        "blocks": [
          {
            "kind": "paragraph",
            "text": "间隔重复，让知识逐步内化。\n渐进阅读，让阅读真正完成。\nFoliole，让渐进阅读流畅发生。",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  }
};
export const GENERATED_DEMO_PACK: DemoPack = GENERATED_DEMO_PACKS.en!;

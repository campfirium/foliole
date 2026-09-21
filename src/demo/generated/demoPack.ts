import type { DemoPack } from '../demoPack';

export const GENERATED_DEMO_PACKS: Record<string, DemoPack> = {
  "de": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "de",
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
        "title": "Willkommen bei Foliole",
        "description": "Klicke zuerst in der unteren Aktionsleiste auf Read, oder drücke 3 beziehungsweise F.",
        "summary": "Klicke zuerst in der unteren Aktionsleiste auf Read, oder drücke 3 beziehungsweise F.",
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
            "text": "Klicke zuerst in der unteren Aktionsleiste auf Read, oder drücke 3 beziehungsweise F.",
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
        "title": "Lesen: Das Ganze in Teile zerlegen",
        "description": "Lesen muss nicht in einem Durchgang abgeschlossen werden. Je nach Situation kannst du den aktuellen Inhalt bald wieder anzeigen lassen (Soon in der unteren Aktionsleiste oder Taste 1), ihn später anzeigen lassen (Later oder Taste 2), ihn nach einem Lesedurchgang erneut einplanen (Read oder Taste 3) oder die automatische Anzeige beenden, wenn du fertig bist (Dismiss oder Taste 4).",
        "summary": "Lesen muss nicht in einem Durchgang abgeschlossen werden. Je nach Situation kannst du den aktuellen Inhalt bald wieder anzeigen lassen (Soon in der unteren Aktionsleiste oder Taste 1), ihn später anzeigen lassen (Later oder Taste 2), ihn nach einem Lesedurchgang erneut einplanen (Read oder Taste 3) oder die automatische Anzeige beenden, wenn du fertig bist (Dismiss oder Taste 4).",
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
            "text": "Lesen muss nicht in einem Durchgang abgeschlossen werden.\nJe nach Situation kannst du den aktuellen Inhalt bald wieder anzeigen lassen (Soon in der unteren Aktionsleiste oder Taste 1), ihn später anzeigen lassen (Later oder Taste 2), ihn nach einem Lesedurchgang erneut einplanen (Read oder Taste 3) oder die automatische Anzeige beenden, wenn du fertig bist (Dismiss oder Taste 4).",
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
        "title": "Hervorheben: Das Wesentliche herausarbeiten",
        "description": "Markiere den Text, den du herauslösen möchtest. Daraufhin erscheint die schwebende Werkzeugleiste.",
        "summary": "Markiere den Text, den du herauslösen möchtest. Daraufhin erscheint die schwebende Werkzeugleiste.",
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
            "text": "Markiere den Text, den du herauslösen möchtest. Daraufhin erscheint die schwebende Werkzeugleiste.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Wähle dort Hervorheben oder drücke Alt + Z, um die Passage hervorzuheben und daraus ein neues untergeordnetes Thema zu erstellen.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "Lückentext: Eine Testfrage erstellen",
        "description": "Markiere den Text, den du abfragen möchtest. Wähle in der schwebenden Werkzeugleiste Lückentext oder drücke Alt + X. Foliole erstellt ein Testelement, bei dem du dich an den ausgeblendeten Teil erinnern sollst.",
        "summary": "Markiere den Text, den du abfragen möchtest. Wähle in der schwebenden Werkzeugleiste Lückentext oder drücke Alt + X. Foliole erstellt ein Testelement, bei dem du dich an den ausgeblendeten Teil erinnern sollst.",
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
            "text": "Markiere den Text, den du abfragen möchtest.\nWähle in der schwebenden Werkzeugleiste Lückentext oder drücke Alt + X.\nFoliole erstellt ein Testelement, bei dem du dich an den ausgeblendeten Teil erinnern sollst.",
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
        "title": "Testen: Wissen verankern",
        "description": "Wenn ein aus einem Lückentext erstelltes Testelement erscheint, versuche zuerst, dich an die Antwort zu erinnern. Bewerte sie anschließend in der unteren Aktionsleiste: Wähle Schon wieder, wenn du sie nicht wusstest (oder drücke 1), Schwer, wenn du dich teilweise erinnert hast (oder drücke 2), Gut, wenn du dich erinnert hast (oder drücke 3), und Einfach, wenn sie zu leicht war (oder drücke 4). Deine Bewertung beeinflusst, wann das Testelement erneut erscheint. Auch das aktive Abrufen selbst stärkt das Gedächtnis.",
        "summary": "Wenn ein aus einem Lückentext erstelltes Testelement erscheint, versuche zuerst, dich an die Antwort zu erinnern. Bewerte sie anschließend in der unteren Aktionsleiste: Wähle Schon wieder, wenn du sie nicht wusstest (oder drücke 1), Schwer, wenn du dich teilweise erinnert hast (oder drücke 2), Gut, wenn du dich erinnert hast (oder drücke 3), und Einfach, wenn sie zu leicht war (oder drücke 4). Deine Bewertung beeinflusst, wann das Testelement erneut erscheint. Auch das aktive Abrufen selbst stärkt das Gedächtnis.",
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
            "text": "Wenn ein aus einem Lückentext erstelltes Testelement erscheint, versuche zuerst, dich an die Antwort zu erinnern.\nBewerte sie anschließend in der unteren Aktionsleiste: Wähle Schon wieder, wenn du sie nicht wusstest (oder drücke 1), Schwer, wenn du dich teilweise erinnert hast (oder drücke 2), Gut, wenn du dich erinnert hast (oder drücke 3), und Einfach, wenn sie zu leicht war (oder drücke 4).\nDeine Bewertung beeinflusst, wann das Testelement erneut erscheint. Auch das aktive Abrufen selbst stärkt das Gedächtnis.",
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
        "title": "Überarbeiten: Verständnis klären",
        "description": "Bei späteren Wiederholungen kannst du das Material weiter überarbeiten, damit es leichter zu verstehen und zu behalten ist.",
        "summary": "Bei späteren Wiederholungen kannst du das Material weiter überarbeiten, damit es leichter zu verstehen und zu behalten ist.",
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
            "text": "Bei späteren Wiederholungen kannst du das Material weiter überarbeiten, damit es leichter zu verstehen und zu behalten ist.",
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
        "title": "Planen: Zum richtigen Zeitpunkt anzeigen",
        "description": "Die Priorität des Materials, deine Leseaktionen und deine Testergebnisse fließen gemeinsam in die Planung von Foliole ein, damit das Material zum passenden Zeitpunkt erneut erscheint.",
        "summary": "Die Priorität des Materials, deine Leseaktionen und deine Testergebnisse fließen gemeinsam in die Planung von Foliole ein, damit das Material zum passenden Zeitpunkt erneut erscheint.",
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
            "text": "Die Priorität des Materials, deine Leseaktionen und deine Testergebnisse fließen gemeinsam in die Planung von Foliole ein, damit das Material zum passenden Zeitpunkt erneut erscheint.",
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
        "title": "Wiederholen: Wissen verinnerlichen",
        "description": "Verteilte Wiederholung hilft dir, Wissen Schritt für Schritt zu verinnerlichen. Inkrementelles Lesen hilft dir, Lektüre tatsächlich abzuschließen. Foliole macht inkrementelles Lesen zu einem flüssigen Ablauf.",
        "summary": "Verteilte Wiederholung hilft dir, Wissen Schritt für Schritt zu verinnerlichen. Inkrementelles Lesen hilft dir, Lektüre tatsächlich abzuschließen. Foliole macht inkrementelles Lesen zu einem flüssigen Ablauf.",
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
            "text": "Verteilte Wiederholung hilft dir, Wissen Schritt für Schritt zu verinnerlichen.\nInkrementelles Lesen hilft dir, Lektüre tatsächlich abzuschließen.\nFoliole macht inkrementelles Lesen zu einem flüssigen Ablauf.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "Wofür die Foliole-Demo gedacht ist",
        "description": "Vielleicht nutzt du SuperMemo schon lange und möchtest sehen, was Foliole anders macht.",
        "summary": "Vielleicht nutzt du SuperMemo schon lange und möchtest sehen, was Foliole anders macht.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "Vielleicht nutzt du SuperMemo schon lange und möchtest sehen, was Foliole anders macht.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Vielleicht arbeitest du intensiv mit Obsidian oder anderen Lese- und Notizwerkzeugen und möchtest mit deinem Material über Lesen und Hervorheben hinausgehen.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "Vielleicht ist inkrementelles Lesen neu für dich und du weißt noch nicht, ob es zu dir passt.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Damit du Foliole direkt ausprobieren kannst, haben wir diese Online-Demo erstellt.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "Eine Installation ist nicht erforderlich. Öffne die Seite und probiere Foliole direkt im Browser aus. Hier kannst du die Foliole Guides lesen, die laufend erweitert werden, oder eigene Markdown-Dokumente importieren und den grundlegenden Ablauf des inkrementellen Lesens durchgehen.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "Die Online-Demo verwendet simulierte Datumswerte, damit du die Materialplanung von Foliole schnell erleben kannst. In den Einstellungen findest du die Vorschau der Desktop-Einstellungen. Sie zeigt die vollständigen Desktop-Einstellungen und vermittelt dir einen Überblick über den Funktionsumfang von Foliole. Änderungen dort wirken sich nicht auf die Online-Demo aus.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "Die Online-Demo speichert Daten lokal in deinem Browser. Verwende sie daher nicht als einzige Sicherung. Außerdem fehlen viele zentrale Desktop-Funktionen, darunter die Anzeige von PDF-, EPUB- und Bilddateien, externe Dokumentbibliotheken, die erweiterte Suche, die Integration mit Obsidian und Readwise Reader, Markdown-Spiegelungen, die Synchronisierung im lokalen Netzwerk und weitere Funktionen.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "Die Online-Demo wird gemeinsam mit der Desktop-App weiterentwickelt und kann eigene, von der Desktop-Version abweichende Probleme haben. Über die linke Seitenleiste kannst du direkt Feedback senden. Du kannst das Projekt außerdem auf GitHub verfolgen, Probleme melden oder dich an Diskussionen beteiligen.",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
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
            "text": "Select the text you want to extract. The floating toolbar will appear.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Use Highlight there, or press Alt + Z, to highlight the passage and create a new child Topic.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "What the Foliole Demo Is For",
        "description": "Maybe you are a longtime SuperMemo user and want to see how Foliole is different.",
        "summary": "Maybe you are a longtime SuperMemo user and want to see how Foliole is different.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "Maybe you are a longtime SuperMemo user and want to see how Foliole is different.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Maybe you use Obsidian or other reading and note-taking tools heavily, and want your material to go beyond reading and highlighting.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "Maybe you are new to incremental reading and still not sure whether it fits you.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "To make Foliole easier to experience directly, we built this online demo.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "No installation is required. Open the page and start trying it in your browser. You can read the Foliole Guides here, which will continue to be updated over time, or import your own Markdown documents and work through the core incremental reading flow.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "The online demo provides simulated dates so you can quickly experience Foliole's material scheduling. The settings panel includes a Desktop Settings Preview: this panel shows the full desktop settings, so you can understand Foliole’s feature structure. Changes there do not affect the online demo.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "The online demo stores data locally in your browser, so please do not treat it as your only backup. It also does not include many core desktop features, including PDF / EPUB / image viewing, external document libraries, enhanced search, Obsidian integration, Readwise Reader integration, Markdown mirrors, LAN sync, and more.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "The online demo will continue to update alongside the desktop app, and it may have issues that differ from the desktop version. You can submit feedback directly from the left sidebar, and you are also welcome to follow the project, report issues, or join the discussion on GitHub.",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "es": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "es",
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
        "title": "Te damos la bienvenida a Foliole",
        "description": "Empieza haciendo clic en Read en la barra de acciones inferior, o pulsa 3 o F.",
        "summary": "Empieza haciendo clic en Read en la barra de acciones inferior, o pulsa 3 o F.",
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
            "text": "Empieza haciendo clic en Read en la barra de acciones inferior, o pulsa 3 o F.",
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
        "title": "Lectura: Divide el conjunto en partes",
        "description": "No es necesario terminar una lectura de una sola vez. Según el contexto, puedes hacer que el contenido actual vuelva a aparecer pronto (Soon en la barra de acciones inferior, o pulsa 1), más adelante (Later, o pulsa 2), después de otra pasada de lectura (Read, o pulsa 3), o dejar de mostrarlo automáticamente cuando hayas terminado (Dismiss, o pulsa 4).",
        "summary": "No es necesario terminar una lectura de una sola vez. Según el contexto, puedes hacer que el contenido actual vuelva a aparecer pronto (Soon en la barra de acciones inferior, o pulsa 1), más adelante (Later, o pulsa 2), después de otra pasada de lectura (Read, o pulsa 3), o dejar de mostrarlo automáticamente cuando hayas terminado (Dismiss, o pulsa 4).",
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
            "text": "No es necesario terminar una lectura de una sola vez.\nSegún el contexto, puedes hacer que el contenido actual vuelva a aparecer pronto (Soon en la barra de acciones inferior, o pulsa 1), más adelante (Later, o pulsa 2), después de otra pasada de lectura (Read, o pulsa 3), o dejar de mostrarlo automáticamente cuando hayas terminado (Dismiss, o pulsa 4).",
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
        "title": "Destacado: Extrae lo esencial",
        "description": "Selecciona el texto que quieres extraer. Aparecerá la barra de herramientas flotante.",
        "summary": "Selecciona el texto que quieres extraer. Aparecerá la barra de herramientas flotante.",
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
            "text": "Selecciona el texto que quieres extraer. Aparecerá la barra de herramientas flotante.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Usa Destacado en esa barra, o pulsa Alt + Z, para resaltar el pasaje y crear un nuevo Tema secundario.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "Cloze: Crea un elemento de prueba",
        "description": "Selecciona el texto que quieres poner a prueba. Usa Cloze en la barra de herramientas flotante, o pulsa Alt + X. Foliole crea un elemento que te pide recordar la parte oculta.",
        "summary": "Selecciona el texto que quieres poner a prueba. Usa Cloze en la barra de herramientas flotante, o pulsa Alt + X. Foliole crea un elemento que te pide recordar la parte oculta.",
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
            "text": "Selecciona el texto que quieres poner a prueba.\nUsa Cloze en la barra de herramientas flotante, o pulsa Alt + X.\nFoliole crea un elemento que te pide recordar la parte oculta.",
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
        "title": "Prueba: Consolida lo aprendido",
        "description": "Cuando aparezca un elemento creado a partir de un Cloze, intenta recordar primero la respuesta. Después, puntúalo en la barra de acciones inferior: elige Otra vez si no lo recordaste (o pulsa 1), Duro si lo recordaste en parte (o pulsa 2), Bueno si lo recordaste (o pulsa 3) y Fácil si fue demasiado sencillo (o pulsa 4). La puntuación influye en cuándo volverá a aparecer, y el propio acto de ponerte a prueba ayuda a reforzar la memoria.",
        "summary": "Cuando aparezca un elemento creado a partir de un Cloze, intenta recordar primero la respuesta. Después, puntúalo en la barra de acciones inferior: elige Otra vez si no lo recordaste (o pulsa 1), Duro si lo recordaste en parte (o pulsa 2), Bueno si lo recordaste (o pulsa 3) y Fácil si fue demasiado sencillo (o pulsa 4). La puntuación influye en cuándo volverá a aparecer, y el propio acto de ponerte a prueba ayuda a reforzar la memoria.",
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
            "text": "Cuando aparezca un elemento creado a partir de un Cloze, intenta recordar primero la respuesta.\nDespués, puntúalo en la barra de acciones inferior: elige Otra vez si no lo recordaste (o pulsa 1), Duro si lo recordaste en parte (o pulsa 2), Bueno si lo recordaste (o pulsa 3) y Fácil si fue demasiado sencillo (o pulsa 4).\nLa puntuación influye en cuándo volverá a aparecer, y el propio acto de ponerte a prueba ayuda a reforzar la memoria.",
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
        "title": "Reescritura: Aclara lo que entiendes",
        "description": "En revisiones posteriores puedes seguir reescribiendo el material para que resulte más fácil de entender y recordar.",
        "summary": "En revisiones posteriores puedes seguir reescribiendo el material para que resulte más fácil de entender y recordar.",
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
            "text": "En revisiones posteriores puedes seguir reescribiendo el material para que resulte más fácil de entender y recordar.",
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
        "title": "Programación: Muéstralo en el momento adecuado",
        "description": "La prioridad del material, las acciones de lectura y las puntuaciones de las pruebas contribuyen a la programación de Foliole para que el material vuelva a aparecer en el momento adecuado.",
        "summary": "La prioridad del material, las acciones de lectura y las puntuaciones de las pruebas contribuyen a la programación de Foliole para que el material vuelva a aparecer en el momento adecuado.",
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
            "text": "La prioridad del material, las acciones de lectura y las puntuaciones de las pruebas contribuyen a la programación de Foliole para que el material vuelva a aparecer en el momento adecuado.",
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
        "title": "Repetición: Interioriza el conocimiento",
        "description": "La repetición espaciada permite interiorizar el conocimiento paso a paso. La lectura incremental hace posible terminar de verdad lo que lees. Foliole consigue que la lectura incremental sea fluida.",
        "summary": "La repetición espaciada permite interiorizar el conocimiento paso a paso. La lectura incremental hace posible terminar de verdad lo que lees. Foliole consigue que la lectura incremental sea fluida.",
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
            "text": "La repetición espaciada permite interiorizar el conocimiento paso a paso.\nLa lectura incremental hace posible terminar de verdad lo que lees.\nFoliole consigue que la lectura incremental sea fluida.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "Para qué sirve la demo de Foliole",
        "description": "Quizá lleves años usando SuperMemo y quieras saber en qué se diferencia Foliole.",
        "summary": "Quizá lleves años usando SuperMemo y quieras saber en qué se diferencia Foliole.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "Quizá lleves años usando SuperMemo y quieras saber en qué se diferencia Foliole.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Quizá uses intensamente Obsidian u otras herramientas de lectura y toma de notas, y quieras que tu material vaya más allá de leer y resaltar.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "Quizá acabes de descubrir la lectura incremental y todavía no sepas si encaja contigo.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Para que puedas probar Foliole de forma directa, hemos creado esta demo en línea.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "No necesitas instalar nada. Abre la página y empieza a probarla en el navegador. Aquí puedes leer las Foliole Guides, que seguirán ampliándose con el tiempo, o importar tus propios documentos Markdown y recorrer el flujo fundamental de la lectura incremental.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "La demo en línea utiliza fechas simuladas para que puedas experimentar rápidamente la programación del material de Foliole. El panel de configuración incluye la Vista previa de la configuración del escritorio, que muestra toda la configuración de escritorio para ayudarte a comprender la estructura de funciones de Foliole. Los cambios que hagas allí no afectan a la demo en línea.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "La demo en línea guarda los datos de forma local en el navegador, así que no la uses como única copia de seguridad. Tampoco incluye muchas funciones esenciales de la aplicación de escritorio, como la visualización de PDF, EPUB e imágenes, las bibliotecas de documentos externos, la búsqueda mejorada, las integraciones con Obsidian y Readwise Reader, los reflejos Markdown, la sincronización por red local y otras funciones.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "La demo en línea seguirá evolucionando junto con la aplicación de escritorio y puede presentar problemas diferentes a los de esa versión. Puedes enviar comentarios directamente desde la barra lateral izquierda. También puedes seguir el proyecto, informar de problemas o participar en la conversación en GitHub.",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "fr": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "fr",
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
        "title": "Bienvenue dans Foliole",
        "description": "Commencez par cliquer sur Read dans la barre d’actions inférieure, ou appuyez sur 3 ou F.",
        "summary": "Commencez par cliquer sur Read dans la barre d’actions inférieure, ou appuyez sur 3 ou F.",
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
            "text": "Commencez par cliquer sur Read dans la barre d’actions inférieure, ou appuyez sur 3 ou F.",
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
        "title": "Lecture : Découper l’ensemble en plusieurs parties",
        "description": "Une lecture n’a pas besoin d’être terminée en une seule fois. Selon le contexte, vous pouvez faire réapparaître le contenu actuel bientôt (Soon dans la barre d’actions inférieure, ou touche 1), plus tard (Later, ou touche 2), après un nouveau passage de lecture (Read, ou touche 3), ou ne plus l’afficher automatiquement une fois terminé (Dismiss, ou touche 4).",
        "summary": "Une lecture n’a pas besoin d’être terminée en une seule fois. Selon le contexte, vous pouvez faire réapparaître le contenu actuel bientôt (Soon dans la barre d’actions inférieure, ou touche 1), plus tard (Later, ou touche 2), après un nouveau passage de lecture (Read, ou touche 3), ou ne plus l’afficher automatiquement une fois terminé (Dismiss, ou touche 4).",
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
            "text": "Une lecture n’a pas besoin d’être terminée en une seule fois.\nSelon le contexte, vous pouvez faire réapparaître le contenu actuel bientôt (Soon dans la barre d’actions inférieure, ou touche 1), plus tard (Later, ou touche 2), après un nouveau passage de lecture (Read, ou touche 3), ou ne plus l’afficher automatiquement une fois terminé (Dismiss, ou touche 4).",
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
        "title": "Point culminant : Extraire l’essentiel",
        "description": "Sélectionnez le texte que vous souhaitez extraire. La barre d’outils flottante apparaît.",
        "summary": "Sélectionnez le texte que vous souhaitez extraire. La barre d’outils flottante apparaît.",
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
            "text": "Sélectionnez le texte que vous souhaitez extraire. La barre d’outils flottante apparaît.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Choisissez Point culminant dans cette barre, ou appuyez sur Alt + Z, pour surligner le passage et créer un nouveau Sujet enfant.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "Cloze : Créer un élément de test",
        "description": "Sélectionnez le texte que vous souhaitez tester. Choisissez Cloze dans la barre d’outils flottante, ou appuyez sur Alt + X. Foliole crée un élément qui vous demande de retrouver la partie masquée.",
        "summary": "Sélectionnez le texte que vous souhaitez tester. Choisissez Cloze dans la barre d’outils flottante, ou appuyez sur Alt + X. Foliole crée un élément qui vous demande de retrouver la partie masquée.",
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
            "text": "Sélectionnez le texte que vous souhaitez tester.\nChoisissez Cloze dans la barre d’outils flottante, ou appuyez sur Alt + X.\nFoliole crée un élément qui vous demande de retrouver la partie masquée.",
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
        "title": "Test : Ancrer les connaissances",
        "description": "Lorsqu’un élément créé à partir d’un Cloze apparaît, essayez d’abord de vous rappeler la réponse. Évaluez-la ensuite dans la barre d’actions inférieure : choisissez Encore une fois si vous l’avez oubliée (ou appuyez sur 1), Difficile si vous vous en souvenez partiellement (ou appuyez sur 2), Bon si vous vous en souvenez (ou appuyez sur 3), et Facile si la réponse était trop évidente (ou appuyez sur 4). Votre évaluation détermine quand l’élément réapparaîtra, et le fait de vous tester renforce lui-même la mémoire.",
        "summary": "Lorsqu’un élément créé à partir d’un Cloze apparaît, essayez d’abord de vous rappeler la réponse. Évaluez-la ensuite dans la barre d’actions inférieure : choisissez Encore une fois si vous l’avez oubliée (ou appuyez sur 1), Difficile si vous vous en souvenez partiellement (ou appuyez sur 2), Bon si vous vous en souvenez (ou appuyez sur 3), et Facile si la réponse était trop évidente (ou appuyez sur 4). Votre évaluation détermine quand l’élément réapparaîtra, et le fait de vous tester renforce lui-même la mémoire.",
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
            "text": "Lorsqu’un élément créé à partir d’un Cloze apparaît, essayez d’abord de vous rappeler la réponse.\nÉvaluez-la ensuite dans la barre d’actions inférieure : choisissez Encore une fois si vous l’avez oubliée (ou appuyez sur 1), Difficile si vous vous en souvenez partiellement (ou appuyez sur 2), Bon si vous vous en souvenez (ou appuyez sur 3), et Facile si la réponse était trop évidente (ou appuyez sur 4).\nVotre évaluation détermine quand l’élément réapparaîtra, et le fait de vous tester renforce lui-même la mémoire.",
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
        "title": "Réécriture : Clarifier sa compréhension",
        "description": "Au fil des révisions, vous pouvez continuer à réécrire le contenu afin de le rendre plus facile à comprendre et à retenir.",
        "summary": "Au fil des révisions, vous pouvez continuer à réécrire le contenu afin de le rendre plus facile à comprendre et à retenir.",
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
            "text": "Au fil des révisions, vous pouvez continuer à réécrire le contenu afin de le rendre plus facile à comprendre et à retenir.",
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
        "title": "Planification : Afficher au bon moment",
        "description": "La priorité du contenu, vos actions de lecture et vos résultats aux tests alimentent ensemble la planification de Foliole afin que le contenu réapparaisse au bon moment.",
        "summary": "La priorité du contenu, vos actions de lecture et vos résultats aux tests alimentent ensemble la planification de Foliole afin que le contenu réapparaisse au bon moment.",
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
            "text": "La priorité du contenu, vos actions de lecture et vos résultats aux tests alimentent ensemble la planification de Foliole afin que le contenu réapparaisse au bon moment.",
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
        "title": "Répétition : Intérioriser les connaissances",
        "description": "La répétition espacée permet d’intérioriser les connaissances étape par étape. La lecture incrémentale aide à réellement terminer ses lectures. Foliole rend la lecture incrémentale fluide.",
        "summary": "La répétition espacée permet d’intérioriser les connaissances étape par étape. La lecture incrémentale aide à réellement terminer ses lectures. Foliole rend la lecture incrémentale fluide.",
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
            "text": "La répétition espacée permet d’intérioriser les connaissances étape par étape.\nLa lecture incrémentale aide à réellement terminer ses lectures.\nFoliole rend la lecture incrémentale fluide.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "À quoi sert la démo de Foliole",
        "description": "Vous utilisez peut-être SuperMemo depuis longtemps et souhaitez découvrir ce qui distingue Foliole.",
        "summary": "Vous utilisez peut-être SuperMemo depuis longtemps et souhaitez découvrir ce qui distingue Foliole.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "Vous utilisez peut-être SuperMemo depuis longtemps et souhaitez découvrir ce qui distingue Foliole.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Vous utilisez peut-être intensivement Obsidian ou d’autres outils de lecture et de prise de notes, et souhaitez aller plus loin que la simple lecture et le surlignage.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "La lecture incrémentale est peut-être nouvelle pour vous et vous ne savez pas encore si elle vous convient.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Nous avons créé cette démo en ligne pour vous permettre de découvrir Foliole directement.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "Aucune installation n’est nécessaire. Ouvrez la page et commencez à l’essayer dans votre navigateur. Vous pouvez y lire les Foliole Guides, qui continueront d’évoluer, ou importer vos propres documents Markdown et parcourir le flux essentiel de la lecture incrémentale.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "La démo en ligne utilise des dates simulées pour vous permettre d’expérimenter rapidement la planification du contenu dans Foliole. Le panneau des paramètres comprend l’Aperçu des paramètres du bureau : il présente l’ensemble des paramètres de la version de bureau afin de vous aider à comprendre la structure fonctionnelle de Foliole. Les modifications effectuées dans cet aperçu n’ont aucun effet sur la démo en ligne.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "La démo en ligne enregistre les données localement dans votre navigateur : ne la considérez donc pas comme votre unique sauvegarde. Elle n’inclut pas non plus de nombreuses fonctions essentielles de la version de bureau, notamment l’affichage des PDF, EPUB et images, les bibliothèques de documents externes, la recherche avancée, les intégrations Obsidian et Readwise Reader, les miroirs Markdown, la synchronisation sur le réseau local, entre autres.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "La démo en ligne continuera d’évoluer avec l’application de bureau et pourra rencontrer des problèmes différents de ceux de cette dernière. Vous pouvez envoyer vos commentaires directement depuis la barre latérale gauche. Vous pouvez également suivre le projet, signaler des problèmes ou participer aux discussions sur GitHub.",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "it": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "it",
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
        "title": "Benvenuto in Foliole",
        "description": "Per iniziare, fai clic su Read nella barra delle azioni in basso, oppure premi 3 o F.",
        "summary": "Per iniziare, fai clic su Read nella barra delle azioni in basso, oppure premi 3 o F.",
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
            "text": "Per iniziare, fai clic su Read nella barra delle azioni in basso, oppure premi 3 o F.",
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
        "title": "Lettura: Dividi l’insieme in parti",
        "description": "Non è necessario completare una lettura in un’unica volta. In base al contesto, puoi mostrare di nuovo presto il contenuto corrente (Soon nella barra delle azioni in basso, oppure premi 1), mostrarlo più avanti (Later, oppure premi 2), rivederlo dopo un altro passaggio di lettura (Read, oppure premi 3) o smettere di mostrarlo automaticamente quando hai finito (Dismiss, oppure premi 4).",
        "summary": "Non è necessario completare una lettura in un’unica volta. In base al contesto, puoi mostrare di nuovo presto il contenuto corrente (Soon nella barra delle azioni in basso, oppure premi 1), mostrarlo più avanti (Later, oppure premi 2), rivederlo dopo un altro passaggio di lettura (Read, oppure premi 3) o smettere di mostrarlo automaticamente quando hai finito (Dismiss, oppure premi 4).",
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
            "text": "Non è necessario completare una lettura in un’unica volta.\nIn base al contesto, puoi mostrare di nuovo presto il contenuto corrente (Soon nella barra delle azioni in basso, oppure premi 1), mostrarlo più avanti (Later, oppure premi 2), rivederlo dopo un altro passaggio di lettura (Read, oppure premi 3) o smettere di mostrarlo automaticamente quando hai finito (Dismiss, oppure premi 4).",
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
        "title": "Evidenzia: Estrai l’essenziale",
        "description": "Seleziona il testo che vuoi estrarre. Comparirà la barra degli strumenti mobile.",
        "summary": "Seleziona il testo che vuoi estrarre. Comparirà la barra degli strumenti mobile.",
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
            "text": "Seleziona il testo che vuoi estrarre. Comparirà la barra degli strumenti mobile.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Usa Evidenzia nella barra, oppure premi Alt + Z, per evidenziare il passaggio e creare un nuovo Argomento secondario.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "Cloze: Crea un elemento di verifica",
        "description": "Seleziona il testo che vuoi mettere alla prova. Usa Cloze nella barra degli strumenti mobile, oppure premi Alt + X. Foliole crea un elemento che ti chiede di ricordare la parte nascosta.",
        "summary": "Seleziona il testo che vuoi mettere alla prova. Usa Cloze nella barra degli strumenti mobile, oppure premi Alt + X. Foliole crea un elemento che ti chiede di ricordare la parte nascosta.",
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
            "text": "Seleziona il testo che vuoi mettere alla prova.\nUsa Cloze nella barra degli strumenti mobile, oppure premi Alt + X.\nFoliole crea un elemento che ti chiede di ricordare la parte nascosta.",
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
        "title": "Verifica: Consolida ciò che hai imparato",
        "description": "Quando compare un elemento creato da un Cloze, prova prima a ricordare la risposta. Poi valutala nella barra delle azioni in basso: scegli Ancora se non la ricordavi (oppure premi 1), Difficile se la ricordavi solo in parte (oppure premi 2), Bene se la ricordavi (oppure premi 3) e Facile se era troppo semplice (oppure premi 4). La valutazione determina quando l’elemento comparirà di nuovo, mentre il richiamo attivo aiuta di per sé a rafforzare la memoria.",
        "summary": "Quando compare un elemento creato da un Cloze, prova prima a ricordare la risposta. Poi valutala nella barra delle azioni in basso: scegli Ancora se non la ricordavi (oppure premi 1), Difficile se la ricordavi solo in parte (oppure premi 2), Bene se la ricordavi (oppure premi 3) e Facile se era troppo semplice (oppure premi 4). La valutazione determina quando l’elemento comparirà di nuovo, mentre il richiamo attivo aiuta di per sé a rafforzare la memoria.",
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
            "text": "Quando compare un elemento creato da un Cloze, prova prima a ricordare la risposta.\nPoi valutala nella barra delle azioni in basso: scegli Ancora se non la ricordavi (oppure premi 1), Difficile se la ricordavi solo in parte (oppure premi 2), Bene se la ricordavi (oppure premi 3) e Facile se era troppo semplice (oppure premi 4).\nLa valutazione determina quando l’elemento comparirà di nuovo, mentre il richiamo attivo aiuta di per sé a rafforzare la memoria.",
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
        "title": "Riscrittura: Chiarisci la comprensione",
        "description": "Durante le revisioni successive puoi continuare a riscrivere il materiale, rendendolo più facile da capire e ricordare.",
        "summary": "Durante le revisioni successive puoi continuare a riscrivere il materiale, rendendolo più facile da capire e ricordare.",
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
            "text": "Durante le revisioni successive puoi continuare a riscrivere il materiale, rendendolo più facile da capire e ricordare.",
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
        "title": "Pianificazione: Mostra al momento giusto",
        "description": "La priorità del materiale, le azioni di lettura e le valutazioni delle verifiche contribuiscono insieme alla pianificazione di Foliole, così il materiale ricompare al momento giusto.",
        "summary": "La priorità del materiale, le azioni di lettura e le valutazioni delle verifiche contribuiscono insieme alla pianificazione di Foliole, così il materiale ricompare al momento giusto.",
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
            "text": "La priorità del materiale, le azioni di lettura e le valutazioni delle verifiche contribuiscono insieme alla pianificazione di Foliole, così il materiale ricompare al momento giusto.",
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
        "title": "Ripetizione: Interiorizza la conoscenza",
        "description": "La ripetizione dilazionata permette di interiorizzare la conoscenza passo dopo passo. La lettura incrementale aiuta a completare davvero ciò che leggi. Foliole rende fluida la lettura incrementale.",
        "summary": "La ripetizione dilazionata permette di interiorizzare la conoscenza passo dopo passo. La lettura incrementale aiuta a completare davvero ciò che leggi. Foliole rende fluida la lettura incrementale.",
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
            "text": "La ripetizione dilazionata permette di interiorizzare la conoscenza passo dopo passo.\nLa lettura incrementale aiuta a completare davvero ciò che leggi.\nFoliole rende fluida la lettura incrementale.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "A cosa serve la demo di Foliole",
        "description": "Forse usi SuperMemo da molto tempo e vuoi capire in che modo Foliole è diverso.",
        "summary": "Forse usi SuperMemo da molto tempo e vuoi capire in che modo Foliole è diverso.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "Forse usi SuperMemo da molto tempo e vuoi capire in che modo Foliole è diverso.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Forse utilizzi intensamente Obsidian o altri strumenti per leggere e prendere appunti e vuoi che il tuo materiale vada oltre la lettura e l’evidenziazione.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "Forse hai appena scoperto la lettura incrementale e non sai ancora se fa per te.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Abbiamo creato questa demo online per permetterti di provare Foliole direttamente.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "Non serve installare nulla. Apri la pagina e inizia a provarla nel browser. Qui puoi leggere le Foliole Guides, che continueranno ad arricchirsi nel tempo, oppure importare i tuoi documenti Markdown e sperimentare il flusso fondamentale della lettura incrementale.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "La demo online utilizza date simulate per farti sperimentare rapidamente la pianificazione del materiale in Foliole. Il pannello delle impostazioni include l’Anteprima impostazioni desktop: mostra tutte le impostazioni della versione desktop per aiutarti a comprenderne la struttura delle funzioni. Le modifiche effettuate in questa anteprima non influiscono sulla demo online.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "La demo online salva i dati localmente nel browser, quindi non usarla come unica copia di sicurezza. Inoltre non include molte funzioni fondamentali della versione desktop, tra cui la visualizzazione di PDF, EPUB e immagini, le librerie di documenti esterni, la ricerca avanzata, le integrazioni con Obsidian e Readwise Reader, i mirror Markdown, la sincronizzazione sulla rete locale e altro ancora.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "La demo online continuerà a evolversi insieme all’app desktop e potrebbe presentare problemi diversi da quelli della versione desktop. Puoi inviare un feedback direttamente dalla barra laterale sinistra. Puoi anche seguire il progetto, segnalare problemi o partecipare alla discussione su GitHub.",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "ja": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "ja",
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
        "title": "Folioleへようこそ",
        "description": "まず、下部のアクションバーにあるReadをクリックするか、3またはFを押してください。",
        "summary": "まず、下部のアクションバーにあるReadをクリックするか、3またはFを押してください。",
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
            "text": "まず、下部のアクションバーにあるReadをクリックするか、3またはFを押してください。",
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
        "title": "読む：全体を小さく分ける",
        "description": "一度で最後まで読み切る必要はありません。 状況に応じて、現在の内容をすぐに再表示する（下部のアクションバーでSoon、または1を押す）、後で表示する（Later、または2を押す）、ひと区切り読んだ後にもう一度表示する（Read、または3を押す）、読み終えたら自動表示を終了する（Dismiss、または4を押す）から選べます。",
        "summary": "一度で最後まで読み切る必要はありません。 状況に応じて、現在の内容をすぐに再表示する（下部のアクションバーでSoon、または1を押す）、後で表示する（Later、または2を押す）、ひと区切り読んだ後にもう一度表示する（Read、または3を押す）、読み終えたら自動表示を終了する（Dismiss、または4を押す）から選べます。",
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
            "text": "一度で最後まで読み切る必要はありません。\n状況に応じて、現在の内容をすぐに再表示する（下部のアクションバーでSoon、または1を押す）、後で表示する（Later、または2を押す）、ひと区切り読んだ後にもう一度表示する（Read、または3を押す）、読み終えたら自動表示を終了する（Dismiss、または4を押す）から選べます。",
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
        "title": "ハイライト：要点を取り出す",
        "description": "取り出したいテキストを選択すると、フローティングツールバーが表示されます。",
        "summary": "取り出したいテキストを選択すると、フローティングツールバーが表示されます。",
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
            "text": "取り出したいテキストを選択すると、フローティングツールバーが表示されます。",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "そこでハイライトを選ぶかAlt + Zを押すと、その箇所がハイライトされ、新しい子トピックが作成されます。",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "クローズ：テスト項目を作る",
        "description": "覚えているか確かめたいテキストを選択します。 フローティングツールバーでクローズを選ぶか、Alt + Xを押します。 Folioleは、隠された部分を思い出すための項目を作成します。",
        "summary": "覚えているか確かめたいテキストを選択します。 フローティングツールバーでクローズを選ぶか、Alt + Xを押します。 Folioleは、隠された部分を思い出すための項目を作成します。",
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
            "text": "覚えているか確かめたいテキストを選択します。\nフローティングツールバーでクローズを選ぶか、Alt + Xを押します。\nFolioleは、隠された部分を思い出すための項目を作成します。",
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
        "title": "テスト：記憶に定着させる",
        "description": "クローズから作成した項目が表示されたら、まず答えを思い出してみましょう。 次に、下部のアクションバーで評価します。思い出せなかった場合は再び（または1）、一部だけ思い出せた場合はハード（または2）、思い出せた場合は良い（または3）、簡単すぎた場合は簡単（または4）を選びます。 評価によって次に表示される時期が変わり、思い出そうとする行為そのものも記憶を強化します。",
        "summary": "クローズから作成した項目が表示されたら、まず答えを思い出してみましょう。 次に、下部のアクションバーで評価します。思い出せなかった場合は再び（または1）、一部だけ思い出せた場合はハード（または2）、思い出せた場合は良い（または3）、簡単すぎた場合は簡単（または4）を選びます。 評価によって次に表示される時期が変わり、思い出そうとする行為そのものも記憶を強化します。",
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
            "text": "クローズから作成した項目が表示されたら、まず答えを思い出してみましょう。\n次に、下部のアクションバーで評価します。思い出せなかった場合は再び（または1）、一部だけ思い出せた場合はハード（または2）、思い出せた場合は良い（または3）、簡単すぎた場合は簡単（または4）を選びます。\n評価によって次に表示される時期が変わり、思い出そうとする行為そのものも記憶を強化します。",
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
        "title": "書き直す：理解を明確にする",
        "description": "後の復習でも内容を書き直し続けることで、より理解しやすく、覚えやすい形にできます。",
        "summary": "後の復習でも内容を書き直し続けることで、より理解しやすく、覚えやすい形にできます。",
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
            "text": "後の復習でも内容を書き直し続けることで、より理解しやすく、覚えやすい形にできます。",
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
        "title": "スケジュール：適切なタイミングで表示する",
        "description": "資料の優先度、読書アクション、テストの評価がFolioleのスケジュールに反映され、資料が適切なタイミングで再び表示されます。",
        "summary": "資料の優先度、読書アクション、テストの評価がFolioleのスケジュールに反映され、資料が適切なタイミングで再び表示されます。",
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
            "text": "資料の優先度、読書アクション、テストの評価がFolioleのスケジュールに反映され、資料が適切なタイミングで再び表示されます。",
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
        "title": "繰り返す：知識を身につける",
        "description": "間隔反復によって、知識を少しずつ身につけられます。 インクリメンタルリーディングによって、読書を実際に完了へ近づけられます。 Folioleは、インクリメンタルリーディングを滑らかな流れにします。",
        "summary": "間隔反復によって、知識を少しずつ身につけられます。 インクリメンタルリーディングによって、読書を実際に完了へ近づけられます。 Folioleは、インクリメンタルリーディングを滑らかな流れにします。",
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
            "text": "間隔反復によって、知識を少しずつ身につけられます。\nインクリメンタルリーディングによって、読書を実際に完了へ近づけられます。\nFolioleは、インクリメンタルリーディングを滑らかな流れにします。",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "Folioleデモでできること",
        "description": "長年SuperMemoを使っていて、Folioleとの違いを確かめたい方もいるでしょう。",
        "summary": "長年SuperMemoを使っていて、Folioleとの違いを確かめたい方もいるでしょう。",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "長年SuperMemoを使っていて、Folioleとの違いを確かめたい方もいるでしょう。",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Obsidianなどの読書・ノートツールを日常的に使い、資料を読む、ハイライトするだけで終わらせたくない方もいるでしょう。",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "インクリメンタルリーディングを初めて知り、自分に合うかまだ分からない方もいるでしょう。",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Folioleを直接体験しやすくするため、このオンラインデモを用意しました。",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "インストールは不要です。ページを開けば、ブラウザですぐに試せます。ここでは、今後も更新されるFoliole Guidesを読んだり、自分のMarkdown文書をインポートしてインクリメンタルリーディングの基本的な流れを体験したりできます。",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "オンラインデモでは日付をシミュレートできるため、Folioleによる資料のスケジューリングを短時間で試せます。設定パネルにはデスクトップ設定のプレビューがあり、デスクトップ版の設定全体を見ながらFolioleの機能構成を把握できます。ここで設定を変更しても、オンラインデモには反映されません。",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "オンラインデモのデータはブラウザ内に保存されます。唯一のバックアップとしては使用しないでください。また、PDF・EPUB・画像の表示、外部文書ライブラリ、検索機能の拡張、Obsidian連携、Readwise Reader連携、Markdownミラー、ローカルネットワーク同期など、デスクトップ版の主要機能の多くは含まれていません。",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "オンラインデモはデスクトップアプリとともに更新され、デスクトップ版とは異なる問題が起きることもあります。左サイドバーから直接フィードバックを送信できます。GitHubでプロジェクトをフォローしたり、問題を報告したり、議論に参加したりすることもできます。",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "ko": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "ko",
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
        "title": "Foliole에 오신 것을 환영합니다",
        "description": "먼저 하단 작업 표시줄에서 Read를 클릭하거나 3 또는 F를 누르세요.",
        "summary": "먼저 하단 작업 표시줄에서 Read를 클릭하거나 3 또는 F를 누르세요.",
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
            "text": "먼저 하단 작업 표시줄에서 Read를 클릭하거나 3 또는 F를 누르세요.",
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
        "title": "읽기: 전체를 작은 부분으로 나누기",
        "description": "읽기는 한 번에 끝낼 필요가 없습니다. 상황에 따라 현재 내용을 곧 다시 표시하거나(하단 작업 표시줄의 Soon 또는 1), 나중에 표시하거나(Later 또는 2), 한 차례 읽은 뒤 다시 표시하거나(Read 또는 3), 다 읽은 뒤에는 자동으로 표시하지 않도록 할 수 있습니다(Dismiss 또는 4).",
        "summary": "읽기는 한 번에 끝낼 필요가 없습니다. 상황에 따라 현재 내용을 곧 다시 표시하거나(하단 작업 표시줄의 Soon 또는 1), 나중에 표시하거나(Later 또는 2), 한 차례 읽은 뒤 다시 표시하거나(Read 또는 3), 다 읽은 뒤에는 자동으로 표시하지 않도록 할 수 있습니다(Dismiss 또는 4).",
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
            "text": "읽기는 한 번에 끝낼 필요가 없습니다.\n상황에 따라 현재 내용을 곧 다시 표시하거나(하단 작업 표시줄의 Soon 또는 1), 나중에 표시하거나(Later 또는 2), 한 차례 읽은 뒤 다시 표시하거나(Read 또는 3), 다 읽은 뒤에는 자동으로 표시하지 않도록 할 수 있습니다(Dismiss 또는 4).",
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
        "title": "하이라이트: 핵심만 추출하기",
        "description": "추출할 텍스트를 선택하면 플로팅 도구 모음이 나타납니다.",
        "summary": "추출할 텍스트를 선택하면 플로팅 도구 모음이 나타납니다.",
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
            "text": "추출할 텍스트를 선택하면 플로팅 도구 모음이 나타납니다.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "도구 모음에서 하이라이트를 선택하거나 Alt + Z를 눌러 해당 구절을 강조하고 새 하위 주제를 만드세요.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "클로즈: 테스트 항목 만들기",
        "description": "기억하는지 확인할 텍스트를 선택하세요. 플로팅 도구 모음에서 클로즈를 선택하거나 Alt + X를 누르세요. Foliole이 가려진 부분을 기억해 내도록 묻는 항목을 만듭니다.",
        "summary": "기억하는지 확인할 텍스트를 선택하세요. 플로팅 도구 모음에서 클로즈를 선택하거나 Alt + X를 누르세요. Foliole이 가려진 부분을 기억해 내도록 묻는 항목을 만듭니다.",
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
            "text": "기억하는지 확인할 텍스트를 선택하세요.\n플로팅 도구 모음에서 클로즈를 선택하거나 Alt + X를 누르세요.\nFoliole이 가려진 부분을 기억해 내도록 묻는 항목을 만듭니다.",
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
        "title": "테스트: 기억에 정착시키기",
        "description": "클로즈로 만든 항목이 나타나면 먼저 답을 떠올려 보세요. 그런 다음 하단 작업 표시줄에서 평가하세요. 기억하지 못했다면 다시(또는 1), 일부만 기억했다면 하드(또는 2), 기억했다면 좋음(또는 3), 너무 쉬웠다면 쉬움(또는 4)을 선택합니다. 평가는 항목이 다시 나타나는 시점에 영향을 주며, 답을 떠올리는 과정 자체도 기억을 강화합니다.",
        "summary": "클로즈로 만든 항목이 나타나면 먼저 답을 떠올려 보세요. 그런 다음 하단 작업 표시줄에서 평가하세요. 기억하지 못했다면 다시(또는 1), 일부만 기억했다면 하드(또는 2), 기억했다면 좋음(또는 3), 너무 쉬웠다면 쉬움(또는 4)을 선택합니다. 평가는 항목이 다시 나타나는 시점에 영향을 주며, 답을 떠올리는 과정 자체도 기억을 강화합니다.",
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
            "text": "클로즈로 만든 항목이 나타나면 먼저 답을 떠올려 보세요.\n그런 다음 하단 작업 표시줄에서 평가하세요. 기억하지 못했다면 다시(또는 1), 일부만 기억했다면 하드(또는 2), 기억했다면 좋음(또는 3), 너무 쉬웠다면 쉬움(또는 4)을 선택합니다.\n평가는 항목이 다시 나타나는 시점에 영향을 주며, 답을 떠올리는 과정 자체도 기억을 강화합니다.",
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
        "title": "다시 쓰기: 이해를 명확하게 하기",
        "description": "이후 복습에서도 자료를 계속 다듬어 쓰면 더 쉽게 이해하고 기억할 수 있습니다.",
        "summary": "이후 복습에서도 자료를 계속 다듬어 쓰면 더 쉽게 이해하고 기억할 수 있습니다.",
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
            "text": "이후 복습에서도 자료를 계속 다듬어 쓰면 더 쉽게 이해하고 기억할 수 있습니다.",
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
        "title": "일정: 알맞은 때에 표시하기",
        "description": "자료 우선순위, 읽기 작업, 테스트 평가는 모두 Foliole의 일정에 반영되어 자료가 알맞은 때에 다시 나타나도록 합니다.",
        "summary": "자료 우선순위, 읽기 작업, 테스트 평가는 모두 Foliole의 일정에 반영되어 자료가 알맞은 때에 다시 나타나도록 합니다.",
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
            "text": "자료 우선순위, 읽기 작업, 테스트 평가는 모두 Foliole의 일정에 반영되어 자료가 알맞은 때에 다시 나타나도록 합니다.",
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
        "title": "반복: 지식을 내 것으로 만들기",
        "description": "간격 반복은 지식을 단계적으로 내 것으로 만들게 해 줍니다. 점진적 읽기는 읽기를 실제로 끝까지 이어 가게 해 줍니다. Foliole은 점진적 읽기를 매끄러운 흐름으로 만듭니다.",
        "summary": "간격 반복은 지식을 단계적으로 내 것으로 만들게 해 줍니다. 점진적 읽기는 읽기를 실제로 끝까지 이어 가게 해 줍니다. Foliole은 점진적 읽기를 매끄러운 흐름으로 만듭니다.",
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
            "text": "간격 반복은 지식을 단계적으로 내 것으로 만들게 해 줍니다.\n점진적 읽기는 읽기를 실제로 끝까지 이어 가게 해 줍니다.\nFoliole은 점진적 읽기를 매끄러운 흐름으로 만듭니다.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "Foliole 데모에서 할 수 있는 일",
        "description": "오랫동안 SuperMemo를 사용해 왔고 Foliole이 어떻게 다른지 궁금할 수 있습니다.",
        "summary": "오랫동안 SuperMemo를 사용해 왔고 Foliole이 어떻게 다른지 궁금할 수 있습니다.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "오랫동안 SuperMemo를 사용해 왔고 Foliole이 어떻게 다른지 궁금할 수 있습니다.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Obsidian이나 다른 읽기·노트 도구를 자주 사용하며, 자료를 읽고 강조하는 데서 더 나아가고 싶을 수 있습니다.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "점진적 읽기를 처음 접해 아직 자신에게 맞는지 확신하지 못할 수도 있습니다.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Foliole을 더 쉽게 직접 체험할 수 있도록 이 온라인 데모를 만들었습니다.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "설치할 필요가 없습니다. 페이지를 열면 브라우저에서 바로 사용해 볼 수 있습니다. 여기서 계속 업데이트되는 Foliole Guides를 읽거나, 자신의 Markdown 문서를 가져와 점진적 읽기의 핵심 흐름을 체험할 수 있습니다.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "온라인 데모는 날짜를 시뮬레이션하여 Foliole의 자료 일정을 빠르게 체험할 수 있게 합니다. 설정 패널에는 데스크탑 설정 미리보기가 있으며, 데스크톱의 전체 설정을 보여 주어 Foliole의 기능 구성을 파악할 수 있게 합니다. 여기서 바꾼 설정은 온라인 데모에 영향을 주지 않습니다.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "온라인 데모는 데이터를 브라우저에 로컬로 저장하므로 유일한 백업으로 사용하지 마세요. 또한 PDF·EPUB·이미지 보기, 외부 문서 라이브러리, 향상된 검색, Obsidian 연동, Readwise Reader 연동, Markdown 미러, 로컬 네트워크 동기화 등 데스크톱의 여러 핵심 기능을 포함하지 않습니다.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "온라인 데모는 데스크톱 앱과 함께 계속 업데이트되며, 데스크톱 버전과는 다른 문제가 생길 수 있습니다. 왼쪽 사이드바에서 바로 피드백을 보낼 수 있습니다. GitHub에서 프로젝트를 팔로우하고, 문제를 보고하거나 토론에 참여하는 것도 환영합니다.",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "pl": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "pl",
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
        "title": "Witaj w Foliole",
        "description": "Zacznij od kliknięcia Read na dolnym pasku działań albo naciśnij 3 lub F.",
        "summary": "Zacznij od kliknięcia Read na dolnym pasku działań albo naciśnij 3 lub F.",
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
            "text": "Zacznij od kliknięcia Read na dolnym pasku działań albo naciśnij 3 lub F.",
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
        "title": "Czytanie: Podziel całość na części",
        "description": "Nie musisz kończyć czytania za jednym razem. W zależności od sytuacji możesz wyświetlić bieżącą treść ponownie wkrótce (Soon na dolnym pasku działań lub klawisz 1), później (Later lub klawisz 2), po kolejnym etapie czytania (Read lub klawisz 3) albo przestać wyświetlać ją automatycznie po zakończeniu (Dismiss lub klawisz 4).",
        "summary": "Nie musisz kończyć czytania za jednym razem. W zależności od sytuacji możesz wyświetlić bieżącą treść ponownie wkrótce (Soon na dolnym pasku działań lub klawisz 1), później (Later lub klawisz 2), po kolejnym etapie czytania (Read lub klawisz 3) albo przestać wyświetlać ją automatycznie po zakończeniu (Dismiss lub klawisz 4).",
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
            "text": "Nie musisz kończyć czytania za jednym razem.\nW zależności od sytuacji możesz wyświetlić bieżącą treść ponownie wkrótce (Soon na dolnym pasku działań lub klawisz 1), później (Later lub klawisz 2), po kolejnym etapie czytania (Read lub klawisz 3) albo przestać wyświetlać ją automatycznie po zakończeniu (Dismiss lub klawisz 4).",
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
        "title": "Zaznacz: Wyodrębnij to, co najważniejsze",
        "description": "Zaznacz tekst, który chcesz wyodrębnić. Pojawi się pływający pasek narzędzi.",
        "summary": "Zaznacz tekst, który chcesz wyodrębnić. Pojawi się pływający pasek narzędzi.",
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
            "text": "Zaznacz tekst, który chcesz wyodrębnić. Pojawi się pływający pasek narzędzi.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Wybierz na nim Zaznacz albo naciśnij Alt + Z, aby wyróżnić fragment i utworzyć z niego nowy Temat podrzędny.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "Zamknij: Utwórz element sprawdzający",
        "description": "Zaznacz tekst, który chcesz sprawdzić. Wybierz Zamknij na pływającym pasku narzędzi albo naciśnij Alt + X. Foliole utworzy element, który poprosi Cię o przypomnienie sobie ukrytej części.",
        "summary": "Zaznacz tekst, który chcesz sprawdzić. Wybierz Zamknij na pływającym pasku narzędzi albo naciśnij Alt + X. Foliole utworzy element, który poprosi Cię o przypomnienie sobie ukrytej części.",
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
            "text": "Zaznacz tekst, który chcesz sprawdzić.\nWybierz Zamknij na pływającym pasku narzędzi albo naciśnij Alt + X.\nFoliole utworzy element, który poprosi Cię o przypomnienie sobie ukrytej części.",
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
        "title": "Sprawdzanie: Utrwal wiedzę",
        "description": "Gdy pojawi się element utworzony przez Zamknij, najpierw spróbuj przypomnieć sobie odpowiedź. Następnie oceń ją na dolnym pasku działań: wybierz Znowu, jeśli odpowiedź umknęła (lub naciśnij 1), Ciężko, jeśli pamiętasz ją częściowo (lub naciśnij 2), Dobrze, jeśli ją pamiętasz (lub naciśnij 3), oraz Łatwe, jeśli była zbyt prosta (lub naciśnij 4). Ocena wpływa na termin ponownego wyświetlenia, a samo przywoływanie odpowiedzi wzmacnia pamięć.",
        "summary": "Gdy pojawi się element utworzony przez Zamknij, najpierw spróbuj przypomnieć sobie odpowiedź. Następnie oceń ją na dolnym pasku działań: wybierz Znowu, jeśli odpowiedź umknęła (lub naciśnij 1), Ciężko, jeśli pamiętasz ją częściowo (lub naciśnij 2), Dobrze, jeśli ją pamiętasz (lub naciśnij 3), oraz Łatwe, jeśli była zbyt prosta (lub naciśnij 4). Ocena wpływa na termin ponownego wyświetlenia, a samo przywoływanie odpowiedzi wzmacnia pamięć.",
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
            "text": "Gdy pojawi się element utworzony przez Zamknij, najpierw spróbuj przypomnieć sobie odpowiedź.\nNastępnie oceń ją na dolnym pasku działań: wybierz Znowu, jeśli odpowiedź umknęła (lub naciśnij 1), Ciężko, jeśli pamiętasz ją częściowo (lub naciśnij 2), Dobrze, jeśli ją pamiętasz (lub naciśnij 3), oraz Łatwe, jeśli była zbyt prosta (lub naciśnij 4).\nOcena wpływa na termin ponownego wyświetlenia, a samo przywoływanie odpowiedzi wzmacnia pamięć.",
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
        "title": "Przeredagowanie: Uporządkuj zrozumienie",
        "description": "Podczas kolejnych powtórek możesz dalej przeredagowywać materiał, aby łatwiej było go zrozumieć i zapamiętać.",
        "summary": "Podczas kolejnych powtórek możesz dalej przeredagowywać materiał, aby łatwiej było go zrozumieć i zapamiętać.",
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
            "text": "Podczas kolejnych powtórek możesz dalej przeredagowywać materiał, aby łatwiej było go zrozumieć i zapamiętać.",
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
        "title": "Planowanie: Pokaż we właściwym momencie",
        "description": "Priorytet materiału, działania podczas czytania i oceny odpowiedzi wspólnie wpływają na harmonogram Foliole, dzięki czemu materiał pojawia się ponownie we właściwym momencie.",
        "summary": "Priorytet materiału, działania podczas czytania i oceny odpowiedzi wspólnie wpływają na harmonogram Foliole, dzięki czemu materiał pojawia się ponownie we właściwym momencie.",
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
            "text": "Priorytet materiału, działania podczas czytania i oceny odpowiedzi wspólnie wpływają na harmonogram Foliole, dzięki czemu materiał pojawia się ponownie we właściwym momencie.",
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
        "title": "Powtarzanie: Przyswajaj wiedzę",
        "description": "Powtórki rozłożone w czasie pomagają stopniowo przyswajać wiedzę. Czytanie przyrostowe pomaga naprawdę doprowadzać lekturę do końca. Foliole sprawia, że czytanie przyrostowe przebiega płynnie.",
        "summary": "Powtórki rozłożone w czasie pomagają stopniowo przyswajać wiedzę. Czytanie przyrostowe pomaga naprawdę doprowadzać lekturę do końca. Foliole sprawia, że czytanie przyrostowe przebiega płynnie.",
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
            "text": "Powtórki rozłożone w czasie pomagają stopniowo przyswajać wiedzę.\nCzytanie przyrostowe pomaga naprawdę doprowadzać lekturę do końca.\nFoliole sprawia, że czytanie przyrostowe przebiega płynnie.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "Do czego służy demo Foliole",
        "description": "Być może od dawna używasz SuperMemo i chcesz zobaczyć, czym różni się Foliole.",
        "summary": "Być może od dawna używasz SuperMemo i chcesz zobaczyć, czym różni się Foliole.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "Być może od dawna używasz SuperMemo i chcesz zobaczyć, czym różni się Foliole.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Być może intensywnie korzystasz z Obsidian lub innych narzędzi do czytania i notowania i chcesz zrobić z materiałem coś więcej niż tylko go przeczytać i zaznaczyć.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "Być może dopiero poznajesz czytanie przyrostowe i nie wiesz jeszcze, czy jest dla Ciebie.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Aby umożliwić bezpośrednie poznanie Foliole, przygotowaliśmy to demo online.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "Nie musisz niczego instalować. Otwórz stronę i zacznij korzystać z niej w przeglądarce. Możesz tu czytać stale rozwijane Foliole Guides albo zaimportować własne dokumenty Markdown i przejść przez podstawowy proces czytania przyrostowego.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "Demo online korzysta z symulowanych dat, dzięki czemu możesz szybko poznać sposób planowania materiału w Foliole. Panel ustawień zawiera Podgląd ustawień pulpitu, który pokazuje pełne ustawienia wersji komputerowej i pomaga zrozumieć strukturę funkcji Foliole. Zmiany w tym podglądzie nie wpływają na demo online.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "Demo online zapisuje dane lokalnie w przeglądarce, dlatego nie traktuj go jako jedynej kopii zapasowej. Nie zawiera też wielu kluczowych funkcji wersji komputerowej, takich jak wyświetlanie plików PDF, EPUB i obrazów, biblioteki dokumentów zewnętrznych, rozszerzone wyszukiwanie, integracje z Obsidian i Readwise Reader, kopie lustrzane Markdown, synchronizacja w sieci lokalnej i inne.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "Demo online będzie rozwijane wraz z aplikacją komputerową i może mieć problemy inne niż wersja komputerowa. Opinie możesz przesłać bezpośrednio z lewego paska bocznego. Zapraszamy też do obserwowania projektu, zgłaszania problemów i udziału w dyskusjach na GitHubie.",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "pt": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "pt",
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
        "title": "Boas-vindas ao Foliole",
        "description": "Comece clicando em Read na barra de ações inferior ou pressione 3 ou F.",
        "summary": "Comece clicando em Read na barra de ações inferior ou pressione 3 ou F.",
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
            "text": "Comece clicando em Read na barra de ações inferior ou pressione 3 ou F.",
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
        "title": "Leitura: Divida o todo em partes",
        "description": "A leitura não precisa ser concluída de uma só vez. De acordo com o contexto, você pode exibir o conteúdo atual novamente em breve (Soon na barra de ações inferior ou tecla 1), mais tarde (Later ou tecla 2), depois de outra etapa de leitura (Read ou tecla 3) ou parar de exibi-lo automaticamente quando terminar (Dismiss ou tecla 4).",
        "summary": "A leitura não precisa ser concluída de uma só vez. De acordo com o contexto, você pode exibir o conteúdo atual novamente em breve (Soon na barra de ações inferior ou tecla 1), mais tarde (Later ou tecla 2), depois de outra etapa de leitura (Read ou tecla 3) ou parar de exibi-lo automaticamente quando terminar (Dismiss ou tecla 4).",
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
            "text": "A leitura não precisa ser concluída de uma só vez.\nDe acordo com o contexto, você pode exibir o conteúdo atual novamente em breve (Soon na barra de ações inferior ou tecla 1), mais tarde (Later ou tecla 2), depois de outra etapa de leitura (Read ou tecla 3) ou parar de exibi-lo automaticamente quando terminar (Dismiss ou tecla 4).",
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
        "title": "Destaque: Extraia o essencial",
        "description": "Selecione o texto que deseja extrair. A barra de ferramentas flutuante será exibida.",
        "summary": "Selecione o texto que deseja extrair. A barra de ferramentas flutuante será exibida.",
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
            "text": "Selecione o texto que deseja extrair. A barra de ferramentas flutuante será exibida.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Use Destaque nessa barra ou pressione Alt + Z para destacar o trecho e criar um novo Tópico secundário.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "Cloze: Crie um item de teste",
        "description": "Selecione o texto que deseja testar. Use Cloze na barra de ferramentas flutuante ou pressione Alt + X. O Foliole cria um item que pede para você lembrar a parte oculta.",
        "summary": "Selecione o texto que deseja testar. Use Cloze na barra de ferramentas flutuante ou pressione Alt + X. O Foliole cria um item que pede para você lembrar a parte oculta.",
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
            "text": "Selecione o texto que deseja testar.\nUse Cloze na barra de ferramentas flutuante ou pressione Alt + X.\nO Foliole cria um item que pede para você lembrar a parte oculta.",
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
        "title": "Teste: Fixe o conhecimento",
        "description": "Quando um item criado por um Cloze aparecer, tente primeiro se lembrar da resposta. Em seguida, avalie na barra de ações inferior: escolha Novamente se não lembrou (ou pressione 1), Difícil se lembrou parcialmente (ou pressione 2), Bom se lembrou (ou pressione 3) e Fácil se foi simples demais (ou pressione 4). A avaliação afeta quando o item aparecerá novamente, e o próprio ato de testar a memória ajuda a fortalecê-la.",
        "summary": "Quando um item criado por um Cloze aparecer, tente primeiro se lembrar da resposta. Em seguida, avalie na barra de ações inferior: escolha Novamente se não lembrou (ou pressione 1), Difícil se lembrou parcialmente (ou pressione 2), Bom se lembrou (ou pressione 3) e Fácil se foi simples demais (ou pressione 4). A avaliação afeta quando o item aparecerá novamente, e o próprio ato de testar a memória ajuda a fortalecê-la.",
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
            "text": "Quando um item criado por um Cloze aparecer, tente primeiro se lembrar da resposta.\nEm seguida, avalie na barra de ações inferior: escolha Novamente se não lembrou (ou pressione 1), Difícil se lembrou parcialmente (ou pressione 2), Bom se lembrou (ou pressione 3) e Fácil se foi simples demais (ou pressione 4).\nA avaliação afeta quando o item aparecerá novamente, e o próprio ato de testar a memória ajuda a fortalecê-la.",
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
        "title": "Reescrita: Esclareça o entendimento",
        "description": "Nas revisões seguintes, você pode continuar reescrevendo o material para torná-lo mais fácil de entender e lembrar.",
        "summary": "Nas revisões seguintes, você pode continuar reescrevendo o material para torná-lo mais fácil de entender e lembrar.",
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
            "text": "Nas revisões seguintes, você pode continuar reescrevendo o material para torná-lo mais fácil de entender e lembrar.",
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
        "title": "Agendamento: Mostre no momento certo",
        "description": "A prioridade do material, as ações de leitura e as avaliações dos testes contribuem juntas para o agendamento do Foliole, ajudando o material a aparecer novamente no momento certo.",
        "summary": "A prioridade do material, as ações de leitura e as avaliações dos testes contribuem juntas para o agendamento do Foliole, ajudando o material a aparecer novamente no momento certo.",
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
            "text": "A prioridade do material, as ações de leitura e as avaliações dos testes contribuem juntas para o agendamento do Foliole, ajudando o material a aparecer novamente no momento certo.",
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
        "title": "Repetição: Internalize o conhecimento",
        "description": "A repetição espaçada ajuda a internalizar o conhecimento passo a passo. A leitura incremental ajuda você a realmente concluir o que lê. O Foliole torna a leitura incremental mais fluida.",
        "summary": "A repetição espaçada ajuda a internalizar o conhecimento passo a passo. A leitura incremental ajuda você a realmente concluir o que lê. O Foliole torna a leitura incremental mais fluida.",
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
            "text": "A repetição espaçada ajuda a internalizar o conhecimento passo a passo.\nA leitura incremental ajuda você a realmente concluir o que lê.\nO Foliole torna a leitura incremental mais fluida.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "Para que serve a demonstração do Foliole",
        "description": "Talvez você use o SuperMemo há muito tempo e queira entender como o Foliole é diferente.",
        "summary": "Talvez você use o SuperMemo há muito tempo e queira entender como o Foliole é diferente.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "Talvez você use o SuperMemo há muito tempo e queira entender como o Foliole é diferente.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Talvez use intensamente o Obsidian ou outras ferramentas de leitura e anotações e queira levar seu material além da leitura e dos destaques.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "Talvez esteja conhecendo agora a leitura incremental e ainda não saiba se ela combina com você.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Para facilitar uma experiência direta com o Foliole, criamos esta demonstração online.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "Não é preciso instalar nada. Abra a página e comece a experimentar no navegador. Aqui você pode ler os Foliole Guides, que continuarão sendo atualizados, ou importar seus próprios documentos Markdown e percorrer o fluxo principal da leitura incremental.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "A demonstração online usa datas simuladas para que você possa experimentar rapidamente o agendamento de materiais do Foliole. O painel de configurações inclui a Visualização das configurações da área de trabalho, que mostra todas as configurações do aplicativo para desktop e ajuda a entender a estrutura de recursos do Foliole. As alterações feitas ali não afetam a demonstração online.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "A demonstração online armazena os dados localmente no navegador, portanto não a trate como seu único backup. Ela também não inclui muitos recursos essenciais do aplicativo para desktop, como visualização de PDF, EPUB e imagens, bibliotecas de documentos externos, pesquisa aprimorada, integrações com Obsidian e Readwise Reader, espelhos Markdown, sincronização pela rede local e outros.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "A demonstração online continuará sendo atualizada junto com o aplicativo para desktop e poderá apresentar problemas diferentes dos encontrados nessa versão. Você pode enviar feedback diretamente pela barra lateral esquerda. Também pode acompanhar o projeto, relatar problemas ou participar das conversas no GitHub.",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "ru": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "ru",
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
        "title": "Добро пожаловать в Foliole",
        "description": "Сначала нажмите Read на нижней панели действий или клавишу 3 либо F.",
        "summary": "Сначала нажмите Read на нижней панели действий или клавишу 3 либо F.",
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
            "text": "Сначала нажмите Read на нижней панели действий или клавишу 3 либо F.",
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
        "title": "Чтение: Разделите целое на части",
        "description": "Необязательно завершать чтение за один раз. В зависимости от ситуации можно снова показать текущий материал в ближайшее время (Soon на нижней панели действий или клавиша 1), позже (Later или клавиша 2), после очередного этапа чтения (Read или клавиша 3) либо больше не показывать его автоматически, когда работа закончена (Dismiss или клавиша 4).",
        "summary": "Необязательно завершать чтение за один раз. В зависимости от ситуации можно снова показать текущий материал в ближайшее время (Soon на нижней панели действий или клавиша 1), позже (Later или клавиша 2), после очередного этапа чтения (Read или клавиша 3) либо больше не показывать его автоматически, когда работа закончена (Dismiss или клавиша 4).",
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
            "text": "Необязательно завершать чтение за один раз.\nВ зависимости от ситуации можно снова показать текущий материал в ближайшее время (Soon на нижней панели действий или клавиша 1), позже (Later или клавиша 2), после очередного этапа чтения (Read или клавиша 3) либо больше не показывать его автоматически, когда работа закончена (Dismiss или клавиша 4).",
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
        "title": "Выделить: Извлеките главное",
        "description": "Выделите текст, который хотите извлечь. Появится плавающая панель инструментов.",
        "summary": "Выделите текст, который хотите извлечь. Появится плавающая панель инструментов.",
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
            "text": "Выделите текст, который хотите извлечь. Появится плавающая панель инструментов.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Выберите на ней Выделить или нажмите Alt + Z, чтобы отметить фрагмент и создать из него новую дочернюю Тему.",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "Клоуз: Создайте проверочный элемент",
        "description": "Выделите текст, который хотите проверить. Выберите Клоуз на плавающей панели инструментов или нажмите Alt + X. Foliole создаст элемент, в котором нужно вспомнить скрытую часть.",
        "summary": "Выделите текст, который хотите проверить. Выберите Клоуз на плавающей панели инструментов или нажмите Alt + X. Foliole создаст элемент, в котором нужно вспомнить скрытую часть.",
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
            "text": "Выделите текст, который хотите проверить.\nВыберите Клоуз на плавающей панели инструментов или нажмите Alt + X.\nFoliole создаст элемент, в котором нужно вспомнить скрытую часть.",
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
        "title": "Проверка: Закрепите знания",
        "description": "Когда появится элемент, созданный из Клоуза, сначала попробуйте вспомнить ответ. Затем оцените его на нижней панели действий: выберите снова, если не вспомнили (или нажмите 1), Жесткий, если вспомнили частично (или нажмите 2), Хорошо, если вспомнили (или нажмите 3), и Легко, если задание оказалось слишком простым (или нажмите 4). Оценка влияет на то, когда элемент появится снова, а само извлечение ответа из памяти помогает укрепить запоминание.",
        "summary": "Когда появится элемент, созданный из Клоуза, сначала попробуйте вспомнить ответ. Затем оцените его на нижней панели действий: выберите снова, если не вспомнили (или нажмите 1), Жесткий, если вспомнили частично (или нажмите 2), Хорошо, если вспомнили (или нажмите 3), и Легко, если задание оказалось слишком простым (или нажмите 4). Оценка влияет на то, когда элемент появится снова, а само извлечение ответа из памяти помогает укрепить запоминание.",
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
            "text": "Когда появится элемент, созданный из Клоуза, сначала попробуйте вспомнить ответ.\nЗатем оцените его на нижней панели действий: выберите снова, если не вспомнили (или нажмите 1), Жесткий, если вспомнили частично (или нажмите 2), Хорошо, если вспомнили (или нажмите 3), и Легко, если задание оказалось слишком простым (или нажмите 4).\nОценка влияет на то, когда элемент появится снова, а само извлечение ответа из памяти помогает укрепить запоминание.",
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
        "title": "Переписывание: Проясните понимание",
        "description": "Во время следующих повторений можно продолжать переписывать материал, делая его более понятным и запоминающимся.",
        "summary": "Во время следующих повторений можно продолжать переписывать материал, делая его более понятным и запоминающимся.",
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
            "text": "Во время следующих повторений можно продолжать переписывать материал, делая его более понятным и запоминающимся.",
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
        "title": "Планирование: Показывайте в нужный момент",
        "description": "Приоритет материала, действия во время чтения и оценки за ответы вместе влияют на расписание Foliole, помогая материалу снова появляться в подходящий момент.",
        "summary": "Приоритет материала, действия во время чтения и оценки за ответы вместе влияют на расписание Foliole, помогая материалу снова появляться в подходящий момент.",
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
            "text": "Приоритет материала, действия во время чтения и оценки за ответы вместе влияют на расписание Foliole, помогая материалу снова появляться в подходящий момент.",
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
        "title": "Повторение: Усваивайте знания",
        "description": "Интервальные повторения помогают шаг за шагом усваивать знания. Инкрементальное чтение помогает действительно доводить чтение до конца. Foliole делает инкрементальное чтение плавным процессом.",
        "summary": "Интервальные повторения помогают шаг за шагом усваивать знания. Инкрементальное чтение помогает действительно доводить чтение до конца. Foliole делает инкрементальное чтение плавным процессом.",
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
            "text": "Интервальные повторения помогают шаг за шагом усваивать знания.\nИнкрементальное чтение помогает действительно доводить чтение до конца.\nFoliole делает инкрементальное чтение плавным процессом.",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "Для чего нужна демоверсия Foliole",
        "description": "Возможно, вы давно пользуетесь SuperMemo и хотите узнать, чем отличается Foliole.",
        "summary": "Возможно, вы давно пользуетесь SuperMemo и хотите узнать, чем отличается Foliole.",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "Возможно, вы давно пользуетесь SuperMemo и хотите узнать, чем отличается Foliole.",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "Возможно, вы активно используете Obsidian или другие инструменты для чтения и заметок и хотите не ограничиваться чтением и выделением материала.",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "Возможно, вы только знакомитесь с инкрементальным чтением и ещё не уверены, подходит ли оно вам.",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "Чтобы Foliole можно было попробовать напрямую, мы создали эту онлайн-демоверсию.",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "Устанавливать ничего не нужно. Откройте страницу и начните работать прямо в браузере. Здесь можно читать Foliole Guides, которые будут регулярно обновляться, или импортировать собственные документы Markdown и пройти основной цикл инкрементального чтения.",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "Онлайн-демоверсия использует имитацию дат, чтобы вы могли быстро познакомиться с планированием материалов в Foliole. Панель настроек включает Предварительный просмотр настроек рабочего стола: в нём показаны все настройки настольной версии, чтобы вы могли понять структуру возможностей Foliole. Изменения в этом окне не влияют на онлайн-демоверсию.",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "Онлайн-демоверсия хранит данные локально в браузере, поэтому не используйте её как единственную резервную копию. В ней также отсутствуют многие важные функции настольной версии, включая просмотр PDF, EPUB и изображений, библиотеки внешних документов, расширенный поиск, интеграции с Obsidian и Readwise Reader, зеркала Markdown, синхронизацию по локальной сети и другие возможности.",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "Онлайн-демоверсия будет развиваться вместе с настольным приложением и может сталкиваться с проблемами, которых нет в настольной версии. Отзыв можно отправить прямо с левой боковой панели. Вы также можете следить за проектом, сообщать о проблемах и участвовать в обсуждениях на GitHub.",
            "id": "what-the-foliole-demo-is-for-block-8"
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
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "在线体验 Foliole",
        "description": "也许你是 SuperMemo 的老用户，想看看 Foliole 有什么不同。",
        "summary": "也许你是 SuperMemo 的老用户，想看看 Foliole 有什么不同。",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "也许你是 SuperMemo 的老用户，想看看 Foliole 有什么不同。",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "也许你正重度使用 Obsidian 等阅读和笔记工具，希望材料不止于阅读和标注。",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "也许你只是第一次听说渐进阅读，还不确定它适不适合自己。",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "为了让你更直观地体验 Foliole，我们专门构建了这套在线体验版。",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "无需安装，打开网页即可直接体验。你可以在这里阅读 Foliole Guides（后续会持续更新），也可以导入自己的 Markdown 文档，进行渐进阅读的核心流程操作。",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "在线体验版提供了模拟日期功能，方便你快速体验 Foliole 的材料调度。设置面板中的「桌面端设置预览」展示桌面版的完整设置，方便了解 Foliole 的功能结构。这里的调整不会影响在线体验版。",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "在线体验版将数据保存在浏览器本地，请勿作为唯一备份。它也不具备桌面版的多项核心功能，包括 PDF / EPUB / 图片阅览、外部文档库、搜索增强、Obsidian 集成、Readwise Reader 集成、Markdown 镜像、局域网同步等。",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "在线体验版会随着桌面端继续更新，也可能出现与桌面端不同的问题。可以通过左侧工具栏入口直接提交反馈，也欢迎在 GitHub 关注项目进展、提交问题或参与交流。",
            "id": "what-the-foliole-demo-is-for-block-8"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      }
    ]
  },
  "zh-hant": {
    "contractVersion": 3,
    "generatedAt": "1970-01-01T00:00:00.000Z",
    "sourceLocale": "zh-hant",
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
        "title": "歡迎使用 Foliole",
        "description": "請先點選底部動作列中的 Read，或按 3 或 F。",
        "summary": "請先點選底部動作列中的 Read，或按 3 或 F。",
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
            "text": "請先點選底部動作列中的 Read，或按 3 或 F。",
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
        "title": "閱讀：化整為零",
        "description": "在 Foliole 中，閱讀不必一次完成。 你可以依照當下情境，選擇讓目前內容稍後顯示（底部動作列中的 Soon，或按 1）、以後顯示（Later，或按 2）、讀過一段後下次再顯示（Read，或按 3），或在讀完後不再自動顯示（Dismiss，或按 4）。",
        "summary": "在 Foliole 中，閱讀不必一次完成。 你可以依照當下情境，選擇讓目前內容稍後顯示（底部動作列中的 Soon，或按 1）、以後顯示（Later，或按 2）、讀過一段後下次再顯示（Read，或按 3），或在讀完後不再自動顯示（Dismiss，或按 4）。",
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
            "text": "在 Foliole 中，閱讀不必一次完成。\n你可以依照當下情境，選擇讓目前內容稍後顯示（底部動作列中的 Soon，或按 1）、以後顯示（Later，或按 2）、讀過一段後下次再顯示（Read，或按 3），或在讀完後不再自動顯示（Dismiss，或按 4）。",
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
        "title": "亮點：摘錄精華",
        "description": "選取想摘錄的文字後，會出現浮動工具列。",
        "summary": "選取想摘錄的文字後，會出現浮動工具列。",
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
            "text": "選取想摘錄的文字後，會出現浮動工具列。",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-1"
          },
          {
            "kind": "paragraph",
            "text": "點選其中的亮點，或按 Alt + Z，即可標示這段內容，並建立一個新的子主題。",
            "id": "welcome-to-foliole.highlight-extract-the-essence-block-2"
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
        "title": "完型填空：建立檢測項目",
        "description": "選取想檢測的內容。 點選浮動工具列中的完型填空，或按 Alt + X。 Foliole 會建立一個檢測項目，讓你回想被隱藏的部分。",
        "summary": "選取想檢測的內容。 點選浮動工具列中的完型填空，或按 Alt + X。 Foliole 會建立一個檢測項目，讓你回想被隱藏的部分。",
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
            "text": "選取想檢測的內容。\n點選浮動工具列中的完型填空，或按 Alt + X。\nFoliole 會建立一個檢測項目，讓你回想被隱藏的部分。",
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
        "title": "檢測：強化記憶",
        "description": "由完型填空建立的檢測項目出現時，請先試著回想答案。 接著在底部動作列中評分：不記得請選再次（或按 1），只記得一部分請選硬（或按 2），記得請選好（或按 3），太簡單請選簡單（或按 4）。 評分會影響下次顯示時間，而檢測本身也能強化記憶。",
        "summary": "由完型填空建立的檢測項目出現時，請先試著回想答案。 接著在底部動作列中評分：不記得請選再次（或按 1），只記得一部分請選硬（或按 2），記得請選好（或按 3），太簡單請選簡單（或按 4）。 評分會影響下次顯示時間，而檢測本身也能強化記憶。",
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
            "text": "由完型填空建立的檢測項目出現時，請先試著回想答案。\n接著在底部動作列中評分：不記得請選再次（或按 1），只記得一部分請選硬（或按 2），記得請選好（或按 3），太簡單請選簡單（或按 4）。\n評分會影響下次顯示時間，而檢測本身也能強化記憶。",
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
        "title": "改寫：釐清理解",
        "description": "在後續複習時，你可以持續改寫材料，讓它更容易理解與記憶。",
        "summary": "在後續複習時，你可以持續改寫材料，讓它更容易理解與記憶。",
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
            "text": "在後續複習時，你可以持續改寫材料，讓它更容易理解與記憶。",
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
        "title": "排程：適時顯示",
        "description": "材料優先級、閱讀動作和檢測評分會共同影響 Foliole 的排程，讓材料在合適的時候再次顯示。",
        "summary": "材料優先級、閱讀動作和檢測評分會共同影響 Foliole 的排程，讓材料在合適的時候再次顯示。",
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
            "text": "材料優先級、閱讀動作和檢測評分會共同影響 Foliole 的排程，讓材料在合適的時候再次顯示。",
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
        "title": "重複：內化知識",
        "description": "間隔重複，讓知識逐步內化。 漸進閱讀，讓閱讀真正完成。 Foliole，讓漸進閱讀流暢進行。",
        "summary": "間隔重複，讓知識逐步內化。 漸進閱讀，讓閱讀真正完成。 Foliole，讓漸進閱讀流暢進行。",
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
            "text": "間隔重複，讓知識逐步內化。\n漸進閱讀，讓閱讀真正完成。\nFoliole，讓漸進閱讀流暢進行。",
            "id": "welcome-to-foliole.repeat-internalize-knowledge-block-1"
          }
        ],
        "highlights": [],
        "reviewItems": [],
        "reviewScheduleSeeds": []
      },
      {
        "id": "what-the-foliole-demo-is-for",
        "slug": "what-the-foliole-demo-is-for",
        "parentId": null,
        "childTopicIds": [],
        "title": "線上體驗 Foliole",
        "description": "也許你是 SuperMemo 的長期使用者，想看看 Foliole 有什麼不同。",
        "summary": "也許你是 SuperMemo 的長期使用者，想看看 Foliole 有什麼不同。",
        "runtime": {
          "state": "topic",
          "topicId": "what-the-foliole-demo-is-for"
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
            "text": "也許你是 SuperMemo 的長期使用者，想看看 Foliole 有什麼不同。",
            "id": "what-the-foliole-demo-is-for-block-1"
          },
          {
            "kind": "paragraph",
            "text": "也許你經常使用 Obsidian 等閱讀與筆記工具，希望材料不只停留在閱讀與標註。",
            "id": "what-the-foliole-demo-is-for-block-2"
          },
          {
            "kind": "paragraph",
            "text": "也許你剛接觸漸進閱讀，還不確定它是否適合自己。",
            "id": "what-the-foliole-demo-is-for-block-3"
          },
          {
            "kind": "paragraph",
            "text": "為了讓你更直接地體驗 Foliole，我們特別建立了這套線上體驗版。",
            "id": "what-the-foliole-demo-is-for-block-4"
          },
          {
            "kind": "paragraph",
            "text": "無須安裝，開啟網頁即可直接體驗。你可以在這裡閱讀會持續更新的 Foliole Guides，也可以匯入自己的 Markdown 文件，走過漸進閱讀的核心流程。",
            "id": "what-the-foliole-demo-is-for-block-5"
          },
          {
            "kind": "paragraph",
            "text": "線上體驗版提供模擬日期功能，方便你快速體驗 Foliole 的材料排程。設定面板中的「桌面設定預覽」會顯示桌面版的完整設定，讓你了解 Foliole 的功能結構；在這裡做的調整不會影響線上體驗版。",
            "id": "what-the-foliole-demo-is-for-block-6"
          },
          {
            "kind": "paragraph",
            "text": "線上體驗版會將資料儲存在瀏覽器本機，請勿將它當作唯一備份。它也不包含桌面版的多項核心功能，包括 PDF、EPUB 與圖片檢視、外部文件庫、進階搜尋、Obsidian 整合、Readwise Reader 整合、Markdown 鏡像、區域網路同步等。",
            "id": "what-the-foliole-demo-is-for-block-7"
          },
          {
            "kind": "paragraph",
            "text": "線上體驗版會隨桌面應用程式持續更新，也可能出現與桌面版不同的問題。你可以透過左側工具列直接提交意見，也歡迎在 GitHub 關注專案進度、回報問題或參與討論。",
            "id": "what-the-foliole-demo-is-for-block-8"
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

/* Add new releases at the TOP. The first entry defines the running APP_VERSION.
   Dates use YYYY-MM-DD. This file is shared by the page and service worker. */
globalThis.MedRecallRelease = {
  history: [
    {
      version: "1.2.0",
      date: "2026-09-24",
      title: "What's New",
      changes: [
        "Previous & Mock Exams — Practice questions collected from previous exams and mock exams are now available in MedRecall.",
        "Improved Analysis — Track your topic performance over time with the new interactive progress analysis."
      ]
    },
    {
      version: "1.1.1",
      date: "2026-09-23",
      title: "Quiz answer controls",
      changes: [
        "Change your selected answer before checking it in Recall or Exam mode.",
        "Only the checked answer counts as an attempt; Exam selections stay neutral.",
        "Reveal or hide the explanation after checking an answer in Recall mode.",
        "The MedRecall splash now remains visible for at least 2.5 seconds."
      ]
    },
    {
      version: "1.1.0",
      date: "2026-09-23",
      title: "A smoother study experience",
      description: "Built exclusively for AFM 3rd Year Students.",
      changes: [
        "All Selected MCQs lets you intentionally repeat your selected topics.",
        "Combine practice pools with multi-selection, Select all and Clear selection.",
        "Improved mobile edge-swipe navigation and first-launch menu guidance.",
        "A branded splash welcomes you on each full launch.",
        "Subtle sound effects with a persistent mute control and special perfect-score feedback.",
        "Device-specific installation guidance and verified offline-readiness status.",
        "What's New keeps you informed about MedRecall releases."
      ]
    },
    {
      version: "1.0.0",
      date: null,
      title: "Original MedRecall release",
      changes: ["Bundled offline questions, quizzes, local study progress, notes, bookmarks and analytics."]
    }
  ]
};
MedRecallRelease.version = MedRecallRelease.history[0].version;

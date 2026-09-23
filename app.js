const subjects = [
  {
    id: "micro",
    icon: "◈",
    title: "Medical Microbiology & Immunology",
    subtitle: "18 foundational topics",
    file: "Microbiology2026-2027-1_260911_104045.pdf",
    pages: "146 pages",
    topics: [
      ["microbial-world", "Microbial world & bacterial cell structure"],
      ["bacterial-growth", "Bacterial growth, requirements & spores"],
      ["bacterial-pathogenesis", "Pathogenesis of bacterial infection"],
      ["virus-features", "Virus features & classification"],
      ["viral-replication", "Viral replication & bacteriophages"],
      ["bacterial-genetics", "Bacterial genetics"],
      ["antibacterial-actions", "Mechanisms of antibacterial agents"],
      ["bacterial-resistance", "Bacterial resistance"],
      ["staphylococci", "Staphylococci"],
      ["streptococci", "Streptococci"],
      ["gram-negative", "Gram-negative bacilli"],
      ["antigens-antibodies", "Immunogens, antigens & antibodies"],
      ["complement-mhc", "Complement system & MHC"],
      ["innate-immunity", "Innate immunity, cytokines & interferons"],
      ["adaptive-immunity", "Adaptive immunity"],
      ["vaccines", "Vaccines"],
      ["herpesviruses", "Herpesviruses"],
      ["mycology", "Introduction to medical mycology"]
    ]
  },
  {
    id: "parasito",
    icon: "⌁",
    title: "Medical Parasitology",
    subtitle: "5 introductory topics",
    file: "Parasitology ID1 2026-2027 _260911_103951.pdf",
    pages: "77 pages",
    topics: [
      ["parasite-intro", "General medical parasitology"],
      ["helminthology", "Introduction to helminthology"],
      ["protozoology", "Introduction to protozoology"],
      ["entomology", "Medical entomology"],
      ["parasite-diagnosis", "Diagnosis of parasitic infections"]
    ]
  },
  {
    id: "pharma",
    icon: "⊹",
    title: "Antimicrobial Pharmacology",
    subtitle: "7 drug-focused topics",
    file: "Pharmacology final version-1_260911_104138.pdf",
    pages: "53 pages",
    topics: [
      ["cell-wall-drugs", "Cell wall synthesis inhibitors"],
      ["protein-drugs", "Protein synthesis inhibitors"],
      ["nucleic-acid-drugs", "Nucleic acid synthesis inhibitors"],
      ["metabolism-drugs", "Bacterial metabolism inhibitors"],
      ["membrane-drugs", "Cell membrane inhibitors"],
      ["rational-antimicrobials", "Rational use of antimicrobial agents"],
      ["antifungal-drugs", "Antifungal drugs"]
    ]
  }
];

const builtInQuestionBank = Array.isArray(window.MEDRECALL_QUESTION_BANK) ? window.MEDRECALL_QUESTION_BANK : [];
const APP_VERSION = MedRecallRelease.version;
const WHATSAPP_NUMBER = "962779809947";
let questionBank = builtInQuestionBank.slice();
const importedQuestionBankKey = "medrecall-imported-question-bank";
const validTopicIds = new Set(subjects.flatMap(function(subject) {
  return subject.topics.map(function(topic) { return topic[0]; });
}));

let selectedTopics = new Set();
let currentQuiz = null;
let timerInterval = null;
let reviewOnly = false;
let progressState = null;
let progressReady = false;
let progressError = null;
let pendingAnswer = null;
let explanationOpen = false;

const sourceList = document.getElementById("sourceList");
const sourceLibraryList = document.getElementById("sourceLibraryList");
const toast = document.getElementById("toast");

const bundledQuestionsById = new Map(builtInQuestionBank.map(function(question) {
  return [questionId(question), question];
}));
const bundledTopicCounts = new Map();
builtInQuestionBank.forEach(function(question) {
  bundledTopicCounts.set(question.topic, (bundledTopicCounts.get(question.topic) || 0) + 1);
});

function getTopicName(id) {
  for (const subject of subjects) {
    for (const topic of subject.topics) {
      if (topic[0] === id) return topic[1];
    }
  }
  return id;
}

function getSubjectForTopic(id) {
  return subjects.find(function(subject) {
    return subject.topics.some(function(topic) { return topic[0] === id; });
  });
}

function renderSourceList() {
  sourceList.innerHTML = subjects.map(function(subject) {
    const topicRows = subject.topics.map(function(topic) {
      const isChecked = selectedTopics.has(topic[0]) ? "checked" : "";
      return '<label class="topic-option"><input class="topic-check" type="checkbox" data-topic="' + topic[0] + '" ' + isChecked + '><span class="custom-checkbox"></span><span>' + topic[1] + '</span></label>';
    }).join("");
    const allChecked = subject.topics.every(function(topic) { return selectedTopics.has(topic[0]); }) && subject.topics.length > 0 ? "checked" : "";
    return '<article class="subject-group" data-subject="' + subject.id + '">' +
      '<button class="subject-header" type="button" aria-expanded="true">' +
      '<span class="subject-mark">' + subject.icon + '</span><span><b>' + subject.title + '</b><small>' + subject.subtitle + '</small></span>' +
      '<label class="select-all"><input type="checkbox" data-select-all="' + subject.id + '" ' + allChecked + '>Select all</label><i class="accordion-caret">⌄</i></button>' +
      '<div class="topic-options">' + topicRows + '</div></article>';
  }).join("");

  sourceList.querySelectorAll(".topic-check").forEach(function(input) {
    input.addEventListener("change", function() {
      if (input.checked) selectedTopics.add(input.dataset.topic);
      else selectedTopics.delete(input.dataset.topic);
      renderSourceList();
      updateBuilderSummary();
    });
  });

  sourceList.querySelectorAll("[data-select-all]").forEach(function(input) {
    input.addEventListener("click", function(event) { event.stopPropagation(); });
    input.addEventListener("change", function() {
      const subject = subjects.find(function(item) { return item.id === input.dataset.selectAll; });
      subject.topics.forEach(function(topic) {
        if (input.checked) selectedTopics.add(topic[0]);
        else selectedTopics.delete(topic[0]);
      });
      renderSourceList();
      updateBuilderSummary();
    });
  });

  sourceList.querySelectorAll(".subject-header").forEach(function(header) {
    header.addEventListener("click", function(event) {
      if (event.target.closest(".select-all")) return;
      const group = header.closest(".subject-group");
      group.classList.toggle("collapsed");
      header.setAttribute("aria-expanded", String(!group.classList.contains("collapsed")));
    });
  });
}

function questionKey(question) {
  return question.topic + "::" + question.text;
}

function questionId(question) {
  return MedRecallProgress.questionId(question);
}

function saveProgress() {
  if (!progressReady) return;
  MedRecallProgress.save(progressState).catch(function(error) {
    if (progressError) return;
    progressError = error;
    updateProgressStatus("Progress could not be saved. Export a backup now.");
    showToast("Progress save failed: " + error.message);
  });
}

function saveActiveQuiz() {
  if (!progressReady || !currentQuiz || reviewOnly) return;
  progressState.activeQuiz = {
    name: currentQuiz.name,
    mode: currentQuiz.mode,
    timerEnabled: currentQuiz.timerEnabled,
    durationSeconds: currentQuiz.durationSeconds,
    secondsLeft: currentQuiz.secondsLeft,
    startedAt: currentQuiz.startedAt,
    savedAt: Date.now(),
    questionIds: currentQuiz.questions.map(questionId),
    answers: currentQuiz.answers.slice(),
    draftAnswers: currentQuiz.drafts.slice(),
    index: currentQuiz.index
  };
  saveProgress();
}

function restoreActiveQuiz() {
  const saved = progressState.activeQuiz;
  if (!saved) return;
  const byId = new Map(questionBank.map(function(question) { return [questionId(question), question]; }));
  const questions = saved.questionIds.map(function(id) { return byId.get(id); });
  if (questions.some(function(question) { return !question; })) {
    progressState.activeQuiz = null;
    saveProgress();
    return;
  }
  currentQuiz = {
    name: saved.name, mode: saved.mode, timerEnabled: saved.timerEnabled,
    durationSeconds: saved.durationSeconds,
    secondsLeft: saved.timerEnabled ? Math.min(saved.durationSeconds, Math.max(0, saved.secondsLeft - Math.max(0, Math.floor((Date.now() - saved.savedAt) / 1000)))) : saved.secondsLeft,
    startedAt: saved.startedAt, questions: questions, answers: saved.answers.slice(), drafts: (saved.draftAnswers || saved.answers).slice(), index: saved.index
  };
  reviewOnly = false;
  pendingAnswer = currentQuiz.drafts[currentQuiz.index];
  explanationOpen = false;
  if (currentQuiz.timerEnabled && currentQuiz.secondsLeft <= 0) {
    finishQuiz();
    return;
  }
  setView("quiz");
  document.getElementById("quizNameTop").textContent = currentQuiz.name;
  document.getElementById("quizTimer").style.visibility = currentQuiz.timerEnabled ? "visible" : "hidden";
  renderQuestion();
  if (currentQuiz.timerEnabled) {
    updateTimer();
    timerInterval = window.setInterval(function() {
      currentQuiz.secondsLeft -= 1;
      updateTimer();
      if (currentQuiz.secondsLeft <= 0) {
        clearInterval(timerInterval);
        finishQuiz();
      }
    }, 1000);
  }
  showToast("Your unfinished quiz was restored.");
}

function normalizeImportedQuestion(item) {
  if (!item || typeof item !== "object") return null;
  const topic = typeof item.topic === "string" ? item.topic.trim() : "";
  const text = typeof item.text === "string" ? item.text.trim() : "";
  const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
  const answers = Array.isArray(item.answers) ? item.answers.map(function(answer) {
    return typeof answer === "string" ? answer.trim() : "";
  }) : [];

  if (!validTopicIds.has(topic) || !text || !explanation || answers.length !== 4 || answers.some(function(answer) { return !answer; }) || !Number.isInteger(item.correct) || item.correct < 0 || item.correct > 3) {
    return null;
  }
  return { topic: topic, text: text, answers: answers, correct: item.correct, explanation: explanation };
}

function setImportedQuestions(items) {
  const seen = new Set(builtInQuestionBank.map(questionKey));
  const unique = items.filter(function(item) {
    const key = questionKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  questionBank = builtInQuestionBank.concat(unique);
  localStorage.setItem(importedQuestionBankKey, JSON.stringify(unique));
  return unique.length;
}

function loadImportedQuestions() {
  try {
    const stored = JSON.parse(localStorage.getItem(importedQuestionBankKey) || "[]");
    if (!Array.isArray(stored)) return;
    const valid = stored.map(normalizeImportedQuestion).filter(Boolean);
    setImportedQuestions(valid);
  } catch (error) {
    // A malformed saved import is ignored; the built-in bank remains available.
  }
}

function importQuestionFile(file) {
  if (!file) return;
  file.text().then(function(contents) {
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) throw new Error("The JSON root must be an array.");
    const valid = parsed.map(normalizeImportedQuestion);
    if (valid.some(function(item) { return !item; })) {
      throw new Error("Every question must match the MedRecall JSON schema.");
    }
    const imported = setImportedQuestions(valid);
    updateBuilderSummary();
    renderAnalysis();
    showToast(imported + " question" + (imported === 1 ? "" : "s") + " imported. Duplicate topic/question pairs were skipped.");
  }).catch(function(error) {
    showToast("Import failed: " + error.message);
  });
}

function loadLastSession() {
  return progressState ? progressState.lastSession : null;
}

function loadAnsweredKeys() {
  return new Set(progressState ? progressState.seenQuestionIds : []);
}

function rememberAnsweredQuestion(question, status) {
  const answered = loadAnsweredKeys();
  const id = questionId(question);
  answered.add(id);
  progressState.seenQuestionIds = Array.from(answered);
  const stats = progressState.questionStats[id] || {
    topic: question.topic, attempts: 0, correct: 0, incorrect: 0, unknown: 0,
    lastStatus: status, lastAttemptedAt: 0
  };
  stats.attempts += 1;
  stats[status === "wrong" ? "incorrect" : status] += 1;
  stats.lastStatus = status;
  stats.lastAttemptedAt = Date.now();
  progressState.questionStats[id] = stats;
  progressState.lastStudiedTopic = question.topic;
  saveProgress();
}

function loadMarkedQuestions() {
  return progressState ? progressState.markedQuestions : [];
}

function saveMarkedQuestions(items) {
  progressState.markedQuestions = items;
  saveProgress();
  updateRevisitOptions();
  renderOverviewNotes();
}

function getMarkedItem(question) {
  return loadMarkedQuestions().find(function(item) { return item.id === questionId(question); }) || null;
}

function renderQuestionNoteEditor() {
  if (!currentQuiz) return;
  const question = currentQuiz.questions[currentQuiz.index];
  const markedItem = getMarkedItem(question);
  const markButton = document.getElementById("markQuestionButton");
  const editor = document.getElementById("noteEditor");
  const noteInput = document.getElementById("questionNote");
  markButton.setAttribute("aria-pressed", String(Boolean(markedItem && markedItem.marked)));
  markButton.classList.toggle("marked", Boolean(markedItem && markedItem.marked));
  markButton.textContent = markedItem && markedItem.marked ? "★ Marked + note" : "☆ Mark + note";
  editor.hidden = !markedItem || !markedItem.marked;
  noteInput.value = markedItem ? markedItem.note || "" : "";
}

function toggleQuestionMark() {
  if (!currentQuiz) return;
  const question = currentQuiz.questions[currentQuiz.index];
  const id = questionId(question);
  const items = loadMarkedQuestions();
  const found = items.find(function(item) { return item.id === id; });
  if (found) {
    found.marked = !found.marked;
    if (!found.marked && !found.note) {
      saveMarkedQuestions(items.filter(function(item) { return item.id !== id; }));
      showToast("Question removed from your marked list.");
    } else {
      saveMarkedQuestions(items);
      showToast(found.marked ? "Question marked for review." : "Mark removed. Your note is saved.");
    }
  } else {
    items.push({ id: id, topic: question.topic, text: question.text, marked: true, note: "" });
    saveMarkedQuestions(items);
    showToast("Question marked. Add a note below.");
  }
  renderQuestionNoteEditor();
}

function saveCurrentQuestionNote() {
  if (!currentQuiz) return;
  const question = currentQuiz.questions[currentQuiz.index];
  const id = questionId(question);
  const note = document.getElementById("questionNote").value.trim();
  const items = loadMarkedQuestions();
  let item = items.find(function(entry) { return entry.id === id; });
  if (!item) {
    item = { id: id, topic: question.topic, text: question.text, marked: true, note: "" };
    items.push(item);
  }
  item.note = note;
  item.marked = true;
  saveMarkedQuestions(items);
  renderQuestionNoteEditor();
  document.getElementById("noteSaveStatus").textContent = "Saved on this device.";
  showToast("Question note saved.");
}

function getReuseModes() {
  return new Set(Array.from(document.querySelectorAll('input[name="reuseMode"]:checked:not(:disabled)'), function(input) { return input.value; }));
}

function getEligibleQuestions() {
  const answeredKeys = loadAnsweredKeys();
  const topicPool = questionBank.filter(function(question) {
    return selectedTopics.has(question.topic);
  });
  const modes = getReuseModes();
  const lastSession = loadLastSession();
  const markedIds = new Set(loadMarkedQuestions().filter(function(item) { return item.marked; }).map(function(item) { return item.id; }));
  const reviewIds = new Set((lastSession ? lastSession.answers : []).filter(function(item) {
    return (item.status === "wrong" && (modes.has("wrong") || modes.has("missed"))) ||
      (item.status === "unknown" && (modes.has("unknown") || modes.has("missed")));
  }).map(function(item) { return item.id; }));
  const questions = topicPool.filter(function(question) {
    const id = questionId(question);
    return modes.has("all") || (modes.has("new") && !answeredKeys.has(id)) ||
      (modes.has("marked") && markedIds.has(id)) || reviewIds.has(id);
  });

  return Array.from(new Map(questions.map(function(question) {
    return [questionId(question), question];
  })).values());
}

function getRequestedQuestionCount() {
  const countInput = document.getElementById("questionCount");
  return Math.min(200, Math.max(1, Number(countInput.value) || 10));
}

function updateRevisitOptions() {
  const hasLastSession = Boolean(loadLastSession());
  const hasMarkedQuestions = loadMarkedQuestions().some(function(item) { return item.marked; });
  const revisitNote = document.getElementById("revisitNote");
  document.querySelectorAll('input[name="reuseMode"]').forEach(function(input) {
    const isReviewOption = input.value !== "new" && input.value !== "all";
    const optionAvailable = input.value === "marked" ? hasMarkedQuestions : hasLastSession;
    input.disabled = isReviewOption && !optionAvailable;
    if (input.disabled) input.checked = false;
    input.closest(".revisit-option").classList.toggle("disabled", isReviewOption && !optionAvailable);
  });
  revisitNote.textContent = hasLastSession
    ? "Select one or more pools. Missed questions come from your latest quiz. All selected MCQs includes the full selected-topic pool. Overlapping questions appear only once."
    : hasMarkedQuestions ? "Marked questions are ready to review. Finish a quiz to unlock wrong/unknown review." : "Complete a quiz or mark a question first to unlock review options.";
  updateRevisitCards();
}

function updateRevisitCards() {
  document.querySelectorAll(".revisit-option").forEach(function(option) {
    option.classList.toggle("selected", option.querySelector("input").checked);
  });
}

function updateBuilderSummary() {
  const topicCount = selectedTopics.size;
  const requestedCount = getRequestedQuestionCount();
  const eligibleQuestions = getEligibleQuestions();
  const generateButton = document.getElementById("generateButton");
  const summary = document.getElementById("selectionSummary");
  document.getElementById("selectedTopicCount").textContent = topicCount;

  if (!progressReady) {
    generateButton.disabled = true;
    summary.textContent = progressError ? "Progress storage is unavailable in this browser." : "Loading your saved progress…";
    return;
  }

  if (topicCount === 0) {
    generateButton.disabled = true;
    summary.textContent = "Select one or more topics to generate your quiz.";
    return;
  }
  if (!getReuseModes().size) {
    generateButton.disabled = true;
    summary.textContent = "Choose at least one practice pool below.";
    return;
  }
  if (eligibleQuestions.length === 0) {
    generateButton.disabled = true;
    summary.textContent = getReuseModes().size === 1 && getReuseModes().has("new")
      ? "No question variants are available for these topics yet."
      : "No matching questions were found in the latest quiz. Choose a different retry option or topic.";
    return;
  }
  if (requestedCount > eligibleQuestions.length) {
    generateButton.disabled = true;
    summary.textContent = requestedCount + " requested, but only " + eligibleQuestions.length + " unique MCQs match this selection. Add topics or lower the count - repeats are never used.";
    return;
  }
  generateButton.disabled = false;
    summary.textContent = requestedCount + " MCQs from " + eligibleQuestions.length + " unique matching questions across " + topicCount + " selected topic" + (topicCount === 1 ? "" : "s") + ". No duplicates within this quiz.";
}

function renderLibrary() {
  sourceLibraryList.innerHTML = subjects.map(function(subject) {
    return '<article class="library-card"><div class="library-file-icon">PDF</div><div><h3>' + subject.title + '</h3><p>' + subject.subtitle + ' · ' + subject.file + '</p></div><div class="library-meta"><span>' + subject.pages + '</span><span>MODULE ID 1</span></div><button class="library-open" title="View source information" data-library-open="' + subject.id + '">→</button></article>';
  }).join("");
  sourceLibraryList.querySelectorAll("[data-library-open]").forEach(function(button) {
    button.addEventListener("click", function() {
      const subject = subjects.find(function(item) { return item.id === button.dataset.libraryOpen; });
      showToast(subject.file + " is included in this project’s source folder.");
    });
  });
}

function setView(viewName) {
  clearInterval(timerInterval);
  document.querySelectorAll(".view").forEach(function(view) { view.classList.remove("active"); });
  document.getElementById(viewName + "View").classList.add("active");
  document.querySelectorAll(".nav-item").forEach(function(button) {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  const names = { home: "HOME <span>/</span> OVERVIEW", create: "QUIZ BUILDER <span>/</span> CREATE QUIZ", analysis: "ANALYSIS <span>/</span> TOPIC PERFORMANCE", notes: "MARKED & NOTES <span>/</span> REVIEW SHELF", library: "SOURCE LIBRARY <span>/</span> INFECTIOUS DISEASES I", history: "QUIZ HISTORY <span>/</span> YOUR RESULTS", quiz: "QUIZ SESSION <span>/</span> IN PROGRESS", results: "QUIZ RESULTS <span>/</span> COMPLETE" };
  document.getElementById("crumb").innerHTML = names[viewName] || names.home;
  closeSidebar();
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  if (viewName === "history") renderHistory();
  if (viewName === "home") {
    updateHomeStats();
    renderModuleCoverage();
    renderOverviewPerformance();
    renderOverviewNotes();
  }
  if (viewName === "analysis") renderAnalysis();
  if (viewName === "notes") renderNotesPage();
  if (viewName === "create") updateBuilderSummary();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(function() { toast.classList.remove("show"); }, 2600);
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const holder = copy[i];
    copy[i] = copy[j];
    copy[j] = holder;
  }
  return copy;
}

function readTimerPart(id, maximum) {
  const input = document.getElementById(id);
  return Math.min(maximum, Math.max(0, Number(input.value) || 0));
}

function getTimerMinutes(normalizeInputs) {
  const hours = readTimerPart("timerHours", 12);
  const minutes = readTimerPart("timerMinutes", 59);
  if (normalizeInputs) {
    document.getElementById("timerHours").value = hours;
    document.getElementById("timerMinutes").value = minutes;
  }
  return hours * 60 + minutes;
}

function updateTimerSettingLabel() {
  const totalMinutes = getTimerMinutes(false);
  const label = document.getElementById("timerValue");
  if (totalMinutes === 0) {
    label.textContent = "Set at least 1 minute, or turn the timer off.";
    return;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours) parts.push(hours + " hour" + (hours === 1 ? "" : "s"));
  if (minutes) parts.push(minutes + " minute" + (minutes === 1 ? "" : "s"));
  label.textContent = parts.join(" ") + " per quiz";
}

function playAnswerSound(type) {
  MedRecallSound.play(type);
}

function startQuiz() {
  if (!progressReady) {
    showToast(progressError ? "Progress storage is unavailable in this browser." : "Loading your progress. Please try again in a moment.");
    return;
  }
  const countInput = document.getElementById("questionCount");
  const count = getRequestedQuestionCount();
  countInput.value = count;
  const mode = document.querySelector('input[name="quizMode"]:checked').value;
  const timerEnabled = document.getElementById("timerToggle").checked;
  const durationMins = getTimerMinutes(true);
  const name = document.getElementById("quizName").value.trim() || "Infectious diseases review";
  const pool = getEligibleQuestions();

  if (pool.length === 0) {
    showToast("Choose at least one matching topic first.");
    return;
  }
  if (count > pool.length) {
    showToast("There are only " + pool.length + " unique MCQs available. Repeats are not allowed.");
    updateBuilderSummary();
    return;
  }
  if (timerEnabled && durationMins === 0) {
    showToast("Set a timer of at least one minute, or switch the timer off.");
    return;
  }
  const questions = shuffle(pool).slice(0, count).map(function(item) { return Object.assign({}, item); });
  currentQuiz = {
    name: name,
    mode: mode,
    timerEnabled: timerEnabled,
    durationSeconds: durationMins * 60,
    secondsLeft: durationMins * 60,
    startedAt: Date.now(),
    questions: questions,
    answers: new Array(questions.length).fill(null),
    drafts: new Array(questions.length).fill(null),
    index: 0
  };
  saveActiveQuiz();
  captureBuilderSettings();
  reviewOnly = false;
  pendingAnswer = null;
  explanationOpen = false;
  setView("quiz");
  document.getElementById("quizNameTop").textContent = name;
  document.getElementById("quizTimer").style.visibility = timerEnabled ? "visible" : "hidden";
  renderQuestion();
  if (timerEnabled) {
    updateTimer();
    timerInterval = window.setInterval(function() {
      currentQuiz.secondsLeft -= 1;
      updateTimer();
      if (currentQuiz.secondsLeft <= 0) {
        clearInterval(timerInterval);
        showToast("Time is up - your quiz is complete.");
        finishQuiz();
      }
    }, 1000);
  }
}

function updateTimer() {
  if (!currentQuiz) return;
  const remainingSeconds = Math.max(currentQuiz.secondsLeft, 0);
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  document.querySelector("#quizTimer b").textContent = (hours ? String(hours).padStart(2, "0") + ":" : "") + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function renderQuestion() {
  const question = currentQuiz.questions[currentQuiz.index];
  const editingExam = currentQuiz.mode === "exam" && !reviewOnly;
  const chosen = editingExam ? null : currentQuiz.answers[currentQuiz.index];
  pendingAnswer = currentQuiz.drafts[currentQuiz.index];
  const subject = getSubjectForTopic(question.topic);
  const completeCount = (editingExam ? currentQuiz.drafts : currentQuiz.answers).filter(function(answer) { return answer !== null; }).length;
  document.getElementById("progressText").textContent = reviewOnly ? "REVIEW " + (currentQuiz.index + 1) + " OF " + currentQuiz.questions.length : "QUESTION " + (currentQuiz.index + 1) + " OF " + currentQuiz.questions.length;
  document.getElementById("scoreLive").textContent = currentQuiz.mode === "exam" && !reviewOnly ? completeCount + " answered" : getCorrectCount() + " correct";
  document.getElementById("quizProgress").style.width = ((currentQuiz.index + 1) / currentQuiz.questions.length * 100) + "%";
  document.getElementById("quizTopic").textContent = subject.title.toUpperCase();
  document.getElementById("questionText").textContent = question.text;
  document.getElementById("keyboardHint").textContent = reviewOnly ? "Review the correct answer and rationale" : chosen === null ? "Choose, then check your answer" : "Answer checked";
  if (editingExam) document.getElementById("keyboardHint").textContent = "Selections can be changed until you finish the exam";
  document.getElementById("nextButton").textContent = currentQuiz.index === currentQuiz.questions.length - 1 ? (reviewOnly ? "Back to results" : "Finish quiz →") : (reviewOnly ? "Next answer →" : "Next question →");
  const answerLetters = ["A", "B", "C", "D"];
  const shouldShowAnswerStates = reviewOnly || currentQuiz.mode === "recall";
  document.getElementById("answerList").innerHTML = question.answers.map(function(answer, index) {
    let className = "answer-option";
    const isWrongSelection = chosen !== null && chosen !== "unknown" && chosen === index && chosen !== question.correct;
    if (chosen !== null && chosen !== "unknown") {
      if (shouldShowAnswerStates) {
        if (index === question.correct) className += " correct";
        else if (index === chosen) className += " incorrect";
      } else if (index === chosen) {
        className += " selected";
      }
    } else if (!reviewOnly && chosen === null && index === pendingAnswer) {
      className += " selected";
    }
    const disabled = chosen !== null || reviewOnly ? "disabled" : "";
    const explanation = isWrongSelection && reviewOnly
      ? '<span class="answer-explanation"><b>Why?</b> ' + escapeHtml(question.explanation) + '</span>'
      : "";
    return '<button type="button" class="' + className + '" data-answer="' + index + '" aria-pressed="' + String(!reviewOnly && chosen === null && index === pendingAnswer) + '" ' + disabled + '><span class="answer-letter">' + answerLetters[index] + '</span><span class="answer-text">' + escapeHtml(answer) + '</span>' + explanation + '</button>';
  }).join("") + ((editingExam ? pendingAnswer : chosen) === "unknown" ? '<div class="unknown-answer-status">Marked as “I don’t know”. No explanation is shown for this question.</div>' : "");

  document.querySelectorAll("[data-answer]").forEach(function(button) {
    button.addEventListener("click", function() { chooseAnswer(Number(button.dataset.answer)); });
  });

  const feedback = document.getElementById("feedbackBox");
  if (currentQuiz.mode === "recall" && !reviewOnly && chosen === question.correct) {
    feedback.className = "feedback-box";
    feedback.innerHTML = "<strong>Correct.</strong> Nicely recalled.";
    feedback.style.display = "block";
  } else {
    feedback.style.display = "none";
  }
  const dontKnowButton = document.getElementById("dontKnowButton");
  dontKnowButton.disabled = chosen !== null || reviewOnly;
  dontKnowButton.textContent = chosen === "unknown" ? "Marked: I don't know" : "I don't know";
  const submitButton = document.getElementById("submitAnswerButton");
  submitButton.hidden = editingExam || reviewOnly || chosen !== null;
  submitButton.disabled = pendingAnswer === null;
  document.getElementById("nextButton").disabled = false;
  renderQuestionNavigation();
  const explanationControl = document.getElementById("explanationControl");
  explanationControl.hidden = currentQuiz.mode !== "recall" || reviewOnly || chosen === null || chosen === "unknown";
  const revealButton = document.getElementById("revealExplanation");
  revealButton.textContent = explanationOpen ? "Hide explanation" : "Reveal explanation";
  revealButton.setAttribute("aria-expanded", String(explanationOpen));
  const explanation = document.getElementById("questionExplanation");
  explanation.textContent = question.explanation;
  explanation.hidden = !explanationOpen || explanationControl.hidden;
  renderQuestionNoteEditor();
}

function chooseAnswer(answerIndex) {
  if (!currentQuiz || currentQuiz.finished || (currentQuiz.mode !== "exam" && currentQuiz.answers[currentQuiz.index] !== null) || reviewOnly) return;
  pendingAnswer = answerIndex;
  currentQuiz.drafts[currentQuiz.index] = answerIndex;
  document.querySelectorAll("[data-answer]").forEach(function(button) {
    const selected = Number(button.dataset.answer) === answerIndex;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.getElementById("submitAnswerButton").disabled = false;
  MedRecallSound.play("select");
  saveActiveQuiz();
  renderQuestionNavigation();
  if (currentQuiz.mode === "exam") {
    document.querySelector(".unknown-answer-status")?.remove();
    document.getElementById("scoreLive").textContent = currentQuiz.drafts.filter(function(answer) { return answer !== null; }).length + " answered";
  }
}

function submitAnswer() {
  if (!currentQuiz || currentQuiz.finished || currentQuiz.mode === "exam" || reviewOnly || pendingAnswer === null || currentQuiz.answers[currentQuiz.index] !== null) return;
  const answerIndex = pendingAnswer;
  pendingAnswer = null;
  explanationOpen = false;
  currentQuiz.answers[currentQuiz.index] = answerIndex;
  const question = currentQuiz.questions[currentQuiz.index];
  rememberAnsweredQuestion(question, answerIndex === question.correct ? "correct" : "wrong");
  saveActiveQuiz();
  playAnswerSound(currentQuiz.mode === "exam" ? "select" : answerIndex === question.correct ? "correct" : "wrong");
  renderQuestion();
}

function chooseUnknown() {
  if (!currentQuiz || currentQuiz.finished || (currentQuiz.mode !== "exam" && currentQuiz.answers[currentQuiz.index] !== null) || reviewOnly) return;
  currentQuiz.drafts[currentQuiz.index] = "unknown";
  pendingAnswer = null;
  explanationOpen = false;
  if (currentQuiz.mode !== "exam") {
    currentQuiz.answers[currentQuiz.index] = "unknown";
    rememberAnsweredQuestion(currentQuiz.questions[currentQuiz.index], "unknown");
  }
  saveActiveQuiz();
  MedRecallSound.play("unknown");
  renderQuestion();
}

function getCorrectCount() {
  if (!currentQuiz) return 0;
  return currentQuiz.answers.reduce(function(total, answer, index) {
    return total + (answer === currentQuiz.questions[index].correct ? 1 : 0);
  }, 0);
}

function getAnswerStatus(answer, question) {
  if (answer === "unknown" || answer === null) return "unknown";
  return answer === question.correct ? "correct" : "wrong";
}

function buildTopicBreakdown() {
  const breakdown = new Map();
  currentQuiz.questions.forEach(function(question, index) {
    const topicName = getTopicName(question.topic);
    const status = getAnswerStatus(currentQuiz.answers[index], question);
    if (!breakdown.has(topicName)) {
      breakdown.set(topicName, { topic: topicName, total: 0, correct: 0, wrong: 0, unknown: 0 });
    }
    const item = breakdown.get(topicName);
    item.total += 1;
    item[status] += 1;
  });
  return Array.from(breakdown.values());
}

function renderQuestionNavigation() {
  const jump = document.getElementById("questionJump");
  jump.innerHTML = currentQuiz.questions.map(function(question, index) {
    const status = currentQuiz.answers[index] !== null && (reviewOnly || currentQuiz.mode !== "exam") ? "Checked" : currentQuiz.drafts[index] !== null ? "Selected" : "Unanswered";
    return '<option value="' + index + '">' + (index + 1) + ' — ' + status + '</option>';
  }).join("");
  jump.value = String(currentQuiz.index);
  document.getElementById("previousQuestion").disabled = currentQuiz.index === 0;
  document.getElementById("forwardQuestion").disabled = currentQuiz.index === currentQuiz.questions.length - 1;
}

function goToQuestion(index) {
  if (!currentQuiz || index < 0 || index >= currentQuiz.questions.length || index === currentQuiz.index) return;
  currentQuiz.index = index;
  explanationOpen = false;
  saveActiveQuiz();
  renderQuestion();
}

function goToNextQuestion() {
  if (!currentQuiz) return;
  if (currentQuiz.index < currentQuiz.questions.length - 1) goToQuestion(currentQuiz.index + 1);
  else if (reviewOnly) setView("results");
  else finishQuiz();
}

function finishQuiz() {
  if (!currentQuiz || reviewOnly || currentQuiz.finished) return;
  currentQuiz.finished = true;
  // Exam selections remain editable until completion. Legacy saved exam answers
  // were already counted: replace that one outcome without adding another attempt.
  currentQuiz.questions.forEach(function(question, index) {
    const draft = currentQuiz.drafts[index];
    const old = currentQuiz.answers[index];
    if (draft === null || (currentQuiz.mode !== "exam" && old !== null)) return;
    const status = getAnswerStatus(draft, question);
    if (old === null) rememberAnsweredQuestion(question, status);
    else if (old !== draft) {
      const stats = progressState.questionStats[questionId(question)];
      const field = function(value) { return value === "wrong" ? "incorrect" : value; };
      if (stats) {
        stats[field(getAnswerStatus(old, question))] -= 1;
        stats[field(status)] += 1;
        stats.lastStatus = status;
      }
    }
    currentQuiz.answers[index] = draft;
  });
  clearInterval(timerInterval);
  const correct = getCorrectCount();
  const total = currentQuiz.questions.length;
  const perfect = total > 0 && correct === total;
  playAnswerSound(perfect ? "perfect" : "complete");
  document.querySelector(".results-card").classList.toggle("perfect-score", perfect);
  const percent = Math.round(correct / total * 100);
  const elapsed = currentQuiz.timerEnabled ? currentQuiz.durationSeconds - Math.max(currentQuiz.secondsLeft, 0) : Math.round((Date.now() - currentQuiz.startedAt) / 1000);
  const date = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const topicBreakdown = buildTopicBreakdown();
  const session = {
    name: currentQuiz.name,
    correct: correct,
    total: total,
    percent: percent,
    mode: currentQuiz.mode,
    date: date,
    time: formatDuration(elapsed),
    breakdown: topicBreakdown,
    answers: currentQuiz.questions.map(function(question, index) {
      return { id: questionId(question), topic: question.topic, status: getAnswerStatus(currentQuiz.answers[index], question) };
    })
  };
  const history = loadHistory();
  history.unshift({
    name: session.name,
    correct: session.correct,
    total: session.total,
    percent: session.percent,
    mode: session.mode,
    date: session.date,
    time: session.time
  });
  progressState.history = history.slice(0, 12);
  const sessionHistory = loadHistoryDetails();
  sessionHistory.unshift(session);
  progressState.sessionHistory = sessionHistory.slice(0, 12);
  progressState.lastSession = session;
  progressState.activeQuiz = null;
  saveProgress();
  updateHomeStats();
  renderOverviewPerformance();
  renderOverviewNotes();
  renderAnalysis();
  updateRevisitOptions();

  document.getElementById("resultPercent").textContent = percent + "%";
  document.getElementById("resultCorrect").textContent = correct;
  document.getElementById("resultTotal").textContent = total;
  document.getElementById("resultOutOf").textContent = correct + " / " + total;
  document.getElementById("resultTime").textContent = formatDuration(elapsed);
  document.getElementById("resultsMode").textContent = currentQuiz.mode.toUpperCase() + " SESSION COMPLETE";
  document.getElementById("resultDescription").textContent = resultMessage(percent, currentQuiz.mode);
  const unknownCount = session.answers.filter(function(item) { return item.status === "unknown"; }).length;
  const wrongCount = session.answers.filter(function(item) { return item.status === "wrong"; }).length;
  document.getElementById("resultTopicSummary").textContent = unknownCount + " marked “I don't know” · " + wrongCount + " answered wrong · Open Overview for the full topic breakdown.";
  setView("results");
}

function resultMessage(percent, mode) {
  if (percent >= 85) return "Excellent retrieval. You have a strong hold on this set of concepts.";
  if (percent >= 65) return "A solid session. Revisit the missed ideas, then return for another retrieval round.";
  if (mode === "exam") return "This result shows you where to focus next. Review the answers, then try Recall mode.";
  return "Every retrieval attempt builds memory. Review the answers and come back for another round.";
}

function formatDuration(seconds) {
  const mins = Math.floor(Math.max(seconds, 0) / 60);
  const secs = Math.max(seconds, 0) % 60;
  return mins ? mins + "m " + String(secs).padStart(2, "0") + "s" : secs + "s";
}

function loadHistory() {
  return progressState ? progressState.history : [];
}

function renderHistory() {
  const history = loadHistory();
  const historyList = document.getElementById("historyList");
  if (!history.length) {
    historyList.innerHTML = '<div class="empty-history"><strong>Your first quiz is waiting.</strong><span>Create a focused recall session and your results will appear here.</span></div>';
    return;
  }
  historyList.innerHTML = history.map(function(item) {
    return '<article class="history-card"><div class="history-score">' + item.percent + '%</div><div><b>' + escapeHtml(item.name) + '</b><small>' + item.correct + ' of ' + item.total + ' correct · ' + item.mode + ' mode · ' + escapeHtml(item.time) + '</small></div><time>' + escapeHtml(item.date) + '</time></article>';
  }).join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, function(character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character];
  });
}

function updateHomeStats() {
  const history = loadHistory();
  const answered = getBundledProgressEntries().filter(function(entry) { return entry.stats.attempts > 0; }).length;
  document.getElementById("answeredStat").textContent = answered;
  document.getElementById("accuracyStat").textContent = history.length ? Math.max.apply(null, history.map(function(item) { return item.percent; })) + "%" : "—";
}

function getBundledProgressEntries() {
  if (!progressState) return [];
  return Object.entries(progressState.questionStats).map(function(entry) {
    const question = bundledQuestionsById.get(entry[0]);
    return question ? { id: entry[0], question: question, stats: entry[1] } : null;
  }).filter(Boolean);
}

function getSubjectCoverage(subject) {
  const topicIds = new Set(subject.topics.map(function(topic) { return topic[0]; }));
  const total = builtInQuestionBank.reduce(function(sum, question) { return sum + (topicIds.has(question.topic) ? 1 : 0); }, 0);
  const entries = getBundledProgressEntries().filter(function(entry) { return topicIds.has(entry.question.topic) && entry.stats.attempts > 0; });
  const attempts = entries.reduce(function(sum, entry) { return sum + entry.stats.attempts; }, 0);
  const correct = entries.reduce(function(sum, entry) { return sum + entry.stats.correct; }, 0);
  const wrong = entries.reduce(function(sum, entry) { return sum + entry.stats.incorrect; }, 0);
  const unknown = entries.reduce(function(sum, entry) { return sum + entry.stats.unknown; }, 0);
  const unique = entries.length;
  return {
    id: subject.id, title: subject.title, total: total, unique: unique, attempts: attempts,
    correct: correct, wrong: wrong, unknown: unknown,
    coverage: total ? Math.round(unique / total * 100) : 0,
    accuracy: attempts ? Math.round(correct / attempts * 100) : 0
  };
}

function renderBankSize() {
  const count = builtInQuestionBank.length;
  document.getElementById("bankSizeSummary").textContent = count >= 1300
    ? "1,300+ MCQs ready for you to practice"
    : count.toLocaleString() + " MCQs ready for you to practice";
}

function renderModuleCoverage() {
  const subjectStats = subjects.map(getSubjectCoverage);
  const total = builtInQuestionBank.length;
  const unique = getBundledProgressEntries().filter(function(entry) { return entry.stats.attempts > 0; }).length;
  const coverage = total ? Math.round(unique / total * 100) : 0;
  document.getElementById("overallCoveragePercent").textContent = coverage + "%";
  document.getElementById("overallCoverageCount").textContent = unique.toLocaleString() + " / " + total.toLocaleString() + " answered";
  document.getElementById("overallCoverageBar").style.width = coverage + "%";
  document.getElementById("moduleCoverageList").innerHTML = subjectStats.map(function(item) {
    return '<article class="module-coverage-row"><div><b>' + escapeHtml(item.title) + '</b><span>' + item.unique.toLocaleString() + ' / ' + item.total.toLocaleString() + ' answered</span></div><strong>' + item.coverage + '%</strong><div class="coverage-track"><span style="width:' + item.coverage + '%"></span></div></article>';
  }).join("");
}

function loadHistoryDetails() {
  return progressState ? progressState.sessionHistory : [];
}

function collectPerformanceByTopic() {
  const stats = new Map();
  subjects.forEach(function(subject) {
    subject.topics.forEach(function(topic) {
      const available = bundledTopicCounts.get(topic[0]) || 0;
      stats.set(topic[0], { id: topic[0], title: topic[1], subject: subject.title, available: available, unique: 0, attempted: 0, correct: 0, wrong: 0, unknown: 0 });
    });
  });
  getBundledProgressEntries().forEach(function(entry) {
    const questionStats = entry.stats;
    const item = stats.get(entry.question.topic);
    if (!item) return;
    if (questionStats.attempts > 0) item.unique += 1;
    item.attempted += questionStats.attempts;
    item.correct += questionStats.correct;
    item.wrong += questionStats.incorrect;
    item.unknown += questionStats.unknown;
  });
  return Array.from(stats.values());
}

function renderAnalysis() {
  const stats = collectPerformanceByTopic();
  const attempted = stats.reduce(function(total, item) { return total + item.attempted; }, 0);
  const unique = stats.reduce(function(total, item) { return total + item.unique; }, 0);
  const correct = stats.reduce(function(total, item) { return total + item.correct; }, 0);
  const wrong = stats.reduce(function(total, item) { return total + item.wrong; }, 0);
  const unknown = stats.reduce(function(total, item) { return total + item.unknown; }, 0);
  const accuracy = attempted ? Math.round(correct / attempted * 100) : 0;
  const coverage = builtInQuestionBank.length ? Math.round(unique / builtInQuestionBank.length * 100) : 0;
  document.getElementById("analysisSummary").innerHTML =
    '<div class="analysis-stat"><span>TOTAL ATTEMPTS</span><b>' + attempted.toLocaleString() + '</b></div>' +
    '<div class="analysis-stat"><span>UNIQUE ANSWERED</span><b>' + unique.toLocaleString() + '</b></div>' +
    '<div class="analysis-stat"><span>CORRECT</span><b class="analysis-good">' + correct + '</b></div>' +
    '<div class="analysis-stat"><span>WRONG</span><b class="analysis-bad">' + wrong + '</b></div>' +
    '<div class="analysis-stat"><span>OVERALL ACCURACY</span><b>' + accuracy + '%</b><small>correct ÷ all attempts</small></div>' +
    '<div class="analysis-stat"><span>BANK COVERAGE</span><b>' + coverage + '%</b><small>' + unique + ' of ' + builtInQuestionBank.length.toLocaleString() + '</small></div>';
  document.getElementById("analysisRows").innerHTML = stats.map(function(item) {
    const percent = item.attempted ? Math.round(item.correct / item.attempted * 100) : 0;
    return '<tr><td><span class="analysis-topic-name">' + escapeHtml(item.title) + '</span><span class="analysis-topic-accuracy">' + percent + '% accuracy</span><span class="analysis-bar"><i style="width:' + percent + '%"></i></span></td><td data-label="Available">' + item.available + '</td><td data-label="Unique answered">' + item.unique + '</td><td data-label="Attempts">' + item.attempted + '</td><td class="analysis-good" data-label="Correct">' + item.correct + '</td><td class="analysis-bad" data-label="Wrong">' + item.wrong + '</td><td class="analysis-skip" data-label="Don’t know">' + item.unknown + '</td></tr>';
  }).join("");
  renderAnalysisDetails(stats);
}

function renderAnalysisDetails(topicStats) {
  const moduleStats = subjects.map(getSubjectCoverage);
  document.getElementById("moduleAnalysisList").innerHTML = moduleStats.map(function(item) {
    return '<article class="module-analysis-row"><div class="module-analysis-title"><b>' + escapeHtml(item.title) + '</b><span>' + item.unique + ' / ' + item.total + ' unique · ' + item.attempts + ' attempts</span></div><div class="module-analysis-meters"><span><i>Accuracy</i><b>' + item.accuracy + '%</b></span><div class="coverage-track"><span style="width:' + item.accuracy + '%"></span></div><span><i>Coverage</i><b>' + item.coverage + '%</b></span><div class="coverage-track coverage-track-secondary"><span style="width:' + item.coverage + '%"></span></div></div></article>';
  }).join("");
  const attemptedTopics = topicStats.filter(function(item) { return item.attempted > 0; }).map(function(item) {
    return Object.assign({}, item, { accuracy: Math.round(item.correct / item.attempted * 100) });
  });
  const strongest = attemptedTopics.slice().sort(function(a, b) { return b.accuracy - a.accuracy || b.attempted - a.attempted; }).slice(0, 3);
  const weakest = attemptedTopics.slice().sort(function(a, b) { return a.accuracy - b.accuracy || b.attempted - a.attempted; }).slice(0, 3);
  const unanswered = topicStats.reduce(function(sum, item) { return sum + Math.max(0, item.available - item.unique); }, 0);
  const incorrectQuestions = getBundledProgressEntries().filter(function(entry) { return entry.stats.incorrect > 0; }).length;
  const recent = loadHistoryDetails().slice(0, 5);
  const recentTotal = recent.reduce(function(sum, item) { return sum + item.total; }, 0);
  const recentCorrect = recent.reduce(function(sum, item) { return sum + item.correct; }, 0);
  const list = function(items) {
    return items.length ? items.map(function(item) { return '<li><span>' + escapeHtml(item.title) + '</span><b>' + item.accuracy + '%</b></li>'; }).join("") : '<li class="analysis-empty">Complete a quiz to populate this insight.</li>';
  };
  document.getElementById("analysisInsights").innerHTML =
    '<div class="insight-numbers"><span><b>' + unanswered.toLocaleString() + '</b> unanswered</span><span><b>' + incorrectQuestions.toLocaleString() + '</b> questions missed</span><span><b>' + (recentTotal ? Math.round(recentCorrect / recentTotal * 100) : 0) + '%</b> recent accuracy</span></div>' +
    '<div class="insight-lists"><div><h3>Strongest topics</h3><ol>' + list(strongest) + '</ol></div><div><h3>Weakest topics</h3><ol>' + list(weakest) + '</ol></div></div>';
}

function renderOverviewNotes() {
  const container = document.getElementById("overviewNotes");
  if (!container) return;
  const notes = loadMarkedQuestions();
  const markedCount = notes.filter(function(item) { return item.marked; }).length;
  container.innerHTML = '<div class="overview-notes-heading"><div><p class="eyebrow">YOUR MARKED QUESTIONS</p><h3>' + markedCount + ' saved for review</h3><p>Questions and personal notes are kept on this device.</p></div><button class="text-button" data-open-notes>View all <span>→</span></button></div>' +
    (notes.length ? '<div class="overview-note-list">' + notes.slice(0, 3).map(function(item) {
      return '<article class="overview-note-item"><b>' + escapeHtml(item.text) + '</b><small>' + escapeHtml(getTopicName(item.topic)) + '</small>' + (item.note ? '<p>' + escapeHtml(item.note) + '</p>' : '<p class="no-note">No note added yet.</p>') + '</article>';
    }).join("") + '</div>' : '<p class="no-saved-notes">Mark a question during a quiz to keep it here with your note.</p>');
  container.querySelector("[data-open-notes]").addEventListener("click", function() { setView("notes"); });
}

function renderNotesPage() {
  const container = document.getElementById("savedNotesList");
  const notes = loadMarkedQuestions();
  if (!notes.length) {
    container.innerHTML = '<div class="empty-history"><strong>No marked questions yet.</strong><span>During a quiz, select “Mark + note” to start a personal review list.</span></div>';
    return;
  }
  container.innerHTML = notes.map(function(item) {
    return '<article class="saved-note-card"><div class="saved-note-top"><span class="topic-pill">' + escapeHtml(getTopicName(item.topic)) + '</span><button class="remove-mark-button" data-remove-mark="' + encodeURIComponent(item.id) + '">Remove mark</button></div><h3>' + escapeHtml(item.text) + '</h3><p>' + (item.note ? escapeHtml(item.note) : '<span class="no-note">No personal note added.</span>') + '</p></article>';
  }).join("");
  container.querySelectorAll("[data-remove-mark]").forEach(function(button) {
    button.addEventListener("click", function() {
      const id = decodeURIComponent(button.dataset.removeMark);
      saveMarkedQuestions(loadMarkedQuestions().filter(function(item) { return item.id !== id; }));
      renderNotesPage();
    });
  });
}

function renderOverviewPerformance() {
  const container = document.getElementById("latestPerformance");
  const session = loadLastSession();
  if (!session) {
    container.innerHTML = '<div class="performance-empty"><div><p class="eyebrow">LATEST QUIZ BREAKDOWN</p><h3>Your topic results will appear here.</h3><p>Finish a quiz to see the number of MCQs, correct answers, wrong answers, and “I don’t know” responses for every topic you selected.</p></div><button class="outline-button" data-performance-create>Build a quiz <span>→</span></button></div>';
  } else {
    const rows = session.breakdown.map(function(item) {
      return '<article class="topic-performance-row"><div class="topic-performance-title"><b>' + escapeHtml(item.topic) + '</b><span>' + item.total + ' MCQ' + (item.total === 1 ? "" : "s") + '</span></div><div class="performance-counts"><span class="performance-correct"><b>' + item.correct + '</b> right</span><span class="performance-wrong"><b>' + item.wrong + '</b> wrong</span><span class="performance-unknown"><b>' + item.unknown + '</b> don’t know</span></div></article>';
    }).join("");
    container.innerHTML = '<div class="performance-heading"><div><p class="eyebrow">LATEST QUIZ BREAKDOWN</p><h3>' + escapeHtml(session.name) + '</h3><p>' + session.total + ' MCQs · ' + session.mode + ' mode · ' + escapeHtml(session.date) + '</p></div><button class="text-button" data-performance-create>New quiz <span>→</span></button></div><div class="topic-performance-list">' + rows + '</div>';
  }
  container.querySelectorAll("[data-performance-create]").forEach(function(button) {
    button.addEventListener("click", function() { setView("create"); });
  });
}

document.querySelectorAll(".nav-item[data-view]").forEach(function(button) {
  button.addEventListener("click", function() { setView(button.dataset.view); });
});
document.querySelectorAll("[data-go-create]").forEach(function(button) {
  button.addEventListener("click", function() { setView("create"); });
});
document.querySelectorAll("[data-quick-mode]").forEach(function(button) {
  button.addEventListener("click", function() {
    selectedTopics = new Set(["microbial-world", "bacterial-growth", "virus-features", "bacterial-genetics", "parasite-intro", "helminthology", "cell-wall-drugs", "rational-antimicrobials"]);
    document.querySelector('input[name="quizMode"][value="' + button.dataset.quickMode + '"]').checked = true;
    updateModeCards();
    renderSourceList();
    updateBuilderSummary();
    setView("create");
  });
});
function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  sidebar.classList.remove("open", "dragging");
  sidebar.style.transform = "";
  backdrop.style.opacity = "";
  backdrop.hidden = true;
  document.getElementById("menuButton").setAttribute("aria-expanded", "false");
  document.body.classList.remove("menu-open");
}

function openSidebar(moveFocus) {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  sidebar.classList.remove("dragging");
  sidebar.style.transform = "";
  backdrop.style.opacity = "";
  backdrop.hidden = false;
  sidebar.classList.add("open");
  document.getElementById("menuButton").setAttribute("aria-expanded", "true");
  document.body.classList.add("menu-open");
  if (moveFocus) document.getElementById("sidebarClose").focus();
}

document.getElementById("menuButton").addEventListener("click", function() {
  const open = !document.getElementById("sidebar").classList.contains("open");
  if (open) openSidebar(true);
  else closeSidebar();
});
document.getElementById("sidebarClose").addEventListener("click", function() {
  closeSidebar();
  document.getElementById("menuButton").focus();
});
document.getElementById("sidebarBackdrop").addEventListener("click", closeSidebar);
document.addEventListener("keydown", function(event) {
  if (event.key === "Escape" && document.getElementById("sidebar").classList.contains("open")) {
    closeSidebar();
    document.getElementById("menuButton").focus();
  }
});

const drawerMedia = window.matchMedia("(max-width: 900px), (max-width: 950px) and (max-height: 500px), (max-width: 1366px) and (pointer: coarse)");

function showFirstMobileNavigation() {
  if (!drawerMedia.matches || !window.matchMedia("(pointer: coarse)").matches) return;
  try {
    if (localStorage.getItem("medrecall-navigation-introduced-v1")) return;
    localStorage.setItem("medrecall-navigation-introduced-v1", "1");
    openSidebar(false);
  } catch (error) { /* Optional introduction must not affect study storage. */ }
}
drawerMedia.addEventListener("change", function() { closeSidebar(); });

(function enableDrawerGestures() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  let gesture = null;
  let suppressClickUntil = 0;
  document.addEventListener("touchstart", function(event) {
    if (!drawerMedia.matches || event.touches.length !== 1 || document.querySelector("dialog[open]")) { gesture = null; return; }
    const point = event.touches[0];
    const open = sidebar.classList.contains("open");
    const edge = Math.max(32, parseFloat(getComputedStyle(sidebar).paddingLeft) + 16);
    if (!open && point.clientX > edge) return;
    if (open && !sidebar.contains(event.target)) return;
    if (event.target.closest("input, textarea, select")) return;
    gesture = { id: point.identifier, startX: point.clientX, startY: point.clientY, x: point.clientX, open: open, dragging: false };
  }, { passive: true });
  document.addEventListener("touchmove", function(event) {
    if (!gesture) return;
    if (event.touches.length !== 1) { cancelGesture(); return; }
    const point = event.touches[0];
    if (point.identifier !== gesture.id) return;
    const dx = point.clientX - gesture.startX;
    const dy = point.clientY - gesture.startY;
    gesture.x = point.clientX;
    if (!gesture.dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { gesture = null; return; }
      const intendedDirection = gesture.open ? dx < -8 : dx > 8;
      if (!intendedDirection || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      gesture.dragging = true;
      sidebar.classList.add("dragging");
      backdrop.hidden = false;
    }
    if (event.cancelable) event.preventDefault();
    const width = sidebar.getBoundingClientRect().width;
    const offset = gesture.open ? Math.max(-width, Math.min(0, dx)) : Math.min(0, Math.max(-width, -width + dx));
    const openness = 1 + offset / width;
    sidebar.style.transform = "translateX(" + offset + "px)";
    backdrop.style.opacity = String(Math.max(0, Math.min(1, openness)));
  }, { passive: false });
  function finishGesture(event) {
    if (!gesture || !Array.from(event.changedTouches).some(function(point) { return point.identifier === gesture.id; })) return;
    if (!gesture.dragging) { gesture = null; return; }
    const dx = gesture.x - gesture.startX;
    const shouldOpen = gesture.open ? dx > -60 : dx > 60;
    gesture = null;
    suppressClickUntil = Date.now() + 400;
    if (shouldOpen) openSidebar(false);
    else closeSidebar();
  }
  document.addEventListener("touchend", finishGesture, { passive: true });
  function cancelGesture() {
    if (!gesture) return;
    const wasOpen = gesture.open;
    gesture = null;
    if (wasOpen) openSidebar(false);
    else closeSidebar();
  }
  document.addEventListener("touchcancel", cancelGesture, { passive: true });
  document.addEventListener("click", function(event) {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);
})();

function buildQuestionReport() {
  if (!currentQuiz) return "";
  const question = currentQuiz.questions[currentQuiz.index];
  const comment = document.getElementById("reportComment").value.trim();
  return [
    "MedRecall Question Report",
    "App: MedRecall v" + APP_VERSION,
    "Issue category: " + document.getElementById("reportIssueType").value,
    "Topic: " + getTopicName(question.topic) + " (" + question.topic + ")",
    "Question ID: " + questionId(question),
    "Question: " + question.text,
    "Student comment: " + (comment || "None provided")
  ].join("\n");
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy is unavailable in this browser.");
}

function openReportDialog() {
  if (!currentQuiz) return;
  const question = currentQuiz.questions[currentQuiz.index];
  document.getElementById("reportQuestionPreview").textContent = question.text;
  document.getElementById("reportIssueType").value = "Wrong answer";
  document.getElementById("reportComment").value = "";
  document.getElementById("reportStatus").textContent = navigator.onLine
    ? "WhatsApp will open with a prepared message. Nothing is sent automatically."
    : "You appear to be offline. Copy the report and send it when you are connected.";
  document.getElementById("reportDialog").showModal();
}

document.getElementById("reportQuestionButton").addEventListener("click", openReportDialog);
document.getElementById("copyReportButton").addEventListener("click", async function() {
  try {
    await copyText(buildQuestionReport());
    document.getElementById("reportStatus").textContent = "Report copied. You can paste it into WhatsApp when ready.";
    showToast("Question report copied.");
  } catch (error) {
    document.getElementById("reportStatus").textContent = "Copy failed: " + error.message;
  }
});
document.getElementById("openWhatsAppButton").addEventListener("click", function() {
  if (!navigator.onLine) {
    document.getElementById("reportStatus").textContent = "You are offline. Use Copy Report, then send it after reconnecting.";
    return;
  }
  window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(buildQuestionReport()), "_blank", "noopener,noreferrer");
});
document.getElementById("reportDialog").addEventListener("click", function(event) {
  if (event.target === this) this.close();
});
document.getElementById("contactDeveloperButton").addEventListener("click", function() {
  const message = "Hello Ziad, I’m contacting you about MedRecall v" + APP_VERSION + ".";
  if (!navigator.onLine) {
    copyText(message).then(function() { showToast("Offline: contact message copied for later."); }).catch(function() { showToast("You are offline. Contact: +962 77 980 9947"); });
    return;
  }
  window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
});
document.getElementById("timerToggle").addEventListener("change", function(event) {
  document.getElementById("timerControls").classList.toggle("disabled", !event.target.checked);
});
document.querySelectorAll("#timerHours, #timerMinutes").forEach(function(input) {
  input.addEventListener("input", updateTimerSettingLabel);
  input.addEventListener("blur", function() {
    getTimerMinutes(true);
    updateTimerSettingLabel();
  });
});
document.getElementById("questionCount").addEventListener("input", updateBuilderSummary);
document.getElementById("selectAllPractice").addEventListener("click", function() {
  document.querySelectorAll('input[name="reuseMode"]').forEach(function(input) { input.checked = !input.disabled; });
  updateRevisitCards();
  updateBuilderSummary();
});
document.getElementById("clearPractice").addEventListener("click", function() {
  document.querySelectorAll('input[name="reuseMode"]').forEach(function(input) { input.checked = false; });
  updateRevisitCards();
  updateBuilderSummary();
});
document.querySelectorAll('input[name="reuseMode"]').forEach(function(input) {
  input.addEventListener("change", function() {
    updateRevisitCards();
    updateBuilderSummary();
  });
});
document.querySelectorAll('input[name="quizMode"]').forEach(function(input) {
  input.addEventListener("change", updateModeCards);
});
document.getElementById("quizBuilder").addEventListener("submit", function(event) {
  event.preventDefault();
  startQuiz();
});
document.getElementById("nextButton").addEventListener("click", goToNextQuestion);
document.getElementById("previousQuestion").addEventListener("click", function() { goToQuestion(currentQuiz.index - 1); });
document.getElementById("forwardQuestion").addEventListener("click", function() { goToQuestion(currentQuiz.index + 1); });
document.getElementById("questionJump").addEventListener("change", function(event) { goToQuestion(Number(event.target.value)); });
document.getElementById("performanceShortcut").addEventListener("click", function() { setView("analysis"); });
document.getElementById("submitAnswerButton").addEventListener("click", submitAnswer);
document.getElementById("revealExplanation").addEventListener("click", function() {
  if (!currentQuiz || currentQuiz.mode !== "recall" || reviewOnly || currentQuiz.answers[currentQuiz.index] === null || currentQuiz.answers[currentQuiz.index] === "unknown") return;
  explanationOpen = !explanationOpen;
  const button = document.getElementById("revealExplanation");
  button.textContent = explanationOpen ? "Hide explanation" : "Reveal explanation";
  button.setAttribute("aria-expanded", String(explanationOpen));
  document.getElementById("questionExplanation").hidden = !explanationOpen;
});
document.getElementById("dontKnowButton").addEventListener("click", chooseUnknown);
document.getElementById("markQuestionButton").addEventListener("click", toggleQuestionMark);
document.getElementById("saveQuestionNote").addEventListener("click", saveCurrentQuestionNote);
document.getElementById("questionNote").addEventListener("input", function() {
  document.getElementById("noteSaveStatus").textContent = "Unsaved changes";
});
document.getElementById("exitQuiz").addEventListener("click", function() {
  clearInterval(timerInterval);
  if (progressState) {
    progressState.activeQuiz = null;
    saveProgress();
  }
  setView("create");
});
document.getElementById("newQuiz").addEventListener("click", function() {
  currentQuiz = null;
  reviewOnly = false;
  setView("create");
});
document.getElementById("reviewQuiz").addEventListener("click", function() {
  if (!currentQuiz) return;
  reviewOnly = true;
  currentQuiz.index = 0;
  pendingAnswer = null;
  explanationOpen = false;
  setView("quiz");
  document.getElementById("quizTimer").style.visibility = "hidden";
  renderQuestion();
});
document.getElementById("uploadHint").addEventListener("click", function() {
  showToast("Source uploads are the next step for expanding beyond this module.");
});
document.getElementById("questionImportButton").addEventListener("click", function() {
  document.getElementById("questionImport").click();
});
document.getElementById("questionImport").addEventListener("change", function(event) {
  importQuestionFile(event.target.files[0]);
  event.target.value = "";
});

function updateModeCards() {
  document.querySelectorAll(".mode-option").forEach(function(option) {
    option.classList.toggle("selected", option.querySelector("input").checked);
  });
}

function updateProgressStatus(message) {
  document.getElementById("progressStorageStatus").textContent = message;
}

function captureBuilderSettings() {
  if (!progressReady) return;
  progressState.settings = {
    name: document.getElementById("quizName").value,
    mode: document.querySelector('input[name="quizMode"]:checked').value,
    timerEnabled: document.getElementById("timerToggle").checked,
    timerHours: getTimerMinutes(false) === 0 ? 0 : readTimerPart("timerHours", 12),
    timerMinutes: readTimerPart("timerMinutes", 59),
    count: getRequestedQuestionCount(),
    topics: Array.from(selectedTopics)
  };
  saveProgress();
}

function restoreBuilderSettings() {
  const settings = progressState.settings;
  if (!settings || !Object.keys(settings).length) {
    document.getElementById("quizName").value = "Infectious diseases review";
    document.querySelector('input[name="quizMode"][value="recall"]').checked = true;
    document.getElementById("timerToggle").checked = true;
    document.getElementById("timerHours").value = 0;
    document.getElementById("timerMinutes").value = 20;
    document.getElementById("questionCount").value = 10;
    document.getElementById("timerControls").classList.remove("disabled");
    updateTimerSettingLabel();
    updateModeCards();
    return;
  }
  if (typeof settings.name === "string") document.getElementById("quizName").value = settings.name;
  if (["recall", "exam"].includes(settings.mode)) document.querySelector('input[name="quizMode"][value="' + settings.mode + '"]').checked = true;
  if (typeof settings.timerEnabled === "boolean") document.getElementById("timerToggle").checked = settings.timerEnabled;
  if (Number.isInteger(settings.timerHours)) document.getElementById("timerHours").value = settings.timerHours;
  if (Number.isInteger(settings.timerMinutes)) document.getElementById("timerMinutes").value = settings.timerMinutes;
  if (Number.isInteger(settings.count)) document.getElementById("questionCount").value = settings.count;
  if (Array.isArray(settings.topics)) selectedTopics = new Set(settings.topics.filter(function(id) { return validTopicIds.has(id); }));
  document.getElementById("timerControls").classList.toggle("disabled", !document.getElementById("timerToggle").checked);
  updateTimerSettingLabel();
  updateModeCards();
}

function refreshProgressViews() {
  restoreBuilderSettings();
  renderSourceList();
  updateRevisitOptions();
  updateBuilderSummary();
  updateHomeStats();
  renderModuleCoverage();
  renderOverviewPerformance();
  renderOverviewNotes();
  renderAnalysis();
  renderNotesPage();
  renderHistory();
  const attempts = Object.values(progressState.questionStats).reduce(function(total, item) { return total + item.attempts; }, 0);
  updateProgressStatus(attempts + " attempts saved on this device in IndexedDB.");
}

async function initializeProgress() {
  try {
    const stored = await MedRecallProgress.read();
    if (stored) {
      if (!("activeQuiz" in stored)) stored.activeQuiz = null;
      if (!MedRecallProgress.validate(stored)) throw new Error("Saved progress needs a backup or repair.");
      progressState = stored;
    } else {
      let migrated = { found: false, state: MedRecallProgress.empty() };
      try { migrated = MedRecallProgress.migrateLegacy(localStorage); } catch (error) {}
      progressState = migrated.state;
      if (!MedRecallProgress.validate(progressState)) throw new Error("Existing progress could not be migrated safely.");
      await MedRecallProgress.save(progressState);
      if (migrated.found) MedRecallProgress.removeLegacy(localStorage);
    }
    progressReady = true;
    refreshProgressViews();
    restoreActiveQuiz();
    showFirstMobileNavigation();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function() {});
  } catch (error) {
    progressError = error;
    updateProgressStatus("Progress storage unavailable: " + error.message);
    updateBuilderSummary();
  }
}

async function exportProgress() {
  if (!progressReady) return;
  try {
    captureBuilderSettings();
    await MedRecallProgress.flush().catch(function() {});
    const backup = MedRecallProgress.makeBackup(progressState);
    const url = URL.createObjectURL(new Blob([backup], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "medrecall-progress-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
    showToast("Progress backup downloaded.");
  } catch (error) {
    showToast("Export failed: " + error.message);
  }
}

async function importProgress(file) {
  if (!file || !progressReady) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("Backup is larger than 10 MB.");
    const imported = MedRecallProgress.parseBackup(await file.text());
    if (!window.confirm(MedRecallI18n.t("Replace all progress on this device with this backup?"))) return;
    await MedRecallProgress.flush().catch(function() {});
    await MedRecallProgress.save(imported);
    progressState = imported;
    currentQuiz = null;
    reviewOnly = false;
    clearInterval(timerInterval);
    refreshProgressViews();
    setView("home");
    showToast("Progress restored from backup.");
  } catch (error) {
    showToast("Import failed: " + error.message);
  }
}

async function resetProgress() {
  if (!progressReady || !window.confirm(MedRecallI18n.t("Reset all attempts, quiz history, bookmarks, notes, and settings on this device? Export a backup first if you need them."))) return;
  try {
    await MedRecallProgress.flush().catch(function() {});
    const cleared = MedRecallProgress.empty();
    await MedRecallProgress.save(cleared);
    progressState = cleared;
    currentQuiz = null;
    reviewOnly = false;
    clearInterval(timerInterval);
    selectedTopics = new Set();
    refreshProgressViews();
    setView("home");
    showToast("Progress reset on this device.");
  } catch (error) {
    showToast("Reset failed: " + error.message);
  }
}

document.getElementById("exportProgressButton").addEventListener("click", exportProgress);
document.getElementById("importProgressButton").addEventListener("click", function() { document.getElementById("progressImportFile").click(); });
document.getElementById("progressImportFile").addEventListener("change", function(event) {
  importProgress(event.target.files[0]);
  event.target.value = "";
});
document.getElementById("resetProgressButton").addEventListener("click", resetProgress);
document.getElementById("quizBuilder").addEventListener("change", captureBuilderSettings);
document.getElementById("quizName").addEventListener("blur", captureBuilderSettings);

loadImportedQuestions();
renderBankSize();
renderSourceList();
renderLibrary();
updateTimerSettingLabel();
updateBuilderSummary();
initializeProgress().finally(function() { MedRecallUX.finishLoading(); });

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  let wasControlled = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", function() {
    if (wasControlled) {
      document.getElementById("offlineStatus").dataset.updateNotice = " A MedRecall update is ready. Reload after your quiz to use it.";
    }
    wasControlled = true;
    MedRecallUX.checkOffline(navigator.serviceWorker.controller);
  });
  navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" }).then(function(registration) {
    registration.update().catch(function() {});
    return navigator.serviceWorker.ready;
  }).then(function(registration) {
    MedRecallUX.checkOffline(registration.active);
  }).catch(function(error) {
    document.getElementById("offlineStatus").textContent = "Offline setup failed: " + error.message;
  });
} else {
  document.getElementById("offlineStatus").textContent = "Open the HTTPS link to install and prepare offline access.";
}

/* Student data only. The bundled MCQ bank is never written to IndexedDB. */
(function(global) {
  "use strict";

  const databaseName = "medrecall-student-progress";
  const storeName = "records";
  const recordKey = "progress";
  const legacyKeys = [
    "medrecall-answered-questions", "medrecall-marked-questions", "medrecall-history",
    "medrecall-session-history", "medrecall-last-session"
  ];
  let databasePromise;
  let pendingWrite = Promise.resolve();
  function validQuestionId(id) {
    return typeof id === "string" && (/^q1-[0-9a-f]{32}$/.test(id) || /^pastmock-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));
  }

  function questionId(question) {
    if (question.topic === "past-mock-exams" && validQuestionId(question.id) && question.id.startsWith("pastmock-")) return question.id;
    // Four independent 32-bit FNV-1a passes give a stable, compact 128-bit ID.
    // Length prefixes make topic/text boundaries unambiguous.
    const input = question.topic.length + ":" + question.topic + question.text.length + ":" + question.text;
    const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    return "q1-" + seeds.map(function(seed) {
      let hash = seed;
      for (let index = 0; index < input.length; index += 1) {
        hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    }).join("");
  }

  function empty() {
    return {
      schemaVersion: 1,
      seenQuestionIds: [],
      questionStats: {},
      markedQuestions: [],
      history: [],
      sessionHistory: [],
      lastSession: null,
      activeQuiz: null,
      lastStudiedTopic: null,
      settings: {},
      profile: { name: "" },
      uiPreferences: { theme: "dark" }
    };
  }

  function openDatabase() {
    if (!global.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
    if (!databasePromise) {
      databasePromise = new Promise(function(resolve, reject) {
        const request = global.indexedDB.open(databaseName, 1);
        request.onupgradeneeded = function() {
          if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
        };
        request.onsuccess = function() {
          const database = request.result;
          database.onversionchange = function() { database.close(); databasePromise = null; };
          resolve(database);
        };
        request.onerror = function() { reject(request.error || new Error("Could not open progress storage.")); };
        request.onblocked = function() { reject(new Error("Close other MedRecall tabs to update progress storage.")); };
      }).catch(function(error) { databasePromise = null; throw error; });
    }
    return databasePromise;
  }

  async function read() {
    const database = await openDatabase();
    return new Promise(function(resolve, reject) {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(recordKey);
      request.onsuccess = function() { resolve(request.result || null); };
      request.onerror = function() { reject(request.error || new Error("Could not read progress.")); };
    });
  }

  function writeSnapshot(snapshot) {
    return openDatabase().then(function(database) {
      return new Promise(function(resolve, reject) {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(snapshot, recordKey);
        transaction.oncomplete = function() { resolve(); };
        transaction.onerror = function() { reject(transaction.error || new Error("Could not save progress.")); };
        transaction.onabort = function() { reject(transaction.error || new Error("Progress save was cancelled.")); };
      });
    });
  }

  function save(state) {
    const snapshot = JSON.parse(JSON.stringify(state));
    pendingWrite = pendingWrite.catch(function() {}).then(function() { return writeSnapshot(snapshot); });
    return pendingWrite;
  }

  function flush() { return pendingWrite; }

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function onlyKeys(value, allowed) {
    return Object.keys(value).every(function(key) { return allowed.includes(key); });
  }

  function validBreakdown(item) {
    return plainObject(item) && onlyKeys(item, ["topic", "total", "correct", "wrong", "unknown", "unanswered", "idk"]) &&
      typeof item.topic === "string" && ["total", "correct", "wrong", "unknown"].every(function(field) {
        return Number.isSafeInteger(item[field]) && item[field] >= 0;
      }) && ["unanswered", "idk"].every(function(field) { return !(field in item) || Number.isSafeInteger(item[field]) && item[field] >= 0; });
  }

  function validSession(session) {
    return plainObject(session) && onlyKeys(session, ["name", "correct", "total", "percent", "mode", "date", "time", "breakdown", "answers", "completedAt", "idkCount", "unansweredCount"]) &&
      typeof session.name === "string" && ["correct", "total", "percent"].every(function(field) { return Number.isFinite(session[field]); }) &&
      (!("completedAt" in session) || Number.isFinite(session.completedAt)) &&
      ["idkCount", "unansweredCount"].every(function(field) { return !(field in session) || Number.isSafeInteger(session[field]) && session[field] >= 0; }) &&
      ["recall", "exam"].includes(session.mode) && typeof session.date === "string" && typeof session.time === "string" &&
      Array.isArray(session.breakdown) && session.breakdown.every(validBreakdown) &&
      Array.isArray(session.answers) && session.answers.every(function(answer) {
        return plainObject(answer) && onlyKeys(answer, ["id", "topic", "status", "idk"]) && validQuestionId(answer.id) && typeof answer.topic === "string" &&
          ["correct", "wrong", "unknown", "unanswered"].includes(answer.status) && (!("idk" in answer) || typeof answer.idk === "boolean");
      });
  }

  function validActiveQuiz(quiz) {
    return plainObject(quiz) && onlyKeys(quiz, ["name", "mode", "timerEnabled", "durationSeconds", "secondsLeft", "startedAt", "savedAt", "questionIds", "answers", "draftAnswers", "idkFlags", "sessionId", "index"]) &&
      typeof quiz.name === "string" && ["recall", "exam"].includes(quiz.mode) && typeof quiz.timerEnabled === "boolean" &&
      ["durationSeconds", "secondsLeft", "startedAt", "savedAt", "index"].every(function(field) { return Number.isFinite(quiz[field]); }) &&
      Array.isArray(quiz.questionIds) && quiz.questionIds.length > 0 && quiz.questionIds.length <= 200 &&
      quiz.questionIds.every(validQuestionId) &&
      Array.isArray(quiz.answers) && quiz.answers.length === quiz.questionIds.length &&
      quiz.answers.every(function(answer) { return answer === null || answer === "unknown" || Number.isInteger(answer) && answer >= 0 && answer <= 3; }) &&
      (!('draftAnswers' in quiz) || Array.isArray(quiz.draftAnswers) && quiz.draftAnswers.length === quiz.answers.length && quiz.draftAnswers.every(function(answer) { return answer === null || answer === "unknown" || Number.isInteger(answer) && answer >= 0 && answer <= 3; })) &&
      (!("idkFlags" in quiz) || Array.isArray(quiz.idkFlags) && quiz.idkFlags.length === quiz.answers.length && quiz.idkFlags.every(function(flag) { return typeof flag === "boolean"; })) &&
      (!("sessionId" in quiz) || typeof quiz.sessionId === "string") &&
      Number.isInteger(quiz.index) && quiz.index >= 0 && quiz.index < quiz.questionIds.length;
  }

  function validate(state) {
    if (!plainObject(state) || !onlyKeys(state, ["schemaVersion", "seenQuestionIds", "questionStats", "markedQuestions", "history", "sessionHistory", "lastSession", "activeQuiz", "lastStudiedTopic", "settings", "profile", "uiPreferences"]) || state.schemaVersion !== 1 ||
        !Array.isArray(state.seenQuestionIds) || state.seenQuestionIds.length > 100000 ||
        !state.seenQuestionIds.every(validQuestionId) ||
        !plainObject(state.questionStats) || Object.keys(state.questionStats).length > 100000 ||
        !Array.isArray(state.markedQuestions) || state.markedQuestions.length > 100000 ||
        !Array.isArray(state.history) || state.history.length > 1000 ||
        !Array.isArray(state.sessionHistory) || state.sessionHistory.length > 1000 ||
        !plainObject(state.settings) || !onlyKeys(state.settings, ["name", "mode", "timerEnabled", "timerHours", "timerMinutes", "count", "topics"]) ||
        ("profile" in state && (!plainObject(state.profile) || !onlyKeys(state.profile, ["name"]) || typeof state.profile.name !== "string" || state.profile.name.length > 80)) ||
        ("uiPreferences" in state && (!plainObject(state.uiPreferences) || !onlyKeys(state.uiPreferences, ["theme"]) || !["dark", "light"].includes(state.uiPreferences.theme))) ||
        !(state.lastStudiedTopic === null || typeof state.lastStudiedTopic === "string") ||
        !(state.lastSession === null || validSession(state.lastSession)) ||
        !(state.activeQuiz === null || validActiveQuiz(state.activeQuiz))) return false;

    if (!Object.entries(state.questionStats).every(function(entry) {
      const item = entry[1];
      return validQuestionId(entry[0]) && plainObject(item) &&
        onlyKeys(item, ["topic", "attempts", "correct", "incorrect", "unknown", "lastStatus", "lastAttemptedAt"]) && typeof item.topic === "string" &&
        ["attempts", "correct", "incorrect", "unknown"].every(function(field) {
          return Number.isSafeInteger(item[field]) && item[field] >= 0;
        }) && item.attempts === item.correct + item.incorrect + item.unknown &&
        ["correct", "wrong", "unknown"].includes(item.lastStatus) && Number.isFinite(item.lastAttemptedAt);
    })) return false;

    if (!state.markedQuestions.every(function(item) {
      return plainObject(item) && onlyKeys(item, ["id", "topic", "text", "marked", "note"]) && validQuestionId(item.id) &&
        typeof item.topic === "string" && typeof item.text === "string" &&
        typeof item.marked === "boolean" && typeof item.note === "string";
    })) return false;

    if (!state.history.every(function(item) {
      return plainObject(item) && onlyKeys(item, ["name", "correct", "total", "percent", "mode", "date", "time"]) && typeof item.name === "string" &&
        ["correct", "total", "percent"].every(function(field) { return Number.isFinite(item[field]); }) &&
        ["recall", "exam"].includes(item.mode) && typeof item.date === "string" && typeof item.time === "string";
    })) return false;
    if (!state.sessionHistory.every(validSession)) return false;
    const settings = state.settings;
    if ("name" in settings && typeof settings.name !== "string" ||
        "mode" in settings && !["recall", "exam"].includes(settings.mode) ||
        "timerEnabled" in settings && typeof settings.timerEnabled !== "boolean" ||
        "timerHours" in settings && (!Number.isInteger(settings.timerHours) || settings.timerHours < 0 || settings.timerHours > 12) ||
        "timerMinutes" in settings && (!Number.isInteger(settings.timerMinutes) || settings.timerMinutes < 0 || settings.timerMinutes > 59) ||
        "count" in settings && (!Number.isInteger(settings.count) || settings.count < 1 || settings.count > 200) ||
        "topics" in settings && (!Array.isArray(settings.topics) || !settings.topics.every(function(topic) { return typeof topic === "string"; }))) return false;
    return true;
  }

  function parseBackup(contents) {
    const backup = JSON.parse(contents);
    if (!plainObject(backup) || !onlyKeys(backup, ["format", "version", "exportedAt", "progress"]) ||
        backup.format !== "medrecall-progress" || backup.version !== 1 || typeof backup.exportedAt !== "string" ||
        !validate(backup.progress)) {
      throw new Error("This is not a valid MedRecall progress backup.");
    }
    return backup.progress;
  }

  function makeBackup(state) {
    if (!validate(state)) throw new Error("Progress is incomplete and cannot be exported.");
    return JSON.stringify({ format: "medrecall-progress", version: 1, exportedAt: new Date().toISOString(), progress: state }, null, 2);
  }

  function migrateLegacy(storage) {
    const state = empty();
    let found = false;
    function readKey(key, fallback) {
      try {
        const value = storage.getItem(key);
        if (value === null) return fallback;
        found = true;
        return JSON.parse(value);
      } catch (error) { return fallback; }
    }
    function idFromKey(key) {
      if (typeof key !== "string" || !key.includes("::")) return null;
      const delimiter = key.indexOf("::");
      return questionId({ topic: key.slice(0, delimiter), text: key.slice(delimiter + 2) });
    }
    function sessionFromLegacy(session) {
      if (!plainObject(session) || !Array.isArray(session.answers)) return null;
      const answers = session.answers.map(function(item) {
        const id = idFromKey(item.key);
        return id && typeof item.topic === "string" && ["correct", "wrong", "unknown"].includes(item.status)
          ? { id: id, topic: item.topic, status: item.status } : null;
      }).filter(Boolean);
      return Object.assign({}, session, { answers: answers });
    }
    const seen = readKey("medrecall-answered-questions", []);
    if (Array.isArray(seen)) state.seenQuestionIds = Array.from(new Set(seen.map(idFromKey).filter(Boolean)));
    const marked = readKey("medrecall-marked-questions", []);
    if (Array.isArray(marked)) state.markedQuestions = marked.map(function(item) {
      const id = idFromKey(item.key);
      return id && typeof item.topic === "string" && typeof item.text === "string"
        ? { id: id, topic: item.topic, text: item.text, marked: Boolean(item.marked), note: typeof item.note === "string" ? item.note : "" } : null;
    }).filter(Boolean);
    const history = readKey("medrecall-history", []);
    if (Array.isArray(history)) state.history = history;
    const details = readKey("medrecall-session-history", []);
    if (Array.isArray(details)) state.sessionHistory = details.map(sessionFromLegacy).filter(Boolean);
    state.lastSession = sessionFromLegacy(readKey("medrecall-last-session", null));
    state.sessionHistory.slice().reverse().forEach(function(session) {
      session.answers.forEach(function(answer) {
        const item = state.questionStats[answer.id] || { topic: answer.topic, attempts: 0, correct: 0, incorrect: 0, unknown: 0, lastStatus: answer.status, lastAttemptedAt: 0 };
        item.attempts += 1;
        item[answer.status === "wrong" ? "incorrect" : answer.status] += 1;
        item.lastStatus = answer.status;
        state.questionStats[answer.id] = item;
      });
    });
    state.sessionHistory = state.sessionHistory.slice(0, 12);
    if (state.lastSession && state.lastSession.answers.length) state.lastStudiedTopic = state.lastSession.answers[0].topic;
    return { found: found, state: state };
  }

  function removeLegacy(storage) {
    legacyKeys.forEach(function(key) { try { storage.removeItem(key); } catch (error) {} });
  }

  global.MedRecallProgress = {
    empty: empty, read: read, save: save, flush: flush, questionId: questionId,
    validate: validate, makeBackup: makeBackup, parseBackup: parseBackup,
    migrateLegacy: migrateLegacy, removeLegacy: removeLegacy
  };
})(window);

"use strict";

const ACCOUNTS_KEY = "group-notes-accounts-v2";
const SESSION_KEY = "group-notes-session-v2";
const ROOM_STORAGE_PREFIX = "group-notes-room-v2-";
const LEGACY_STORAGE_KEY = "group-notes-workspace-v1";
const CHANNEL_PREFIX = "group-notes-sync-v2-";
const HISTORY_LIMIT = 12;
const ALL_SUBJECTS = "Все";
const DEFAULT_SUBJECT = "Новая дисциплина";

const colors = ["#247a74", "#2f5f9f", "#8b5a2b", "#a04452", "#536b2f", "#6b4aa0"];
const clientId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

const els = {
  authScreen: document.querySelector("#authScreen"),
  appShell: document.querySelector("#appShell"),
  loginTab: document.querySelector("#loginTab"),
  registerTab: document.querySelector("#registerTab"),
  authForm: document.querySelector("#authForm"),
  authNameField: document.querySelector("#authNameField"),
  authName: document.querySelector("#authName"),
  authLogin: document.querySelector("#authLogin"),
  authPassword: document.querySelector("#authPassword"),
  authPasswordConfirmField: document.querySelector("#authPasswordConfirmField"),
  authPasswordConfirm: document.querySelector("#authPasswordConfirm"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  authMessage: document.querySelector("#authMessage"),
  roomModal: document.querySelector("#roomModal"),
  closeRoomModalButton: document.querySelector("#closeRoomModalButton"),
  createRoomForm: document.querySelector("#createRoomForm"),
  roomNameInput: document.querySelector("#roomNameInput"),
  joinRoomForm: document.querySelector("#joinRoomForm"),
  joinRoomCodeInput: document.querySelector("#joinRoomCodeInput"),
  roomResult: document.querySelector("#roomResult"),
  createdRoomCode: document.querySelector("#createdRoomCode"),
  copyRoomCodeButton: document.querySelector("#copyRoomCodeButton"),
  openRoomButton: document.querySelector("#openRoomButton"),
  roomMessage: document.querySelector("#roomMessage"),
  currentRoomName: document.querySelector("#currentRoomName"),
  currentRoomCodeSmall: document.querySelector("#currentRoomCodeSmall"),
  copyRoomCodeSmallButton: document.querySelector("#copyRoomCodeSmallButton"),
  roomInfo: document.querySelector("#roomInfo"),
  roomButton: document.querySelector("#roomButton"),
  logoutButton: document.querySelector("#logoutButton"),
  userName: document.querySelector("#userName"),
  userAvatar: document.querySelector("#userAvatar"),
  newNoteButton: document.querySelector("#newNoteButton"),
  searchInput: document.querySelector("#searchInput"),
  subjectFilter: document.querySelector("#subjectFilter"),
  subjectForm: document.querySelector("#subjectForm"),
  newSubjectInput: document.querySelector("#newSubjectInput"),
  subjectChips: document.querySelector("#subjectChips"),
  resetHistoryButton: document.querySelector("#resetHistoryButton"),
  noteList: document.querySelector("#noteList"),
  syncStatus: document.querySelector("#syncStatus"),
  currentNoteHeading: document.querySelector("#currentNoteHeading"),
  saveFileButton: document.querySelector("#saveFileButton"),
  saveModal: document.querySelector("#saveModal"),
  closeSaveModalButton: document.querySelector("#closeSaveModalButton"),
  cancelSaveButton: document.querySelector("#cancelSaveButton"),
  saveForm: document.querySelector("#saveForm"),
  saveFileName: document.querySelector("#saveFileName"),
  saveFormat: document.querySelector("#saveFormat"),
  saveMessage: document.querySelector("#saveMessage"),
  importJsonInput: document.querySelector("#importJsonInput"),
  deleteNoteButton: document.querySelector("#deleteNoteButton"),
  noteTitle: document.querySelector("#noteTitle"),
  noteSubject: document.querySelector("#noteSubject"),
  noteTags: document.querySelector("#noteTags"),
  subjectSuggestions: document.querySelector("#subjectSuggestions"),
  tagCloud: document.querySelector("#tagCloud"),
  noteContent: document.querySelector("#noteContent"),
  preview: document.querySelector("#preview"),
  presenceCount: document.querySelector("#presenceCount"),
  presenceList: document.querySelector("#presenceList"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  openTasksCount: document.querySelector("#openTasksCount"),
  commentForm: document.querySelector("#commentForm"),
  commentInput: document.querySelector("#commentInput"),
  commentList: document.querySelector("#commentList"),
  commentsCount: document.querySelector("#commentsCount"),
  historyList: document.querySelector("#historyList"),
  historyCount: document.querySelector("#historyCount"),
  toast: document.querySelector("#toast")
};

let authMode = "login";
let currentUser = null;
let activeRoomCode = null;
let state = null;
let roomChannel = null;
let filters = { search: "", subject: ALL_SUBJECTS };
let saveTimer = null;
let toastTimer = null;
let remoteDebounce = false;
let presence = new Map();
let historyTimers = new Map();

init();

function init() {
  bindEvents();
  restoreSession();
  setInterval(announcePresence, 5000);
  setInterval(prunePresence, 4000);
}

function bindEvents() {
  els.loginTab.addEventListener("click", () => setAuthMode("login"));
  els.registerTab.addEventListener("click", () => setAuthMode("register"));
  els.authForm.addEventListener("submit", handleAuthSubmit);

  els.createRoomForm.addEventListener("submit", handleCreateRoom);
  els.joinRoomForm.addEventListener("submit", handleJoinRoom);
  els.closeRoomModalButton.addEventListener("click", closeRoomModal);
  els.copyRoomCodeButton.addEventListener("click", copyActiveRoomCode);
  els.copyRoomCodeSmallButton.addEventListener("click", copyActiveRoomCode);
  els.openRoomButton.addEventListener("click", hideRoomModal);
  els.roomButton.addEventListener("click", () => showRoomModal(false));
  els.logoutButton.addEventListener("click", logout);

  els.userName.addEventListener("input", updateCurrentUserName);
  els.newNoteButton.addEventListener("click", createNote);
  els.searchInput.addEventListener("input", () => {
    filters.search = els.searchInput.value.trim().toLowerCase();
    renderNoteList();
  });
  els.subjectFilter.addEventListener("change", () => {
    filters.subject = els.subjectFilter.value;
    renderNoteList();
    renderSubjectChips();
  });
  els.subjectForm.addEventListener("submit", addSubject);
  els.resetHistoryButton.addEventListener("click", resetRoomHistory);

  els.noteTitle.addEventListener("input", () => updateActiveNote({ title: els.noteTitle.value }, true));
  els.noteSubject.addEventListener("input", updateNoteSubject);
  els.noteTags.addEventListener("input", () => updateActiveNote({ tags: parseTags(els.noteTags.value) }, true));
  els.noteContent.addEventListener("input", () => updateActiveNote({ content: els.noteContent.value }, true));

  els.deleteNoteButton.addEventListener("click", deleteActiveNote);
  els.saveFileButton.addEventListener("click", showSaveModal);
  els.closeSaveModalButton.addEventListener("click", hideSaveModal);
  els.cancelSaveButton.addEventListener("click", hideSaveModal);
  els.saveFormat.addEventListener("change", updateSaveDefaultName);
  els.saveForm.addEventListener("submit", saveSelectedFile);
  els.importJsonInput.addEventListener("change", importJson);

  els.taskForm.addEventListener("submit", addTask);
  els.commentForm.addEventListener("submit", addComment);

  window.addEventListener("storage", (event) => {
    if (!activeRoomCode || event.key !== roomStorageKey(activeRoomCode) || !event.newValue) return;
    applyRemoteState(JSON.parse(event.newValue));
  });

  window.addEventListener("beforeunload", () => {
    if (roomChannel) roomChannel.postMessage({ type: "presence-left", clientId });
  });
}

function restoreSession() {
  const session = readJson(SESSION_KEY, null);
  const account = session?.userId ? getAccountById(session.userId) : null;
  if (!account) {
    showAuthScreen();
    return;
  }

  currentUser = accountToCurrentUser(account);
  setupCurrentUserUi();
  if (session.roomCode && roomExists(session.roomCode)) {
    enterRoom(session.roomCode, { showRoomDialog: false });
  } else {
    showRoomGate();
  }
}

function showAuthScreen() {
  currentUser = null;
  activeRoomCode = null;
  state = null;
  disconnectRoomChannel();
  els.authScreen.hidden = false;
  els.appShell.hidden = true;
  els.roomModal.hidden = true;
  setAuthMode("login");
}

function showRoomGate() {
  els.authScreen.hidden = true;
  els.appShell.hidden = true;
  showRoomModal(true);
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";
  els.loginTab.classList.toggle("active", !isRegister);
  els.registerTab.classList.toggle("active", isRegister);
  els.authNameField.hidden = !isRegister;
  els.authPasswordConfirmField.hidden = !isRegister;
  els.authName.required = isRegister;
  els.authPasswordConfirm.required = isRegister;
  els.authPassword.autocomplete = isRegister ? "new-password" : "current-password";
  els.authSubmitButton.textContent = isRegister ? "Зарегистрироваться" : "Войти";
  els.authMessage.textContent = "";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const login = normalizeLogin(els.authLogin.value);
  const password = els.authPassword.value;
  const passwordConfirm = els.authPasswordConfirm.value;
  const name = normalizeUserName(els.authName.value || login);

  if (!login || !password) {
    setAuthMessage("Заполните логин и пароль.");
    return;
  }
  if (password.length < 4) {
    setAuthMessage("Пароль должен быть не короче 4 символов.");
    return;
  }
  if (authMode === "register" && password !== passwordConfirm) {
    setAuthMessage("Пароли не совпадают.");
    els.authPasswordConfirm.focus();
    return;
  }

  const accounts = readAccounts();
  if (authMode === "register") {
    if (accounts.some((account) => account.login === login)) {
      setAuthMessage("Пользователь с таким логином уже есть.");
      return;
    }
    const account = {
      id: makeId(),
      login,
      name,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString()
    };
    accounts.push(account);
    saveAccounts(accounts);
    signIn(account, true);
    return;
  }

  const account = accounts.find((item) => item.login === login);
  if (!account || account.passwordHash !== await hashPassword(password)) {
    setAuthMessage("Неверный логин или пароль.");
    return;
  }
  signIn(account, true);
}

function signIn(account, openRoomDialog) {
  currentUser = accountToCurrentUser(account);
  const previousSession = readJson(SESSION_KEY, {});
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    userId: account.id,
    roomCode: previousSession.roomCode || null,
    updatedAt: new Date().toISOString()
  }));
  setupCurrentUserUi();
  els.authForm.reset();
  showToast("Вход выполнен");

  if (previousSession.roomCode && roomExists(previousSession.roomCode)) {
    enterRoom(previousSession.roomCode, { showRoomDialog: openRoomDialog });
  } else {
    showRoomGate();
  }
}

function setupCurrentUserUi() {
  if (!currentUser) return;
  els.userName.value = currentUser.name;
  renderUserAvatar();
}

function updateCurrentUserName() {
  if (!currentUser) return;
  currentUser.name = normalizeUserName(els.userName.value);
  currentUser.color = colorFromText(currentUser.name);
  updateAccountName(currentUser.id, currentUser.name);
  renderUserAvatar();
  renderPresence();
  announcePresence();
}

function logout() {
  if (roomChannel) roomChannel.postMessage({ type: "presence-left", clientId });
  localStorage.removeItem(SESSION_KEY);
  showToast("Вы вышли из аккаунта");
  showAuthScreen();
}

function handleCreateRoom(event) {
  event.preventDefault();
  if (!currentUser) return;
  const name = els.roomNameInput.value.trim() || "Комната конспекта";
  const code = generateRoomCode();
  const newState = createInitialRoomState(code, name);
  writeRoomState(code, newState);
  enterRoom(code, { showRoomDialog: true });
  els.createdRoomCode.textContent = code;
  els.roomResult.hidden = false;
  setRoomMessage(`Комната "${name}" создана.`);
  els.roomNameInput.value = "";
}

function handleJoinRoom(event) {
  event.preventDefault();
  if (!currentUser) return;
  const code = normalizeRoomCode(els.joinRoomCodeInput.value);
  if (!code) {
    setRoomMessage("Введите код комнаты.");
    return;
  }
  if (!roomExists(code)) {
    setRoomMessage("Комната с таким кодом не найдена в этом браузере.");
    return;
  }
  enterRoom(code, { showRoomDialog: false });
  els.joinRoomCodeInput.value = "";
  showToast(`Открыта комната ${code}`);
}

function enterRoom(code, options = {}) {
  const loaded = readRoomState(code);
  if (!loaded) return false;

  activeRoomCode = code;
  state = loaded;
  filters = { search: "", subject: ALL_SUBJECTS };
  presence = new Map();
  connectRoomChannel(code);
  saveSessionRoom(code);
  els.authScreen.hidden = true;
  els.appShell.hidden = false;
  ensureActiveNote();
  persist("Комната открыта", false);
  render();
  announcePresence();

  if (options.showRoomDialog) {
    showRoomModal(false);
  } else {
    hideRoomModal();
  }
  return true;
}

function showRoomModal(requireRoom) {
  els.roomModal.hidden = false;
  els.closeRoomModalButton.hidden = requireRoom;
  els.roomResult.hidden = true;
  setRoomMessage(requireRoom ? "Создайте комнату или подключитесь по коду." : "");
  setTimeout(() => {
    if (requireRoom) els.roomNameInput.focus();
  }, 0);
}

function closeRoomModal() {
  if (!activeRoomCode) {
    setRoomMessage("Сначала создайте комнату или подключитесь по коду.");
    return;
  }
  hideRoomModal();
}

function hideRoomModal() {
  if (!activeRoomCode) return;
  els.roomModal.hidden = true;
  els.roomResult.hidden = true;
  setRoomMessage("");
}

function copyActiveRoomCode() {
  const code = activeRoomCode || els.createdRoomCode.textContent.trim();
  if (!code || code === "------") return;
  writeClipboard(code);
  showToast("Код комнаты скопирован");
}

function createNote(shouldRender = true) {
  if (!state) return;
  const now = new Date().toISOString();
  const subject = filters.subject !== ALL_SUBJECTS
    ? filters.subject
    : state.subjects[0] || DEFAULT_SUBJECT;
  addSubjectToState(subject);

  const note = {
    id: makeId(),
    title: "Новый конспект",
    subject,
    tags: [],
    content: "# Новый конспект\n\nОсновные тезисы занятия:\n\n- ",
    comments: [],
    tasks: [],
    history: [
      {
        id: makeId(),
        author: currentUser.name,
        title: "Создан конспект",
        createdAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };
  state.notes.unshift(note);
  state.activeNoteId = note.id;
  persist("Создан конспект");
  if (shouldRender) {
    render();
    els.noteTitle.focus();
    els.noteTitle.select();
  }
}

function deleteActiveNote() {
  const note = getActiveNote();
  if (!note) return;
  const confirmed = window.confirm(`Удалить конспект "${note.title}"?`);
  if (!confirmed) return;
  state.notes = state.notes.filter((item) => item.id !== note.id);
  state.activeNoteId = state.notes[0]?.id || null;
  ensureActiveNote();
  persist("Конспект удален");
  render();
}

function updateActiveNote(patch, withHistory = false) {
  const note = getActiveNote();
  if (!note) return;
  Object.assign(note, patch);
  note.updatedAt = new Date().toISOString();
  if (withHistory) {
    scheduleHistory(note, "Обновлен конспект");
  }
  persist("Сохранение...");
  renderAfterEditing();
}

function updateNoteSubject() {
  const subject = els.noteSubject.value.trim();
  if (subject) addSubjectToState(subject);
  updateActiveNote({ subject }, true);
}

function addSubject(event) {
  event.preventDefault();
  if (!state) return;
  const subject = els.newSubjectInput.value.trim();
  if (!subject) {
    showToast("Введите название дисциплины");
    return;
  }
  const existing = findSubject(subject);
  if (existing) {
    filters.subject = existing;
    showToast("Такая дисциплина уже есть");
  } else {
    addSubjectToState(subject);
    filters.subject = subject;
    showToast("Дисциплина добавлена");
  }
  els.newSubjectInput.value = "";
  persist("Дисциплина добавлена");
  render();
}

function resetRoomHistory() {
  if (!state) return;
  const hasHistory = state.notes.some((note) => Array.isArray(note.history) && note.history.length);
  if (!hasHistory) {
    showToast("История уже пуста");
    return;
  }

  const confirmed = window.confirm("Сбросить историю изменений всех конспектов в этой комнате?");
  if (!confirmed) return;

  historyTimers.forEach((timer) => clearTimeout(timer));
  historyTimers.clear();
  state.notes = state.notes.map((note) => ({
    ...note,
    history: []
  }));
  persist("История комнаты сброшена");
  render();
  showToast("История текущей комнаты очищена");
}

function scheduleHistory(note, title) {
  clearTimeout(historyTimers.get(note.id));
  historyTimers.set(note.id, setTimeout(() => {
    const currentNote = state.notes.find((item) => item.id === note.id);
    if (!currentNote) return;
    currentNote.history = addHistory(currentNote, title);
    persist("Сохранено");
    renderHistory(currentNote);
    historyTimers.delete(note.id);
  }, 1200));
}

function addTask(event) {
  event.preventDefault();
  const text = els.taskInput.value.trim();
  if (!text) return;
  const note = getActiveNote();
  note.tasks.unshift({ id: makeId(), text, done: false });
  note.updatedAt = new Date().toISOString();
  note.history = addHistory(note, `Добавлена задача: ${text}`);
  els.taskInput.value = "";
  persist("Задача добавлена");
  renderSideData(note);
}

function addComment(event) {
  event.preventDefault();
  const text = els.commentInput.value.trim();
  if (!text) return;
  const note = getActiveNote();
  note.comments.unshift({
    id: makeId(),
    author: currentUser.name,
    color: currentUser.color,
    text,
    createdAt: new Date().toISOString()
  });
  note.updatedAt = new Date().toISOString();
  note.history = addHistory(note, "Добавлен комментарий");
  els.commentInput.value = "";
  persist("Комментарий добавлен");
  renderSideData(note);
}

function toggleTask(taskId) {
  const note = getActiveNote();
  const task = note.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.done = !task.done;
  note.updatedAt = new Date().toISOString();
  note.history = addHistory(note, task.done ? "Задача выполнена" : "Задача открыта снова");
  persist("Задача обновлена");
  renderSideData(note);
}

function addHistory(note, title) {
  return [
    {
      id: makeId(),
      author: currentUser.name,
      title,
      createdAt: new Date().toISOString()
    },
    ...(note.history || [])
  ].slice(0, HISTORY_LIMIT);
}

function render() {
  if (!state) return;
  ensureActiveNote();
  renderRoomLabels();
  renderSubjects();
  renderNoteList();
  renderEditor();
  renderPresence();
}

function renderAfterEditing() {
  const note = getActiveNote();
  if (!note) return;
  els.currentNoteHeading.textContent = note.title || "Без темы";
  renderRoomLabels();
  renderSubjects();
  renderNoteList();
  renderTags(note);
  renderPreview(note.content);
}

function renderRoomLabels() {
  const room = state?.room || {};
  els.currentRoomName.textContent = room.name || "Комната";
  els.currentRoomCodeSmall.textContent = room.code || activeRoomCode || "------";
  els.roomInfo.textContent = `${room.name || "Комната"} · ${room.code || activeRoomCode || ""}`;
}

function renderSubjects() {
  const subjects = uniqueSubjects();
  els.subjectFilter.innerHTML = "";
  [ALL_SUBJECTS, ...subjects].forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    els.subjectFilter.append(option);
  });
  els.subjectFilter.value = subjects.includes(filters.subject) ? filters.subject : ALL_SUBJECTS;
  filters.subject = els.subjectFilter.value;

  els.subjectSuggestions.innerHTML = "";
  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    els.subjectSuggestions.append(option);
  });
  renderSubjectChips();
}

function renderSubjectChips() {
  const subjects = uniqueSubjects();
  els.subjectChips.innerHTML = "";
  if (!subjects.length) return;
  subjects.slice(0, 8).forEach((subject) => {
    const button = document.createElement("button");
    button.className = `subject-chip${filters.subject === subject ? " active" : ""}`;
    button.type = "button";
    button.textContent = subject;
    button.addEventListener("click", () => {
      filters.subject = subject;
      els.subjectFilter.value = subject;
      renderNoteList();
      renderSubjectChips();
    });
    els.subjectChips.append(button);
  });
}

function renderNoteList() {
  const notes = filteredNotes();
  els.noteList.innerHTML = "";
  if (!notes.length) {
    els.noteList.append(emptyState("Ничего не найдено"));
    return;
  }

  notes.forEach((note) => {
    const button = document.createElement("button");
    button.className = `note-item${note.id === state.activeNoteId ? " active" : ""}`;
    button.type = "button";
    button.addEventListener("click", () => {
      state.activeNoteId = note.id;
      persist("Открыт конспект", false);
      renderEditor();
      renderNoteList();
      announcePresence();
    });

    const title = document.createElement("div");
    title.className = "note-title";
    title.textContent = note.title || "Без темы";

    const meta = document.createElement("div");
    meta.className = "note-meta";
    meta.innerHTML = `<span>${escapeHtml(note.subject || "Без дисциплины")}</span><span>${formatRelative(note.updatedAt)}</span>`;

    const preview = document.createElement("div");
    preview.className = "note-preview";
    preview.textContent = stripMarkdown(note.content).slice(0, 130) || "Пустой конспект";

    const tags = document.createElement("div");
    tags.className = "mini-tags";
    (note.tags || []).slice(0, 3).forEach((tag) => tags.append(tagElement(tag)));

    button.append(title, meta, preview, tags);
    els.noteList.append(button);
  });
}

function renderEditor() {
  const note = getActiveNote();
  if (!note) return;
  els.currentNoteHeading.textContent = note.title || "Без темы";
  els.noteTitle.value = note.title || "";
  els.noteSubject.value = note.subject || "";
  els.noteTags.value = (note.tags || []).join(", ");
  els.noteContent.value = note.content || "";
  renderTags(note);
  renderPreview(note.content || "");
  renderSideData(note);
}

function renderTags(note) {
  els.tagCloud.innerHTML = "";
  (note.tags || []).forEach((tag) => els.tagCloud.append(tagElement(tag)));
}

function renderSideData(note) {
  renderTasks(note);
  renderComments(note);
  renderHistory(note);
}

function renderTasks(note) {
  const tasks = note.tasks || [];
  const openCount = tasks.filter((task) => !task.done).length;
  els.openTasksCount.textContent = String(openCount);
  els.taskList.innerHTML = "";
  if (!tasks.length) {
    els.taskList.append(emptyState("Задач пока нет"));
    return;
  }

  tasks.forEach((task) => {
    const item = document.createElement("label");
    item.className = `task-item${task.done ? " done" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.addEventListener("change", () => toggleTask(task.id));
    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;
    item.append(checkbox, text);
    els.taskList.append(item);
  });
}

function renderComments(note) {
  const comments = note.comments || [];
  els.commentsCount.textContent = String(comments.length);
  els.commentList.innerHTML = "";
  if (!comments.length) {
    els.commentList.append(emptyState("Комментариев пока нет"));
    return;
  }

  comments.forEach((comment) => {
    const item = document.createElement("article");
    item.className = "comment-item";
    item.innerHTML = `
      <div class="comment-author">${escapeHtml(comment.author || "Участник")}</div>
      <div class="comment-body">${escapeHtml(comment.text)}</div>
      <div class="comment-meta">${formatDate(comment.createdAt)}</div>
    `;
    item.style.borderLeft = `4px solid ${comment.color || colors[0]}`;
    els.commentList.append(item);
  });
}

function renderHistory(note) {
  const history = note.history || [];
  els.historyCount.textContent = String(history.length);
  els.historyList.innerHTML = "";
  if (!history.length) {
    els.historyList.append(emptyState("История пуста"));
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "history-item";
    item.innerHTML = `
      <div class="history-author">${escapeHtml(entry.author || "Участник")}</div>
      <div class="history-title">${escapeHtml(entry.title || "Изменение")}</div>
      <div class="history-meta">${formatDate(entry.createdAt)}</div>
    `;
    els.historyList.append(item);
  });
}

function renderPresence() {
  if (!state || !currentUser) return;
  prunePresence();
  const active = [...presence.values()].filter((item) => item.clientId !== clientId);
  const current = {
    clientId,
    name: currentUser.name,
    color: currentUser.color,
    noteTitle: getActiveNote()?.title || "Без темы",
    seenAt: Date.now()
  };
  const all = [current, ...active].slice(0, 8);
  els.presenceCount.textContent = String(all.length);
  els.presenceList.innerHTML = "";

  all.forEach((person) => {
    const item = document.createElement("div");
    item.className = "presence-item";
    const dot = document.createElement("span");
    dot.className = "presence-dot";
    dot.style.background = person.color || colors[0];
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="presence-name">${escapeHtml(person.name || "Участник")}</div>
      <div class="presence-note">${escapeHtml(person.noteTitle || "В рабочем пространстве")}</div>
    `;
    item.append(dot, body);
    els.presenceList.append(item);
  });
}

function renderPreview(markdown) {
  els.preview.innerHTML = markdownToHtml(markdown || "");
}

function filteredNotes() {
  return [...state.notes]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .filter((note) => {
      const subjectOk = filters.subject === ALL_SUBJECTS || note.subject === filters.subject;
      const haystack = [
        note.title,
        note.subject,
        (note.tags || []).join(" "),
        note.content
      ].join(" ").toLowerCase();
      const searchOk = !filters.search || haystack.includes(filters.search);
      return subjectOk && searchOk;
    });
}

function uniqueSubjects() {
  const subjects = [
    ...(state.subjects || []),
    ...state.notes.map((note) => note.subject || DEFAULT_SUBJECT)
  ];
  return uniqueClean(subjects).sort((a, b) => a.localeCompare(b, "ru"));
}

function addSubjectToState(subject) {
  if (!state) return "";
  const clean = normalizeSubject(subject);
  if (!clean) return "";
  const existing = findSubject(clean);
  if (existing) return existing;
  state.subjects = uniqueClean([...(state.subjects || []), clean]);
  return clean;
}

function findSubject(subject) {
  const clean = normalizeSubject(subject).toLowerCase();
  return uniqueSubjects().find((item) => item.toLowerCase() === clean) || "";
}

function persist(status = "Сохранено", shouldBroadcast = true) {
  if (!state || !activeRoomCode) return;
  state.subjects = uniqueClean(state.subjects || []);
  const cleanState = JSON.parse(JSON.stringify(state));
  state = cleanState;
  writeRoomState(activeRoomCode, cleanState);
  setStatus(status);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => setStatus("Сохранено"), 700);
  if (shouldBroadcast) {
    broadcastState();
  }
}

function broadcastState() {
  if (!roomChannel) return;
  roomChannel.postMessage({ type: "state", clientId, state });
}

function applyRemoteState(remoteState) {
  if (!remoteState || !Array.isArray(remoteState.notes) || !activeRoomCode) return;
  if (remoteDebounce) return;
  remoteDebounce = true;
  setTimeout(() => {
    remoteDebounce = false;
  }, 80);
  const localActiveNoteId = state.activeNoteId;
  state = upgradeRoomState(remoteState, activeRoomCode);
  if (state.notes.some((note) => note.id === localActiveNoteId)) {
    state.activeNoteId = localActiveNoteId;
  } else {
    ensureActiveNote();
  }
  setStatus("Обновлено из другой вкладки");
  render();
}

function announcePresence() {
  if (!state || !currentUser || !roomChannel) return;
  const note = getActiveNote();
  const info = {
    clientId,
    name: currentUser.name,
    color: currentUser.color,
    noteTitle: note?.title || "Без темы",
    seenAt: Date.now()
  };
  presence.set(clientId, info);
  roomChannel.postMessage({ type: "presence", clientId, presence: info });
  renderPresence();
}

function applyPresence(info) {
  if (!info || !info.clientId) return;
  presence.set(info.clientId, info);
  renderPresence();
}

function removePresence(id) {
  if (!id) return;
  presence.delete(id);
  renderPresence();
}

function prunePresence() {
  const now = Date.now();
  for (const [id, info] of presence.entries()) {
    if (id !== clientId && now - info.seenAt > 15000) presence.delete(id);
  }
}

function connectRoomChannel(code) {
  disconnectRoomChannel();
  if (!("BroadcastChannel" in window)) return;
  roomChannel = new BroadcastChannel(`${CHANNEL_PREFIX}${code}`);
  roomChannel.addEventListener("message", (event) => {
    if (!event.data || event.data.clientId === clientId) return;
    if (event.data.type === "state") applyRemoteState(event.data.state);
    if (event.data.type === "presence") applyPresence(event.data.presence);
    if (event.data.type === "presence-left") removePresence(event.data.clientId);
  });
}

function disconnectRoomChannel() {
  if (roomChannel) {
    roomChannel.close();
    roomChannel = null;
  }
}

function showSaveModal() {
  if (!state) return;
  els.saveModal.hidden = false;
  els.saveFormat.value = "markdown";
  updateSaveDefaultName();
  setSaveMessage("");
  setTimeout(() => {
    els.saveFileName.focus();
    els.saveFileName.select();
  }, 0);
}

function hideSaveModal() {
  els.saveModal.hidden = true;
  setSaveMessage("");
}

function updateSaveDefaultName() {
  const format = els.saveFormat.value;
  const defaultName = format === "json"
    ? `${state.room?.name || "Комната"} ${activeRoomCode || ""}`.trim()
    : getActiveNote()?.title || "Конспект";
  els.saveFileName.value = safeFileName(defaultName);
}

function saveSelectedFile(event) {
  event.preventDefault();
  const format = els.saveFormat.value;
  const rawName = els.saveFileName.value.trim() || getDefaultExportName(format);
  const filename = safeFileName(rawName);

  if (format === "markdown") {
    const note = getActiveNote();
    if (!note) {
      setSaveMessage("Нет выбранного конспекта для сохранения.");
      return;
    }
    download(`${filename}.md`, buildMarkdownExport(note), "text/markdown;charset=utf-8");
    showToast("Markdown сохранен");
  } else {
    download(`${filename}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8");
    showToast("JSON комнаты сохранен");
  }

  hideSaveModal();
}

function getDefaultExportName(format) {
  if (format === "json") {
    return `${state.room?.name || "Комната"} ${activeRoomCode || ""}`.trim();
  }
  return getActiveNote()?.title || "Конспект";
}

function setSaveMessage(text) {
  els.saveMessage.textContent = text;
}

function buildMarkdownExport(note) {
  const tags = note.tags?.length ? `\n\nТеги: ${note.tags.join(", ")}` : "";
  const roomLine = state.room?.name ? `Комната: ${state.room.name}\n` : "";
  return `# ${note.title || "Без темы"}\n\n${roomLine}Дисциплина: ${note.subject || "Без дисциплины"}${tags}\n\n---\n\n${note.content || ""}`;
}

function exportMarkdown() {
  const note = getActiveNote();
  if (!note) return;
  download(`${safeFileName(note.title || "conspect")}.md`, buildMarkdownExport(note), "text/markdown;charset=utf-8");
  showToast("Markdown сохранен");
}

function exportJson() {
  const code = activeRoomCode || "room";
  download(`group-notes-${code}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8");
  showToast("JSON комнаты сохранен");
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file || !activeRoomCode) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(String(reader.result));
      if (!imported || !Array.isArray(imported.notes)) throw new Error("Некорректный формат");
      const currentRoom = state.room;
      state = upgradeRoomState(imported, activeRoomCode);
      state.room = {
        ...state.room,
        code: activeRoomCode,
        name: state.room?.name || currentRoom?.name || "Комната конспекта"
      };
      ensureActiveNote();
      persist("Импортировано");
      render();
      showToast("Рабочее пространство импортировано");
    } catch (error) {
      showToast("Не удалось импортировать JSON");
    } finally {
      event.target.value = "";
    }
  });
  reader.readAsText(file);
}

function ensureActiveNote() {
  if (!state) return;
  if (!state.notes.length) {
    createNote(false);
    return;
  }
  if (!state.notes.some((note) => note.id === state.activeNoteId)) {
    state.activeNoteId = state.notes[0].id;
  }
}

function getActiveNote() {
  if (!state) return null;
  return state.notes.find((note) => note.id === state.activeNoteId) || state.notes[0] || null;
}

function createInitialRoomState(code, name) {
  const now = new Date().toISOString();
  const legacy = readJson(LEGACY_STORAGE_KEY, null);
  const legacyNotes = legacy?.notes?.length ? legacy.notes.map(sanitizeNote) : [];
  const notes = legacyNotes.length ? legacyNotes : [createSeedNote(now)];
  const subjects = uniqueClean([
    "Матанализ",
    "История",
    "Программирование",
    ...notes.map((note) => note.subject || DEFAULT_SUBJECT)
  ]);

  return {
    version: 2,
    room: {
      code,
      name,
      createdBy: currentUser?.name || "Участник",
      createdAt: now
    },
    subjects,
    activeNoteId: notes[0]?.id || null,
    notes
  };
}

function createSeedNote(now) {
  return {
    id: makeId(),
    title: "Математический анализ: пределы",
    subject: "Матанализ",
    tags: ["лекция", "экзамен"],
    content: [
      "# Предел функции",
      "",
      "Предел описывает поведение функции при приближении аргумента к выбранной точке.",
      "",
      "## Что важно запомнить",
      "",
      "- формальное определение через epsilon и delta;",
      "- односторонние пределы;",
      "- связь с непрерывностью;",
      "- типовые замечательные пределы.",
      "",
      "> Если левый и правый пределы существуют и равны, общий предел существует.",
      "",
      "### Пример",
      "",
      "`lim(x -> 0) sin(x) / x = 1`"
    ].join("\n"),
    comments: [
      {
        id: makeId(),
        author: "Илья",
        color: colors[1],
        text: "Нужно добавить пример с раскрытием неопределенности.",
        createdAt: now
      }
    ],
    tasks: [
      { id: makeId(), text: "Вписать определения по Коши и Гейне", done: false },
      { id: makeId(), text: "Проверить формулировку замечательных пределов", done: true }
    ],
    history: [
      {
        id: makeId(),
        author: "Аня",
        title: "Создан стартовый конспект",
        createdAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

function sanitizeNote(note) {
  const now = new Date().toISOString();
  return {
    id: note.id || makeId(),
    title: note.title || "Без темы",
    subject: note.subject || DEFAULT_SUBJECT,
    tags: Array.isArray(note.tags) ? note.tags : [],
    content: note.content || "",
    comments: Array.isArray(note.comments) ? note.comments : [],
    tasks: Array.isArray(note.tasks) ? note.tasks : [],
    history: Array.isArray(note.history) ? note.history : [],
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || now
  };
}

function readRoomState(code) {
  const raw = readJson(roomStorageKey(code), null);
  return raw ? upgradeRoomState(raw, code) : null;
}

function upgradeRoomState(raw, code) {
  const now = new Date().toISOString();
  const notes = Array.isArray(raw.notes) ? raw.notes.map(sanitizeNote) : [];
  const room = {
    code,
    name: raw.room?.name || "Комната конспекта",
    createdBy: raw.room?.createdBy || currentUser?.name || "Участник",
    createdAt: raw.room?.createdAt || now
  };
  const subjects = uniqueClean([
    ...(Array.isArray(raw.subjects) ? raw.subjects : []),
    ...notes.map((note) => note.subject || DEFAULT_SUBJECT)
  ]);
  return {
    version: 2,
    room,
    subjects,
    activeNoteId: raw.activeNoteId || notes[0]?.id || null,
    notes
  };
}

function roomExists(code) {
  return Boolean(localStorage.getItem(roomStorageKey(code)));
}

function writeRoomState(code, roomState) {
  localStorage.setItem(roomStorageKey(code), JSON.stringify(roomState));
}

function roomStorageKey(code) {
  return `${ROOM_STORAGE_PREFIX}${code}`;
}

function saveSessionRoom(code) {
  if (!currentUser) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    userId: currentUser.id,
    roomCode: code,
    updatedAt: new Date().toISOString()
  }));
}

function readAccounts() {
  return readJson(ACCOUNTS_KEY, []);
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function getAccountById(id) {
  return readAccounts().find((account) => account.id === id) || null;
}

function updateAccountName(id, name) {
  const accounts = readAccounts();
  const account = accounts.find((item) => item.id === id);
  if (!account) return;
  account.name = name;
  saveAccounts(accounts);
}

function accountToCurrentUser(account) {
  return {
    id: account.id,
    login: account.login,
    name: account.name,
    color: colorFromText(account.name)
  };
}

async function hashPassword(password) {
  const value = `group-notes:${password}`;
  if (crypto.subtle && window.TextEncoder) {
    const data = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `plain:${value}`;
}

function setAuthMessage(text) {
  els.authMessage.textContent = text;
}

function setRoomMessage(text) {
  els.roomMessage.textContent = text;
}

function setStatus(text) {
  els.syncStatus.textContent = text;
}

function showToast(text) {
  clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.classList.add("visible");
  toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 1800);
}

function tagElement(tag) {
  const el = document.createElement("span");
  el.className = "tag";
  el.textContent = tag;
  return el;
}

function emptyState(text) {
  const el = document.createElement("div");
  el.className = "empty-state";
  el.textContent = text;
  return el;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inList = false;
  let inCode = false;
  let codeLines = [];

  lines.forEach((rawLine) => {
    const line = rawLine;

    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      closeList();
      return;
    }

    const listMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (listMatch) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(listMatch[1])}</li>`);
      return;
    }

    closeList();

    if (line.startsWith("### ")) {
      html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      html.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      html.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
    } else {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  });

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  closeList();
  return html.join("");

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTags(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeUserName(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "Участник";
}

function normalizeLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function normalizeSubject(subject) {
  return String(subject || "").trim().replace(/\s+/g, " ");
}

function normalizeRoomCode(value) {
  const clean = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean) return "";
  const body = clean.startsWith("GK") ? clean.slice(2) : clean;
  return `GK-${body.slice(0, 6)}`;
}

function generateRoomCode() {
  let code = "";
  do {
    code = `GK-${Math.floor(100000 + Math.random() * 900000)}`;
  } while (roomExists(code));
  return code;
}

function uniqueClean(values) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const clean = normalizeSubject(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    result.push(clean);
  });
  return result;
}

function renderUserAvatar() {
  if (!currentUser) return;
  currentUser.color = colorFromText(currentUser.name);
  els.userAvatar.textContent = initials(currentUser.name);
  els.userAvatar.style.background = currentUser.color;
}

function initials(name) {
  return normalizeUserName(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function colorFromText(text) {
  const value = normalizeUserName(text);
  let sum = 0;
  for (const char of value) sum += char.charCodeAt(0);
  return colors[sum % colors.length];
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatRelative(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return formatDate(value);
}

function safeFileName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "conspect";
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

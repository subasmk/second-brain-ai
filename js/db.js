/* ==========================================
   DB.JS — IndexedDB wrapper
   ========================================== */

const DB_NAME    = 'SecondBrainAI';
const DB_VERSION = 2;
const TASKS_STORE    = 'tasks';
const NOTES_STORE    = 'notes';
const SETTINGS_STORE = 'settings';

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Tasks store
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const taskStore = db.createObjectStore(TASKS_STORE, { keyPath: 'id', autoIncrement: true });
        taskStore.createIndex('status',    'status',    { unique: false });
        taskStore.createIndex('dueDate',   'dueDate',   { unique: false });
        taskStore.createIndex('priority',  'priority',  { unique: false });
        taskStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Notes store
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const noteStore = db.createObjectStore(NOTES_STORE, { keyPath: 'id', autoIncrement: true });
        noteStore.createIndex('createdAt', 'createdAt', { unique: false });
        noteStore.createIndex('favorite',  'favorite',  { unique: false });
      }

      // Settings store
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ---------- TASKS ---------- */

async function addTask(task) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(TASKS_STORE, 'readwrite');
    const req = tx.objectStore(TASKS_STORE).add({
      title:        task.title       || '',
      description:  task.description || '',
      dueDate:      task.dueDate     || null,   // ISO string or null
      dueTime:      task.dueTime     || null,   // "HH:MM" or null
      priority:     task.priority    || 'medium',// high | medium | low
      status:       'pending',                  // pending | completed
      snoozeCount:  0,
      pauseRemind:  false,
      notes:        task.notes       || '',     // Legacy quick notes field
      quickNotes:   task.quickNotes  || '',     // Fast thoughts
      reminders:    task.reminders   || '',     // Important reminders
      ideas:        task.ideas       || '',     // Ideas & insights
      tags:         task.tags        || [],
      aiGenerated:  task.aiGenerated || false,
      createdAt:    new Date().toISOString(),
      completedAt:  null,
      notifyAt:     task.notifyAt    || null,
    });
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getTasks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(TASKS_STORE, 'readonly');
    const req = tx.objectStore(TASKS_STORE).getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getTaskById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(TASKS_STORE, 'readonly');
    const req = tx.objectStore(TASKS_STORE).get(id);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function updateTask(task) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(TASKS_STORE, 'readwrite');
    const req = tx.objectStore(TASKS_STORE).put(task);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function deleteTask(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(TASKS_STORE, 'readwrite');
    const req = tx.objectStore(TASKS_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function completeTask(id) {
  const task = await getTaskById(id);
  if (!task) return;
  task.status      = 'completed';
  task.completedAt = new Date().toISOString();
  return updateTask(task);
}

async function snoozeTask(id, minutes) {
  const task = await getTaskById(id);
  if (!task) return;
  const snoozeUntil     = new Date(Date.now() + minutes * 60000);
  task.notifyAt         = snoozeUntil.toISOString();
  task.snoozeCount      = (task.snoozeCount || 0) + 1;
  return updateTask(task);
}

/* ---------- NOTES ---------- */

async function addNote(note) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(NOTES_STORE, 'readwrite');
    const req = tx.objectStore(NOTES_STORE).add({
      title:     note.title || '',
      content:   note.content || '',
      todos:     note.todos || [],
      links:     note.links || [],
      tags:      note.tags || [],
      favorite:  note.favorite || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(NOTES_STORE, 'readonly');
    const req = tx.objectStore(NOTES_STORE).getAll();
    req.onsuccess = (e) => resolve((e.target.result || []).reverse());
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getNoteById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(NOTES_STORE, 'readonly');
    const req = tx.objectStore(NOTES_STORE).get(id);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function updateNote(note) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    note.updatedAt = new Date().toISOString();
    const tx  = db.transaction(NOTES_STORE, 'readwrite');
    const req = tx.objectStore(NOTES_STORE).put(note);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(NOTES_STORE, 'readwrite');
    const req = tx.objectStore(NOTES_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ---------- SETTINGS ---------- */

async function getSetting(key, defaultVal = null) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx  = db.transaction(SETTINGS_STORE, 'readonly');
    const req = tx.objectStore(SETTINGS_STORE).get(key);
    req.onsuccess = (e) => resolve(e.target.result ? e.target.result.value : defaultVal);
    req.onerror   = () => resolve(defaultVal);
  });
}

async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(SETTINGS_STORE, 'readwrite');
    const req = tx.objectStore(SETTINGS_STORE).put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ---------- Helpers ---------- */

async function getPendingTasks() {
  const tasks = await getTasks();
  return tasks.filter(t => t.status === 'pending');
}

async function getCompletedTasks() {
  const tasks = await getTasks();
  return tasks.filter(t => t.status === 'completed');
}

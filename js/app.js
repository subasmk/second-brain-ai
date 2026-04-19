/* ==========================================
   APP.JS — Main controller & coordinator
   ========================================== */

/* ---- State ---- */
const AppState = {
  currentTab:    'today',
  currentView:   'tasks',
  tasks:         [],
  notes:         [],
  categorized:   { overdue: [], today: [], upcoming: [], noDate: [], completed: [] },
  editingTaskId: null,
  selectedPriority: 'medium',
  parsedNlp:     {},
  voiceActive:   false,
  currentNoteData: { todos: [], links: [] },
  focusModeActive: false,
  currentFocusTask: null,
};

/* ---- Init ---- */
async function initApp() {
  window.__app = {
    refreshDashboard,
    showPostponeAlert,
    addXP,
  };

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Load tasks & render
  await refreshDashboard();

  // Initialize notification system
  initNotifications().catch(() => {});

  // Wire up all event listeners
  setupEventListeners();

  // Update greeting
  updateGreeting();

  // Show motivation
  updateMotivationCard(AppState.categorized);

  // Check for URL action (e.g. ?action=add from shortcut)
  if (new URLSearchParams(location.search).get('action') === 'add') {
    openCreateChoice();
  }
}

/* ---- Dashboard Refresh ---- */
async function refreshDashboard() {
  AppState.tasks       = await getTasks();
  AppState.categorized = categorizeTasks(AppState.tasks);
  renderCurrentTab();
  updateStats(AppState.categorized);
  updateMotivationCard(AppState.categorized);
  updateGreeting();
  await updatePlayerStats();
}

/* ---- Tab Switching ---- */
function switchTab(tab) {
  AppState.currentTab = tab;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  renderCurrentTab();
}

function renderCurrentTab() {
  const listEl = document.getElementById('task-list-main');
  if (!listEl) return;

  const tasks  = getTasksForTab(AppState.currentTab, AppState.categorized);
  const labels = {
    today:     'No tasks for today',
    missed:    'No missed tasks 🎉',
    upcoming:  'No upcoming tasks',
    completed: 'No completed tasks yet',
    all:       'No tasks yet',
  };

  renderTaskList(tasks, listEl, labels[AppState.currentTab] || 'No tasks');

  // Section counts
  const countEl = document.getElementById('tab-section-count');
  if (countEl) countEl.textContent = tasks.length;
}

/* ---- Greeting ---- */
function updateGreeting() {
  const greetEl = document.getElementById('greeting-text');
  const statusEl = document.getElementById('brain-status');
  if (greetEl) greetEl.textContent = getTimeGreeting();

  if (statusEl) {
    const status = getBrainStatus(AppState.categorized.overdue.length, AppState.categorized.today.length);
    statusEl.textContent = `${status.icon} ${status.text}`;
    statusEl.style.color = status.color;
  }
}

/* ======================================================
   PLAYER STATS & GAMIFICATION
   ====================================================== */

async function updatePlayerStats() {
  // Get player stats from settings
  const playerXP = (await DB.getSetting('playerXP')) || 0;
  const playerLevel = (await DB.getSetting('playerLevel')) || 1;
  const dayStreak = (await DB.getSetting('dayStreak')) || 0;

  // Update UI
  const xpEl = document.getElementById('player-xp');
  const lvlEl = document.getElementById('player-level');
  const streakEl = document.getElementById('member-streak');
  
  if (xpEl) xpEl.textContent = playerXP;
  if (lvlEl) lvlEl.textContent = playerLevel;
  if (streakEl) streakEl.textContent = dayStreak;

  // Update progress bar
  const xpForNextLevel = playerLevel * 100;
  const currentLevelXp = (playerLevel - 1) * 100;
  const xpInLevel = playerXP - currentLevelXp;
  const progressPercent = Math.min((xpInLevel / 100) * 100, 100);
  
  const progressFill = document.getElementById('level-progress');
  const progressPercVal = document.querySelector('.progress-percent');
  
  if (progressFill) {
    progressFill.style.width = progressPercent + '%';
  }
  if (progressPercVal) {
    progressPercVal.textContent = Math.floor(progressPercent) + '%';
  }

  // Update achievements
  updateAchievementDisplay();
}

async function addXP(amount) {
  const currentXP = (await DB.getSetting('playerXP')) || 0;
  const currentLevel = (await DB.getSetting('playerLevel')) || 1;
  let newXP = currentXP + amount;
  let newLevel = currentLevel;

  // Level up every 100 XP
  while (newXP >= newLevel * 100) {
    newXP -= newLevel * 100;
    newLevel++;
    showLevelUpAnimation(newLevel);
  }

  await DB.setSetting('playerXP', newXP);
  await DB.setSetting('playerLevel', newLevel);
  updatePlayerStats();

  // Show XP gain toast
  showToast(`+${amount} XP 🎉`, 'success');
}

async function updateAchievementDisplay() {
  const achievementList = document.getElementById('achievement-list');
  if (!achievementList) return;

  const completedTasks = (await DB.getSetting('completedTasks')) || 0;
  const dayStreak = (await DB.getSetting('dayStreak')) || 0;
  const achievements = achievementList.querySelectorAll('.achievement-item');

  // Achievement 1: Complete first task
  if (completedTasks >= 1 && achievements[0]) {
    achievements[0].classList.add('unlocked');
    achievements[0].title = 'First Step!';
  }

  // Achievement 2: Complete 5 tasks
  if (completedTasks >= 5 && achievements[1]) {
    achievements[1].classList.add('unlocked');
    achievements[1].title = 'On Fire! (5 tasks)';
  }

  // Achievement 3: 7 day streak
  if (dayStreak >= 7 && achievements[2]) {
    achievements[2].classList.add('unlocked');
    achievements[2].title = 'Week Warrior! (7 days)';
  }

  // Achievement 4: Complete high priority task
  const completedHighPriority = (await DB.getSetting('completedHighPriority')) || false;
  if (completedHighPriority && achievements[3]) {
    achievements[3].classList.add('unlocked');
    achievements[3].title = 'Priority Master!';
  }
}

function showLevelUpAnimation(newLevel) {
  const levelEl = document.getElementById('player-level');
  if (levelEl) {
    levelEl.style.animation = 'none';
    setTimeout(() => {
      levelEl.style.animation = 'pulse 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
      levelEl.textContent = newLevel;
    }, 10);

    showToast(`🎉 LEVEL UP! You reached Level ${newLevel}!`, 'success');
  }
}

/* ======================================================
   ADD TASK MODAL
   ====================================================== */
function openAddTaskModal(prefill = '') {
  AppState.selectedPriority = 'medium';
  AppState.parsedNlp        = {};

  const overlay = document.getElementById('modal-add-task');
  const input   = document.getElementById('add-task-input');
  const preview = document.getElementById('nlp-preview');

  input.value           = prefill;
  preview.classList.remove('visible');

  // Reset priority
  document.querySelectorAll('.priority-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.priority === 'medium');
  });

  // Reset date/time fields
  document.getElementById('add-task-date').value = '';
  document.getElementById('add-task-time').value = '';

  // Expand notes section
  const notesSection = document.getElementById('notes-container')?.closest('.notes-section');
  if (notesSection) {
    notesSection.classList.remove('collapsed');
  }

  openModal('modal-add-task');
  setTimeout(() => input.focus(), 300);
}

function closeAddTaskModal() {
  closeModal('modal-add-task');
  document.getElementById('add-task-input').value = '';
  document.getElementById('add-task-notes').value = '';
  document.getElementById('add-task-reminders').value = '';
  document.getElementById('add-task-ideas').value = '';
  document.getElementById('add-notes-count').textContent = '0';
  document.getElementById('add-reminders-count').textContent = '0';
  document.getElementById('add-ideas-count').textContent = '0';
  document.getElementById('nlp-preview').classList.remove('visible');
  if (AppState.voiceActive) { stopVoiceInput(); setVoiceBtnState(false); }
}

async function submitAddTask() {
  const input    = document.getElementById('add-task-input');
  const dateEl   = document.getElementById('add-task-date');
  const timeEl   = document.getElementById('add-task-time');
  const notesEl  = document.getElementById('add-task-notes');
  const remindersEl = document.getElementById('add-task-reminders');
  const ideasEl  = document.getElementById('add-task-ideas');
  const rawText  = input.value.trim();

  if (!rawText) {
    input.focus();
    input.style.borderColor = 'var(--color-overdue)';
    setTimeout(() => input.style.borderColor = '', 800);
    return;
  }

  const overrides = {
    priority: AppState.selectedPriority,
    dueDate:  dateEl.value || undefined,
    dueTime:  timeEl.value || undefined,
    notes:    notesEl.value.trim(),
    quickNotes:   notesEl.value.trim(),
    reminders:    remindersEl.value.trim(),
    ideas:        ideasEl.value.trim(),
  };

  const task = await createTaskFromInput(rawText, overrides);
  if (!task) return;

  closeAddTaskModal();
  showToast(`Task added! ${task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}`, 'success');

  // Activate focus mode for high-priority tasks
  if (task.priority === 'high') {
    setTimeout(() => activateFocusMode(task), 500);
  }

  // Speak confirmation if voice was used
  if (AppState.voiceActive || rawText.length > 5) {
    speakTaskConfirmation(task);
  }

  await refreshDashboard();

  // Highlight new card briefly
  setTimeout(() => {
    const newCard = document.querySelector(`[data-task-id="${task.id}"]`);
    if (newCard) {
      newCard.style.boxShadow = '0 0 0 2px var(--color-purple)';
      setTimeout(() => { if (newCard) newCard.style.boxShadow = ''; }, 1500);
    }
  }, 100);
}

/* ---- AI Breakdown from Add Modal ---- */
function openAIBreakdown() {
  const input = document.getElementById('add-task-input').value.trim();
  if (!input) {
    showToast('Type something first', 'warning');
    return;
  }
  closeAddTaskModal();
  openBreakdownModal(input);
}

/* ======================================================
   AI BREAKDOWN MODAL
   ====================================================== */
function openBreakdownModal(text) {
  const modal      = document.getElementById('modal-ai-breakdown');
  const inputEl    = document.getElementById('breakdown-input-display');
  const listEl     = document.getElementById('breakdown-list');
  const thinkingEl = document.getElementById('breakdown-thinking');

  inputEl.textContent = text;
  listEl.innerHTML    = '';
  thinkingEl.style.display = 'flex';
  openModal('modal-ai-breakdown');

  setTimeout(() => {
    thinkingEl.style.display = 'none';
    const breakdown = aiBreakdownTasks(text);
    renderBreakdownList(breakdown.tasks, listEl);
  }, 1200);
}

function renderBreakdownList(tasks, container) {
  container.innerHTML = '';
  tasks.forEach((taskText, i) => {
    const item = document.createElement('div');
    item.className = 'ai-task-item';
    item.style.animationDelay = `${i * 0.07}s`;
    item.innerHTML = `
      <input type="checkbox" checked id="ai-task-${i}">
      <input type="text" class="ai-task-text" value="${escapeHtml(taskText)}" placeholder="Task ${i+1}">
      <button class="ai-task-remove" aria-label="Remove">✕</button>
    `;
    item.querySelector('.ai-task-remove').addEventListener('click', () => {
      item.style.animation = 'slideOutLeft 0.25s ease forwards';
      setTimeout(() => item.remove(), 250);
    });
    container.appendChild(item);
  });
}

async function submitBreakdownTasks() {
  const listEl = document.getElementById('breakdown-list');
  const items  = listEl.querySelectorAll('.ai-task-item');
  const tasks  = [];

  items.forEach((item, i) => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    const textEl   = item.querySelector('.ai-task-text');
    if (checkbox.checked && textEl.value.trim()) {
      tasks.push(textEl.value.trim());
    }
  });

  if (tasks.length === 0) { showToast('No tasks selected', 'warning'); return; }

  for (const title of tasks) {
    await addTask({ title, priority: 'medium', aiGenerated: true });
  }

  closeModal('modal-ai-breakdown');
  showToast(`${tasks.length} tasks added! 🧠`, 'success');
  await refreshDashboard();
}

/* ======================================================
   TASK DETAIL MODAL
   ====================================================== */
async function showTaskDetail(taskId) {
  const task = await getTaskById(taskId);
  if (!task) return;

  const modal     = document.getElementById('modal-task-detail');
  const titleEl   = document.getElementById('detail-title');
  const notesCont = document.getElementById('detail-notes');
  const notesText = document.getElementById('detail-notes-text');
  const timeEl    = document.getElementById('detail-time');
  const priorityEl= document.getElementById('detail-priority');
  const statusEl  = document.getElementById('detail-status');
  const snoozeEl  = document.getElementById('detail-snooze-count');
  const completeBtn= document.getElementById('detail-complete-btn');
  const focusBtn   = document.getElementById('detail-focus-btn');
  const snoozeBtn  = document.getElementById('detail-snooze-btn');
  const deleteBtn  = document.getElementById('detail-delete-btn');
  const editBtn    = document.getElementById('detail-edit-btn');

  titleEl.textContent    = task.title;
  if (task.notes) {
    notesCont.style.display = '';
    notesText.textContent = task.notes;
  } else {
    notesCont.style.display = 'none';
  }
  timeEl.textContent     = formatDueDateTime(task.dueDate, task.dueTime) || 'No due date';
  priorityEl.textContent = `${priorityEmoji(task.priority)} ${task.priority} priority`;
  priorityEl.className   = `badge badge-${task.priority}`;
  statusEl.textContent   = task.status === 'completed' ? '✅ Completed' : '⏳ Pending';
  snoozeEl.textContent   = task.snoozeCount > 0 ? `Snoozed ${task.snoozeCount}×` : '';
  snoozeEl.style.display = task.snoozeCount > 0 ? '' : 'none';

  // Buttons
  completeBtn.style.display = task.status === 'completed' ? 'none' : '';
  snoozeBtn.style.display   = task.status === 'completed' ? 'none' : '';

  completeBtn.onclick = async () => {
    closeModal('modal-task-detail');
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    await handleCompleteTask(taskId, card);
  };

  focusBtn.onclick = () => {
    closeModal('modal-task-detail');
    startFocusMode(task);
  };

  snoozeBtn.onclick  = () => { closeModal('modal-task-detail'); openSnoozeModal(taskId); };
  deleteBtn.onclick  = async () => { closeModal('modal-task-detail'); await handleDeleteTask(taskId); };
  editBtn.onclick    = () => { closeModal('modal-task-detail'); openEditModal(taskId); };

  // Postpone warning
  const postponeWarn = document.getElementById('detail-postpone-warn');
  if (postponeWarn) {
    postponeWarn.style.display = detectExcessivePostponing(task) ? '' : 'none';
    if (detectExcessivePostponing(task)) {
      postponeWarn.textContent = getPostponeMessage(task);
    }
  }

  AppState.editingTaskId = taskId;
  openModal('modal-task-detail');
}

/* ======================================================
   EDIT MODAL
   ====================================================== */
async function openEditModal(taskId, focusDate = false) {
  const task   = await getTaskById(taskId);
  if (!task) return;

  const modal    = document.getElementById('modal-edit-task');
  const titleEl  = document.getElementById('edit-task-title');
  const notesEl  = document.getElementById('edit-task-notes');
  const remindersEl = document.getElementById('edit-task-reminders');
  const ideasEl = document.getElementById('edit-task-ideas');
  const dateEl   = document.getElementById('edit-task-date');
  const timeEl   = document.getElementById('edit-task-time');

  titleEl.value = task.title;
  notesEl.value = task.quickNotes || task.notes || '';
  remindersEl.value = task.reminders || '';
  ideasEl.value = task.ideas || '';
  
  // Update character counts
  document.getElementById('edit-notes-count').textContent = notesEl.value.length;
  document.getElementById('edit-reminders-count').textContent = remindersEl.value.length;
  document.getElementById('edit-ideas-count').textContent = ideasEl.value.length;
  
  dateEl.value  = task.dueDate     || '';
  timeEl.value  = task.dueTime     || '';

  // Priority
  AppState.selectedPriority  = task.priority;
  AppState.editingTaskId     = taskId;

  document.querySelectorAll('#modal-edit-task .priority-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.priority === task.priority);
  });

  openModal('modal-edit-task');
  setTimeout(() => {
    if (focusDate) dateEl.focus();
    else titleEl.focus();
  }, 300);
}

async function submitEditTask() {
  const taskId  = AppState.editingTaskId;
  const titleEl = document.getElementById('edit-task-title');
  const notesEl = document.getElementById('edit-task-notes');
  const remindersEl = document.getElementById('edit-task-reminders');
  const ideasEl = document.getElementById('edit-task-ideas');
  const dateEl  = document.getElementById('edit-task-date');
  const timeEl  = document.getElementById('edit-task-time');

  if (!titleEl.value.trim()) {
    titleEl.style.borderColor = 'var(--color-overdue)';
    setTimeout(() => titleEl.style.borderColor = '', 800);
    return;
  }

  await editAndSaveTask(taskId, {
    title:       titleEl.value.trim(),
    notes:       notesEl.value.trim(),
    quickNotes:  notesEl.value.trim(),
    reminders:   remindersEl.value.trim(),
    ideas:       ideasEl.value.trim(),
    dueDate:     dateEl.value || null,
    dueTime:     timeEl.value || null,
    priority:    AppState.selectedPriority,
  });

  closeModal('modal-edit-task');
  showToast('Task updated ✏️', 'success');
  await refreshDashboard();
}

/* ======================================================
   SNOOZE MODAL
   ====================================================== */
function openSnoozeModal(taskId) {
  AppState.editingTaskId = taskId;
  openModal('modal-snooze');

  document.querySelectorAll('.snooze-option').forEach(opt => {
    opt.onclick = async () => {
      const minutes = parseInt(opt.dataset.minutes);
      await snoozeTask(taskId, minutes);
      cancelNotification(taskId);
      const task = await getTaskById(taskId);
      if (task) scheduleNotification(task);
      closeModal('modal-snooze');
      showToast(`Snoozed for ${minutes} min ⏰`, 'info');
      await refreshDashboard();
    };
  });
}

/* ======================================================
   POSTPONE ALERT
   ====================================================== */
function showPostponeAlert(task) {
  const suggestion = getFixedScheduleSuggestion(task);
  showToast(suggestion.message, 'warning', '⚠️');
}

/* ======================================================
   MODALS
   ====================================================== */
function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

/* ---- Create Choice Modal ---- */
function openCreateChoice() {
  openModal('modal-create-choice');
  
  // Set up choice buttons
  document.getElementById('choice-task')?.addEventListener('click', () => {
    closeModal('modal-create-choice');
    openAddTaskModal();
  });
  
  document.getElementById('choice-note')?.addEventListener('click', () => {
    closeModal('modal-create-choice');
    openAddNoteModal();
  });
}

function openAddNoteModal() {
  const modal = document.getElementById('modal-add-note');
  if (!modal) return;
  
  // Reset form
  document.getElementById('add-note-title').value = '';
  document.getElementById('add-note-content').value = '';
  document.getElementById('add-note-tags').value = '';
  document.getElementById('note-todos-list').innerHTML = '';
  document.getElementById('note-links-list').innerHTML = '';
  document.getElementById('note-todos-section').style.display = 'none';
  document.getElementById('note-links-section').style.display = 'none';
  
  AppState.currentNoteData = { todos: [], links: [] };
  openModal('modal-add-note');
  document.getElementById('add-note-title').focus();
}

function closeAddNoteModal() {
  closeModal('modal-add-note');
  AppState.currentNoteData = { todos: [], links: [] };
}

/* ======================================================
   VIEW SWITCHING
   ====================================================== */
function switchView(view) {
  AppState.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  if (view === 'tasks') refreshDashboard();
  if (view === 'notes') renderNotes();
  if (view === 'growth') renderGrowthCalendar();
}

/* ======================================================
   NOTES MANAGEMENT
   ====================================================== */
async function renderNotes() {
  const notesList = document.getElementById('notes-list-main');
  if (!notesList) return;
  
  AppState.notes = await getNotes();
  const notes = AppState.notes;
  
  // Update count
  const countEl = document.getElementById('notes-count');
  if (countEl) countEl.textContent = notes.length;
  
  if (notes.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <h3>No notes yet</h3>
        <p>Create your first note to start building your second brain</p>
      </div>
    `;
    return;
  }
  
  notesList.innerHTML = '';
  notes.forEach(note => {
    const card = renderNoteCard(note);
    if (card) notesList.appendChild(card);
  });
}

function renderNoteCard(note) {
  const card = document.createElement('div');
  card.className = `note-card${note.favorite ? ' favorite' : ''}`;
  card.dataset.noteId = note.id;
  
  const preview = note.content.substring(0, 80).replace(/\n/g, ' ') + (note.content.length > 80 ? '...' : '');
  const tagsHtml = note.tags && note.tags.length > 0
    ? note.tags.map(tag => `<span class="note-tag">#${escapeHtml(tag)}</span>`).join('')
    : '';
  
  const todoCount = note.todos ? note.todos.filter(t => t.completed).length : 0;
  const totalTodos = note.todos ? note.todos.length : 0;
  const todoHtml = totalTodos > 0 ? `<span class="note-todo-count">✓ ${todoCount}/${totalTodos}</span>` : '';
  
  const timestamp = new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  // Render todos with checkboxes
  let todosHtml = '';
  if (note.todos && note.todos.length > 0) {
    todosHtml = `
      <div class="note-todos-list">
        ${note.todos.map((todo, idx) => `
          <div class="note-todo-item${todo.completed ? ' completed' : ''}" data-todo-index="${idx}">
            <input type="checkbox" ${todo.completed ? 'checked' : ''} class="note-todo-checkbox" data-todo-index="${idx}">
            <span class="note-todo-text">${escapeHtml(todo.text)}</span>
            <button class="note-todo-remove" data-todo-index="${idx}">×</button>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  card.innerHTML = `
    <div class="note-header">
      <div class="note-title">${escapeHtml(note.title)}</div>
      <button class="note-star" data-note-id="${note.id}" title="Add to favorites">${note.favorite ? '⭐' : '☆'}</button>
    </div>
    <div class="note-preview">${escapeHtml(preview)}</div>
    ${todosHtml ? `<div class="note-section">${todosHtml}</div>` : ''}
    <div class="note-meta">
      <span class="note-date">📅 ${timestamp}</span>
      ${todoHtml}
      <div class="note-tags">${tagsHtml}</div>
    </div>
  `;
  
  // Star toggle
  card.querySelector('.note-star')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    note.favorite = !note.favorite;
    await updateNote(note);
    await renderNotes();
  });

  // Todo checkbox toggle
  card.querySelectorAll('.note-todo-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(checkbox.dataset.todoIndex);
      if (note.todos && note.todos[idx]) {
        note.todos[idx].completed = checkbox.checked;
        await updateNote(note);
        await renderNotes();
      }
    });
  });

  // Todo remove button
  card.querySelectorAll('.note-todo-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.todoIndex);
      if (note.todos) {
        note.todos.splice(idx, 1);
        await updateNote(note);
        await renderNotes();
      }
    });
  });
  
  // Open note on click
  card.addEventListener('click', () => showNoteDetail(note.id));
  
  return card;
}
  
  // Open note on click
  card.addEventListener('click', () => showNoteDetail(note.id));
  
  return card;
}

async function showNoteDetail(noteId) {
  const note = await getNoteById(noteId);
  if (!note) return;
  
  // For now, just show in console - you can implement a detail modal later
  console.log('Note:', note);
  // TODO: Create note-detail modal to display full note
}

async function submitAddNote() {
  const title = document.getElementById('add-note-title')?.value.trim();
  const content = document.getElementById('add-note-content')?.value.trim();
  const tagsInput = document.getElementById('add-note-tags')?.value.trim();
  
  if (!title || !content) {
    showToast('Please add a title and content', 'error');
    return;
  }
  
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
  
  const note = {
    title,
    content,
    todos: AppState.currentNoteData.todos || [],
    links: AppState.currentNoteData.links || [],
    tags,
    favorite: false,
  };
  
  const noteId = await addNote(note);
  showToast('Note saved! 📝', 'success');
  closeAddNoteModal();
  await renderNotes();
}

function addTodoToNote() {
  const todoText = prompt('What todo item?');
  if (!todoText) return;
  
  if (!AppState.currentNoteData.todos) AppState.currentNoteData.todos = [];
  AppState.currentNoteData.todos.push({ text: todoText, completed: false });
  
  renderNoteTodos();
}

function renderNoteTodos() {
  const section = document.getElementById('note-todos-section');
  const list = document.getElementById('note-todos-list');
  
  if (!AppState.currentNoteData.todos || AppState.currentNoteData.todos.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  list.innerHTML = '';
  
  AppState.currentNoteData.todos.forEach((todo, idx) => {
    const item = document.createElement('div');
    item.className = 'note-todo-item';
    item.innerHTML = `
      <input type="checkbox" ${todo.completed ? 'checked' : ''}>
      <input type="text" class="note-todo-text" value="${escapeHtml(todo.text)}" readonly>
      <button class="note-todo-remove">✕</button>
    `;
    
    item.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      AppState.currentNoteData.todos[idx].completed = e.target.checked;
    });
    
    item.querySelector('.note-todo-remove').addEventListener('click', () => {
      AppState.currentNoteData.todos.splice(idx, 1);
      renderNoteTodos();
    });
    
    list.appendChild(item);
  });
}

function addLinkToNote() {
  const url = prompt('Enter URL:');
  if (!url) return;
  
  const title = prompt('Link title (optional):', url);
  
  if (!AppState.currentNoteData.links) AppState.currentNoteData.links = [];
  AppState.currentNoteData.links.push({ url, title: title || url });
  
  renderNoteLinks();
}

function renderNoteLinks() {
  const section = document.getElementById('note-links-section');
  const list = document.getElementById('note-links-list');
  
  if (!AppState.currentNoteData.links || AppState.currentNoteData.links.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  list.innerHTML = '';
  
  AppState.currentNoteData.links.forEach((link, idx) => {
    const item = document.createElement('a');
    item.href = link.url;
    item.target = '_blank';
    item.className = 'note-link-item';
    item.innerHTML = `
      <span class="note-link-icon">🔗</span>
      <span class="note-link-text">${escapeHtml(link.title)}</span>
      <button class="note-link-remove" onclick="event.preventDefault()">✕</button>
    `;
    
    item.querySelector('.note-link-remove').addEventListener('click', () => {
      AppState.currentNoteData.links.splice(idx, 1);
      renderNoteLinks();
    });
    
    list.appendChild(item);
  });
}

/* ======================================================
   FOCUS MODE
   ====================================================== */
function activateFocusMode(task) {
  if (task.priority !== 'high') return;
  
  AppState.focusModeActive = true;
  AppState.currentFocusTask = task.id;
  
  const banner = document.createElement('div');
  banner.className = 'focus-mode-banner';
  banner.id = `focus-mode-${task.id}`;
  banner.innerHTML = `
    <div class="focus-title">🎯 FOCUS MODE ACTIVE</div>
    <div class="focus-text">
      ${escapeHtml(task.title)} 
      <span class="focus-time" id="focus-timer">0:00</span>
    </div>
    <p style="font-size: 0.75rem; margin-top: 8px; opacity: 0.9;">Don't leave until it's done!</p>
  `;
  
  document.body.insertBefore(banner, document.body.firstChild);
  
  // Start timer
  let seconds = 0;
  const timerInterval = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timerEl = document.getElementById('focus-timer');
    if (timerEl) {
      timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    }
  }, 1000);
  
  // Store interval ID for cleanup
  AppState.focusTimerInterval = timerInterval;
  
  showToast('Focus Mode Activated! 🎯', 'info', '⚡');
}

function deactivateFocusMode(taskId) {
  const banner = document.getElementById(`focus-mode-${taskId}`);
  if (banner) banner.remove();
  
  if (AppState.focusTimerInterval) {
    clearInterval(AppState.focusTimerInterval);
  }
  
  AppState.focusModeActive = false;
  AppState.currentFocusTask = null;
  
  showToast('Great work! Focus mode ended', 'success', '✅');
}

/* ======================================================
   GROWTH CALENDAR
   ====================================================== */
async function renderGrowthCalendar() {
  const completed = await getCompletedTasks();
  
  // Calculate Streak & Totals
  const now = new Date();
  const todayStr = toDateStr(now);
  let streak = 0;
  
  const completedDates = new Set(completed.map(t => typeof t.completedAt === 'string' ? t.completedAt.split('T')[0] : ''));
  
  let checkDateStr = todayStr;
  let checkDateObj = new Date(now);
  while (completedDates.has(checkDateStr)) {
    streak++;
    checkDateObj.setDate(checkDateObj.getDate() - 1);
    checkDateStr = toDateStr(checkDateObj);
  }
  
  document.getElementById('growth-stat-streak').textContent = streak;
  document.getElementById('growth-stat-total').textContent = completed.length;

  // Render 30-day heatmap grid
  const grid = document.getElementById('growth-calendar');
  if (!grid) return;
  grid.innerHTML = '';
  
  // Create last 30 days
  const days = [];
  const startDay = new Date(now);
  startDay.setDate(startDay.getDate() - 29);
  
  for(let i = 0; i < 30; i++) {
    days.push(toDateStr(startDay));
    startDay.setDate(startDay.getDate() + 1);
  }

  days.forEach((d) => {
    const count = completed.filter(t => t.completedAt && t.completedAt.startsWith(d)).length;
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    if (count > 0) {
      if (count <= 2) cell.classList.add('active-1');
      else if (count <= 4) cell.classList.add('active-2');
      else cell.classList.add('active-3');
    }
    cell.textContent = parseInt(d.split('-')[2]); // Just day number
    grid.appendChild(cell);
  });
}

/* ======================================================
   FOCUS MODE
   ====================================================== */
let focusTaskActive = null;

function startFocusMode(task) {
  focusTaskActive = task;
  const overlay = document.getElementById('focus-mode-overlay');
  
  document.getElementById('focus-task-title').textContent = task.title;
  document.getElementById('focus-task-notes').textContent = task.notes || '';
  
  const completeBtn = document.getElementById('focus-complete-btn');
  completeBtn.onclick = async () => {
    await completeTask(task.id);
    stopFocusMode();
    showToast('Focus task crushed! 🔥', 'success');
    launchConfetti();
    refreshDashboard();
  };
  
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  // Call notification system to start spamming
  if (window.startFocusSpam) {
    window.startFocusSpam(task);
  }
}

function stopFocusMode() {
  focusTaskActive = null;
  const overlay = document.getElementById('focus-mode-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
  if (window.stopFocusSpam) {
    window.stopFocusSpam();
  }
}

/* ======================================================
   EVENT LISTENERS
   ====================================================== */
function setupEventListeners() {
  /* ---- FAB ---- */
  document.getElementById('fab-add')?.addEventListener('click', () => openCreateChoice());

  /* ---- Tab nav ---- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* ---- Bottom nav ---- */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  /* ---- Modal close buttons ---- */
  document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.closest('.modal-overlay')?.id;
      if (modalId) closeModal(modalId);
    });
  });

  /* ---- Modal overlay click-outside ---- */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  /* ---- Add Task Input (NLP preview) ---- */
  const addInput = document.getElementById('add-task-input');
  if (addInput) {
    let nlpTimeout;
    addInput.addEventListener('input', (e) => {
      clearTimeout(nlpTimeout);
      nlpTimeout = setTimeout(() => {
        if (e.target.value.trim().length > 3) {
          const parsed = parseNaturalLanguage(e.target.value);
          AppState.parsedNlp = parsed;
          updateNlpPreview(parsed, document.getElementById('nlp-preview'));

          // Auto-update priority selector from NLP
          if (parsed.priority && parsed.priority !== AppState.selectedPriority) {
            AppState.selectedPriority = parsed.priority;
            document.querySelectorAll('#modal-add-task .priority-option').forEach(opt => {
              opt.classList.toggle('selected', opt.dataset.priority === parsed.priority);
            });
          }

          // Show AI Breakdown suggestion for vague inputs
          const aiBtn = document.getElementById('ai-breakdown-btn');
          if (aiBtn) aiBtn.style.display = detectVagueness(e.target.value) ? '' : 'none';
        } else {
          document.getElementById('nlp-preview')?.classList.remove('visible');
        }
      }, 350);
    });

    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAddTask(); }
    });
  }

  /* ---- Add Task Submit ---- */
  document.getElementById('btn-add-task-submit')?.addEventListener('click', submitAddTask);

  /* ---- AI Breakdown button in add modal ---- */
  document.getElementById('ai-breakdown-btn')?.addEventListener('click', openAIBreakdown);

  /* ---- Breakdown submit ---- */
  document.getElementById('btn-breakdown-submit')?.addEventListener('click', submitBreakdownTasks);

  /* ---- Edit submit ---- */
  document.getElementById('btn-edit-submit')?.addEventListener('click', submitEditTask);

  /* ---- Note modal buttons ---- */
  document.getElementById('btn-add-note-submit')?.addEventListener('click', submitAddNote);
  document.getElementById('btn-add-todo-item')?.addEventListener('click', () => addTodoToNote());
  document.getElementById('btn-add-link-item')?.addEventListener('click', () => addLinkToNote());

  /* ---- Priority selectors ---- */
  document.querySelectorAll('.priority-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const container = opt.closest('.priority-selector');
      container?.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      AppState.selectedPriority = opt.dataset.priority;
    });
  });

  /* ---- Voice button in add modal ---- */
  const voiceBtn = document.getElementById('voice-btn-add');
  if (voiceBtn) {
    voiceBtn.addEventListener('click', handleVoiceInput);
  }

  /* ---- Quick date picks in add modal ---- */
  document.querySelectorAll('.quick-pick').forEach(pick => {
    pick.addEventListener('click', () => {
      document.querySelectorAll('.quick-pick').forEach(p => p.classList.remove('selected'));
      pick.classList.add('selected');

      const now = new Date();
      const dateEl = document.getElementById('add-task-date');
      const value  = pick.dataset.value;

      if (value === 'today') {
        dateEl.value = toDateStr(now);
      } else if (value === 'tomorrow') {
        const d = new Date(now); d.setDate(d.getDate() + 1);
        dateEl.value = toDateStr(d);
      } else if (value === 'next-week') {
        const d = new Date(now); d.setDate(d.getDate() + 7);
        dateEl.value = toDateStr(d);
      }
    });
  });

  /* ---- Stat cards click → switch tab ---- */
  document.getElementById('stat-missed-card')?.addEventListener('click', () => switchTab('missed'));
  document.getElementById('stat-today-card')?.addEventListener('click',  () => switchTab('today'));
  document.getElementById('stat-upcoming-card')?.addEventListener('click',() => switchTab('upcoming'));

  /* ---- Settings toggles ---- */
  document.getElementById('toggle-notifications')?.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const perm = await requestNotificationPermission();
      if (perm !== 'granted') {
        e.target.checked = false;
        showToast('Notification permission denied', 'error');
      } else {
        showToast('Notifications enabled 🔔', 'success');
        await setSetting('notifications', true);
      }
    } else {
      cancelAllNotifications();
      await setSetting('notifications', false);
      showToast('Notifications disabled', 'info');
    }
  });

  document.getElementById('toggle-voice-confirm')?.addEventListener('change', async (e) => {
    await setSetting('voiceConfirm', e.target.checked);
  });

  document.getElementById('toggle-motivation')?.addEventListener('change', async (e) => {
    const card = document.getElementById('motivation-card');
    if (card) card.style.display = e.target.checked ? 'flex' : 'none';
    await setSetting('motivation', e.target.checked);
  });

  /* ---- Character Counter for Notes Fields ---- */
  const noteFields = [
    { id: 'add-task-notes', countId: 'add-notes-count' },
    { id: 'add-task-reminders', countId: 'add-reminders-count' },
    { id: 'add-task-ideas', countId: 'add-ideas-count' },
    { id: 'edit-task-notes', countId: 'edit-notes-count' },
    { id: 'edit-task-reminders', countId: 'edit-reminders-count' },
    { id: 'edit-task-ideas', countId: 'edit-ideas-count' },
  ];

  noteFields.forEach(field => {
    const el = document.getElementById(field.id);
    const countEl = document.getElementById(field.countId);
    if (el && countEl) {
      el.addEventListener('input', () => {
        countEl.textContent = el.value.length;
      });
    }
  });

  /* ---- Notes Section Toggle ---- */
  const notesToggle = document.getElementById('notes-toggle');
  const notesSection = document.querySelector('.notes-section');
  if (notesToggle && notesSection) {
    notesToggle.addEventListener('click', () => {
      notesSection.classList.toggle('collapsed');
    });
  }

  const notesToggleEdit = document.getElementById('notes-toggle-edit');
  const notesSectionEdit = document.querySelectorAll('.notes-section')[0];
  if (notesToggleEdit && notesSectionEdit) {
    notesToggleEdit.addEventListener('click', () => {
      notesSectionEdit.classList.toggle('collapsed');
    });
  }

  /* ---- Clear completed ---- */
  document.getElementById('btn-clear-completed')?.addEventListener('click', async () => {
    const completed = await getCompletedTasks();
    if (completed.length === 0) { showToast('No completed tasks to clear', 'info'); return; }
    for (const t of completed) await deleteTask(t.id);
    showToast(`Cleared ${completed.length} completed tasks`, 'success');
    await refreshDashboard();
  });
}

/* ---- Voice Input Handler ---- */
function handleVoiceInput() {
  const btn   = document.getElementById('voice-btn-add');
  const input = document.getElementById('add-task-input');

  if (!isVoiceSupported()) {
    showToast('Voice not supported in this browser. Use Chrome.', 'warning', '🎙️');
    return;
  }

  if (AppState.voiceActive) {
    stopVoiceInput();
    setVoiceBtnState(false);
    return;
  }

  AppState.voiceActive = true;
  setVoiceBtnState(true);

  startVoiceInput({
    onStart: () => showToast('Listening...', 'info', '🎙️'),
    onResult: (transcript, isFinal) => {
      input.value = transcript;
      if (isFinal) {
        const parsed = parseNaturalLanguage(transcript);
        AppState.parsedNlp = parsed;
        updateNlpPreview(parsed, document.getElementById('nlp-preview'));
      }
    },
    onEnd: () => {
      AppState.voiceActive = false;
      setVoiceBtnState(false);
    },
    onError: (msg) => {
      AppState.voiceActive = false;
      setVoiceBtnState(false);
      showToast(msg, 'error');
    }
  });
}

function setVoiceBtnState(recording) {
  const btn = document.getElementById('voice-btn-add');
  if (!btn) return;
  btn.classList.toggle('recording', recording);
  btn.innerHTML = recording
    ? `<div class="waveform"><span></span><span></span><span></span><span></span><span></span></div>`
    : '🎙️';
}

/* ---- Utility ---- */
function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

/* ---- Boot ---- */
document.addEventListener('DOMContentLoaded', initApp);

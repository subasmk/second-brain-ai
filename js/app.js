/* ==========================================
   APP.JS — Main controller & coordinator
   ========================================== */

/* ---- State ---- */
const AppState = {
  currentTab:    'today',
  currentView:   'dashboard',
  tasks:         [],
  categorized:   { overdue: [], today: [], upcoming: [], noDate: [], completed: [] },
  editingTaskId: null,
  selectedPriority: 'medium',
  parsedNlp:     {},
  voiceActive:   false,
};

/* ---- Init ---- */
async function initApp() {
  window.__app = {
    refreshDashboard,
    showPostponeAlert,
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
    openAddTaskModal();
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

  openModal('modal-add-task');
  setTimeout(() => input.focus(), 300);
}

function closeAddTaskModal() {
  closeModal('modal-add-task');
  document.getElementById('add-task-input').value = '';
  document.getElementById('nlp-preview').classList.remove('visible');
  if (AppState.voiceActive) { stopVoiceInput(); setVoiceBtnState(false); }
}

async function submitAddTask() {
  const input    = document.getElementById('add-task-input');
  const dateEl   = document.getElementById('add-task-date');
  const timeEl   = document.getElementById('add-task-time');
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
  };

  const task = await createTaskFromInput(rawText, overrides);
  if (!task) return;

  closeAddTaskModal();
  showToast(`Task added! ${task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}`, 'success');

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
  const descEl    = document.getElementById('detail-desc');
  const timeEl    = document.getElementById('detail-time');
  const priorityEl= document.getElementById('detail-priority');
  const statusEl  = document.getElementById('detail-status');
  const snoozeEl  = document.getElementById('detail-snooze-count');
  const completeBtn= document.getElementById('detail-complete-btn');
  const snoozeBtn  = document.getElementById('detail-snooze-btn');
  const deleteBtn  = document.getElementById('detail-delete-btn');
  const editBtn    = document.getElementById('detail-edit-btn');

  titleEl.textContent    = task.title;
  descEl.textContent     = task.description || '';
  descEl.style.display   = task.description ? '' : 'none';
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
  const descEl   = document.getElementById('edit-task-desc');
  const dateEl   = document.getElementById('edit-task-date');
  const timeEl   = document.getElementById('edit-task-time');

  titleEl.value = task.title;
  descEl.value  = task.description || '';
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
  const descEl  = document.getElementById('edit-task-desc');
  const dateEl  = document.getElementById('edit-task-date');
  const timeEl  = document.getElementById('edit-task-time');

  if (!titleEl.value.trim()) {
    titleEl.style.borderColor = 'var(--color-overdue)';
    setTimeout(() => titleEl.style.borderColor = '', 800);
    return;
  }

  await editAndSaveTask(taskId, {
    title:       titleEl.value.trim(),
    description: descEl.value.trim(),
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

/* ======================================================
   VIEW SWITCHING
   ====================================================== */
function switchView(view) {
  AppState.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  if (view === 'dashboard') refreshDashboard();
}

/* ======================================================
   EVENT LISTENERS
   ====================================================== */
function setupEventListeners() {
  /* ---- FAB ---- */
  document.getElementById('fab-add')?.addEventListener('click', () => openAddTaskModal());

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

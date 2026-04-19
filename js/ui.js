/* ==========================================
   UI.JS — DOM rendering & helpers
   ========================================== */

/* ---- Toast Notifications ---- */
function showToast(message, type = 'info', icon = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: '💡', warning: '⚠️' };
  const toast  = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icon || icons[type]}</span><span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
}

/* ---- Confetti ---- */
function launchConfetti() {
  const wrapper = document.createElement('div');
  wrapper.className = 'confetti-wrapper';
  document.body.appendChild(wrapper);

  const colors = ['#7c4dff','#2ed573','#ffc107','#ff4757','#54a0ff','#ff6b81'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${4 + Math.random() * 8}px;
      height: ${4 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${1 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.5}s;
    `;
    wrapper.appendChild(piece);
  }
  setTimeout(() => wrapper.remove(), 3000);
}

/* ---- Task Card Renderer ---- */
function renderTaskCard(task, opts = {}) {
  const now    = new Date();
  const today  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const urgency = getUrgency(task.dueDate, task.status);

  const card = document.createElement('div');
  card.className = `task-card priority-${task.priority} ${urgency}${task.status === 'completed' ? ' completed' : ''}`;
  card.dataset.taskId = task.id;

  const timeStr = formatDueDateTime(task.dueDate, task.dueTime);
  const timeUrgency = !task.dueDate ? '' : task.dueDate < today ? ' overdue' : task.dueDate === today ? ' today' : '';

  const snoozeHTML = (task.snoozeCount >= 1 && task.status === 'pending')
    ? `<span class="snooze-badge">⏰ ×${task.snoozeCount}</span>` : '';

  const aiHTML = task.aiGenerated ? `<span class="badge badge-ai">🧠 AI</span>` : '';

  const priorityBadge = task.status !== 'completed'
    ? `<span class="badge badge-${task.priority}">${priorityEmoji(task.priority)} ${task.priority}</span>` : '';

  card.innerHTML = `
    <div class="task-checkbox ${task.status === 'completed' ? 'checked' : ''}" role="button" tabindex="0" aria-label="Mark complete"></div>
    <div class="task-content">
      <div class="task-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-desc small muted">${escapeHtml(task.description)}</div>` : ''}
      <div class="task-meta">
        ${timeStr ? `<span class="task-time${timeUrgency}">${timeEmoji(urgency)} ${timeStr}</span>` : ''}
        ${priorityBadge}
        ${aiHTML}
        ${snoozeHTML}
      </div>
    </div>
    <div class="task-actions">
      <button class="task-menu-btn" aria-label="Task options" data-task-id="${task.id}">⋮</button>
    </div>
  `;

  // Checkbox click
  const checkbox = card.querySelector('.task-checkbox');
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    handleCompleteTask(task.id, card);
  });
  checkbox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCompleteTask(task.id, card); }
  });

  // Menu click
  card.querySelector('.task-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showTaskContextMenu(task, e.currentTarget);
  });

  // Card click → detail
  card.addEventListener('click', () => showTaskDetail(task.id));

  return card;
}

function priorityEmoji(p) {
  return { high: '🔴', medium: '🟡', low: '🟢' }[p] || '⚪';
}

function timeEmoji(urgency) {
  return { overdue: '🔴', today: '🕐', upcoming: '📅', completed: '✅' }[urgency] || '📅';
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---- Render task list into container ---- */
function renderTaskList(tasks, container, emptyMsg = 'No tasks here') {
  container.innerHTML = '';
  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <h3>${emptyMsg}</h3>
        <p>Tap + to add a task</p>
      </div>`;
    return;
  }
  tasks.forEach(task => container.appendChild(renderTaskCard(task)));
}

/* ---- Context Menu ---- */
let _ctxMenu = null;
function showTaskContextMenu(task, anchorEl) {
  hideContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'ctx-menu';

  const items = [
    { icon: '✏️', label: 'Edit',     action: () => openEditModal(task.id) },
    { icon: '⏰', label: 'Snooze',   action: () => openSnoozeModal(task.id) },
    { icon: '🔁', label: 'Reschedule', action: () => openEditModal(task.id, true) },
  ];

  if (task.status !== 'completed') {
    items.unshift({ icon: '✅', label: 'Mark Done', action: async () => {
      hideContextMenu();
      const card = document.querySelector(`[data-task-id="${task.id}"]`);
      await handleCompleteTask(task.id, card);
    }});
  }

  items.push(
    { separator: true },
    { icon: '🗑️', label: 'Delete', action: async () => {
      hideContextMenu();
      await handleDeleteTask(task.id);
    }, danger: true }
  );

  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-separator';
      menu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = `context-item${item.danger ? ' danger' : ''}`;
    el.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); item.action(); });
    menu.appendChild(el);
  });

  document.body.appendChild(menu);
  _ctxMenu = menu;

  // Position
  const rect = anchorEl.getBoundingClientRect();
  let top  = rect.bottom + 4;
  let left = rect.right - 180;
  if (left < 8) left = 8;
  if (top + 200 > window.innerHeight) top = rect.top - 200;
  menu.style.top  = `${top}px`;
  menu.style.left = `${left}px`;

  requestAnimationFrame(() => menu.classList.add('visible'));

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 10);
}

function hideContextMenu() {
  if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
}

/* ---- Complete Task Animation ---- */
async function handleCompleteTask(taskId, cardEl) {
  if (cardEl) cardEl.classList.add('completing');

  const task = await getTaskById(taskId);
  await completeTask(taskId);
  cancelNotification(taskId);
  
  // Award XP based on priority
  let xpReward = 10; // Base XP
  if (task && task.priority === 'high') xpReward = 30;
  else if (task && task.priority === 'medium') xpReward = 20;
  
  if (window.__app && window.__app.addXP) {
    await window.__app.addXP(xpReward);
  }

  // Track completed tasks for achievements
  const completedTasks = (await DB.getSetting('completedTasks')) || 0;
  await DB.setSetting('completedTasks', completedTasks + 1);
  
  // Track high priority completions
  if (task && task.priority === 'high') {
    await DB.setSetting('completedHighPriority', true);
  }
  
  // Deactivate focus mode if this task was in focus
  if (window.AppState && window.AppState.currentFocusTask === taskId) {
    window.deactivateFocusMode(taskId);
  }

  setTimeout(async () => {
    launchConfetti();
    showToast('Task completed! 🎉', 'success');
    await window.__app.refreshDashboard();
  }, 350);
}

/* ---- Delete Task ---- */
async function handleDeleteTask(taskId) {
  const cardEl = document.querySelector(`[data-task-id="${taskId}"]`);
  if (cardEl) cardEl.classList.add('deleting');

  await new Promise(r => setTimeout(r, 350));
  await deleteTask(taskId);
  cancelNotification(taskId);
  showToast('Task deleted', 'info', '🗑️');
  await window.__app.refreshDashboard();
}

/* ---- Stats Update ---- */
function updateStats(categorized) {
  const missedEl   = document.getElementById('stat-missed');
  const todayEl    = document.getElementById('stat-today');
  const upcomingEl = document.getElementById('stat-upcoming');

  if (missedEl)   { missedEl.textContent   = categorized.overdue.length; }
  if (todayEl)    { todayEl.textContent    = categorized.today.length; }
  if (upcomingEl) { upcomingEl.textContent = categorized.upcoming.length; }

  // Update nav badge
  const badge = document.getElementById('nav-badge');
  if (badge) {
    const missed = categorized.overdue.length;
    badge.textContent = missed > 0 ? missed : '';
    badge.style.display = missed > 0 ? 'flex' : 'none';
  }
}

/* ---- Motivation Card ---- */
function updateMotivationCard(categorized) {
  const card   = document.getElementById('motivation-card');
  const textEl = document.getElementById('motivation-text');
  if (!card || !textEl) return;

  const missed = categorized.overdue.length;
  const today  = categorized.today.length;

  if (missed > 0 && today === 0 && categorized.upcoming.length === 0) {
    // Only missed tasks
    textEl.innerHTML = `<strong>You have ${missed} overdue task${missed > 1 ? 's' : ''}.</strong> Let's tackle them one by one. You can do this.`;
    card.classList.add('nudge');
    setTimeout(() => card.classList.remove('nudge'), 600);
  } else if (today === 0 && missed === 0) {
    const nudge = getNextNudge();
    textEl.innerHTML = `<strong>${nudge.short}</strong> ${nudge.full}`;
  } else {
    const nudge = getNextNudge();
    textEl.innerHTML = `<strong>${nudge.short}</strong> ${nudge.full}`;
  }

  card.style.display = 'flex';
}

/* ---- NLP Preview Update ---- */
function updateNlpPreview(parsed, container) {
  if (!container) return;

  const chips = [];
  if (parsed.dueDate) {
    const label = formatDueDateTime(parsed.dueDate, parsed.dueTime) || parsed.dueDate;
    chips.push(`<span class="nlp-chip"><span>📅 Date</span><span>${label}</span></span>`);
  }
  if (parsed.dueTime && !parsed.dueDate) {
    chips.push(`<span class="nlp-chip"><span>🕐 Time</span><span>${parsed.dueTime}</span></span>`);
  }
  if (parsed.priority) {
    chips.push(`<span class="nlp-chip"><span>${priorityEmoji(parsed.priority)} Priority</span><span>${parsed.priority}</span></span>`);
  }

  if (chips.length === 0) { container.classList.remove('visible'); return; }

  container.classList.add('visible');
  container.querySelector('.nlp-chips').innerHTML = chips.join('');
}

/* ==========================================
   TASKS.JS — Task business logic
   ========================================== */

/**
 * Create new task from quick-add form
 */
async function createTaskFromInput(rawText, overrides = {}) {
  if (!rawText || !rawText.trim()) return null;

  const parsed   = parseNaturalLanguage(rawText);
  const priority = overrides.priority || parsed.priority;

  const taskData = {
    title:       overrides.title || parsed.cleanedText || rawText,
    notes:       overrides.notes || '',
    dueDate:     overrides.dueDate || parsed.dueDate,
    dueTime:     overrides.dueTime || parsed.dueTime,
    priority:    priority,
    notifyAt:    overrides.notifyAt || parsed.notifyAt,
    tags:        overrides.tags || [],
    aiGenerated: overrides.aiGenerated || false,
  };

  // Auto-suggest priority if not overridden
  if (!overrides.priority) {
    taskData.priority = suggestPriority(taskData);
  }

  const id = await addTask(taskData);
  taskData.id = id;

  // Schedule notification
  if (taskData.notifyAt) {
    scheduleNotification({ ...taskData, id, status: 'pending', snoozeCount: 0 });
  }

  return { ...taskData, id };
}

/**
 * Categorize tasks into overdue | today | upcoming | completed
 */
function categorizeTasks(tasks) {
  const now    = new Date();
  const today  = toDateOnlyStr(now);

  const overdue   = [];
  const todayList = [];
  const upcoming  = [];
  const completed = [];
  const noDate    = [];

  for (const task of tasks) {
    if (task.status === 'completed') { completed.push(task); continue; }
    if (!task.dueDate)               { noDate.push(task);    continue; }

    if (task.dueDate < today) {
      // Check if dueDate+dueTime is in the past
      overdue.push(task);
    } else if (task.dueDate === today) {
      todayList.push(task);
    } else {
      upcoming.push(task);
    }
  }

  // Sort each
  const byTime = (a, b) => {
    const ta = a.dueTime || '23:59';
    const tb = b.dueTime || '23:59';
    return ta.localeCompare(tb);
  };

  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byTime(a, b));
  todayList.sort(byTime);
  upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byTime(a, b));
  completed.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  noDate.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return { overdue, today: todayList, upcoming, noDate, completed };
}

/**
 * Get tasks for the selected tab
 */
function getTasksForTab(tab, categorized) {
  switch (tab) {
    case 'today':    return [...categorized.overdue, ...categorized.today, ...categorized.noDate];
    case 'missed':   return categorized.overdue;
    case 'upcoming': return categorized.upcoming;
    case 'completed':return categorized.completed;
    case 'all':      return [
      ...categorized.overdue,
      ...categorized.today,
      ...categorized.upcoming,
      ...categorized.noDate,
    ];
    default:         return categorized.today;
  }
}

/* ---- Edit task ---- */
async function editAndSaveTask(id, updates) {
  const task = await getTaskById(id);
  if (!task) return null;

  const updated = { ...task, ...updates };

  // Recalculate notifyAt if date/time changed
  if (updates.dueDate || updates.dueTime) {
    if (updated.dueDate) {
      const dt = new Date(updated.dueDate);
      if (updated.dueTime) {
        const [h, m] = updated.dueTime.split(':').map(Number);
        dt.setHours(h, m, 0, 0);
      } else {
        dt.setHours(9, 0, 0, 0);
      }
      updated.notifyAt = dt.toISOString();
    }
    cancelNotification(id);
    if (updated.notifyAt && updated.status === 'pending') {
      scheduleNotification(updated);
    }
  }

  await updateTask(updated);
  return updated;
}

/* ---- Helper ---- */
function toDateOnlyStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

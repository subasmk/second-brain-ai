/* ==========================================
   NOTIFICATIONS.JS — Smart Reminder Engine
   ========================================== */

let _notifInterval  = null;
const REPEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Request notification permission
 */
async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  const perm = await Notification.requestPermission();
  return perm;
}

/**
 * Send a browser notification
 */
function sendNotification(title, body, { tag, actions, data } = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const opts = {
    body,
    icon:     'icons/icon-192.png',
    badge:    'icons/icon-192.png',
    tag:      tag || 'secondbrain',
    renotify: true,
    requireInteraction: true,
    silent:   false,
    data,
  };

  // Service worker notifications (support actions)
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        ...opts,
        actions: actions || [
          { action: 'done',    title: '✅ Done' },
          { action: 'snooze5', title: '⏰ 5 min' },
          { action: 'snooze10',title: '⏰ 10 min' },
          { action: 'snooze30',title: '⏰ 30 min' },
        ],
      });
    });
  } else {
    new Notification(title, opts);
  }
}

/**
 * Schedule a task notification
 * Stores a timeout and interval for the task
 */
const _scheduledTasks = new Map();

function scheduleNotification(task) {
  if (!task.notifyAt || task.status === 'completed') return;

  cancelNotification(task.id);

  const fireAt = new Date(task.notifyAt).getTime();
  const now    = Date.now();
  const delay  = fireAt - now;

  function fire() {
    const urgency = getUrgencyLabel(task);
    sendNotification(
      `${urgency} ${task.title}`,
      task.dueTime
        ? `Due at ${formatTime12(task.dueTime)} — tap to act`
        : 'Tap to complete or snooze',
      {
        tag:  `task-${task.id}`,
        data: { taskId: task.id },
      }
    );

    // Check if we should show postpone suggestion
    if ((task.snoozeCount || 0) >= 3) {
      showPostponeAlert(task);
    }
  }

  if (delay <= 0) {
    // Already past due — fire immediately and repeat
    fire();
    const interval = setInterval(fire, REPEAT_INTERVAL_MS);
    _scheduledTasks.set(task.id, { interval });
  } else {
    const timeout = setTimeout(() => {
      fire();
      const interval = setInterval(fire, REPEAT_INTERVAL_MS);
      _scheduledTasks.set(task.id, { interval });
    }, delay);
    _scheduledTasks.set(task.id, { timeout });
  }
}

function cancelNotification(taskId) {
  const entry = _scheduledTasks.get(taskId);
  if (entry) {
    if (entry.timeout)  clearTimeout(entry.timeout);
    if (entry.interval) clearInterval(entry.interval);
    _scheduledTasks.delete(taskId);
  }
}

function cancelAllNotifications() {
  _scheduledTasks.forEach((_, id) => cancelNotification(id));
}

/**
 * Initialize notification system — re-schedule all pending tasks
 */
async function initNotifications() {
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') return;

  const tasks = await getPendingTasks();
  tasks.forEach(task => {
    if (task.notifyAt && task.status === 'pending') {
      scheduleNotification(task);
    }
  });

  // Also start an interval to check every minute for overdue tasks
  startOverdueChecker();
}

let _overdueChecker = null;
function startOverdueChecker() {
  if (_overdueChecker) clearInterval(_overdueChecker);
  _overdueChecker = setInterval(overdueCheck, 60 * 1000);
}

async function overdueCheck() {
  const tasks = await getPendingTasks();
  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  tasks.forEach(task => {
    if (!task.dueDate || task.pauseRemind) return;
    if (task.dueDate < today) {
      // Task is overdue and not yet notifying — send nudge
      if (!_scheduledTasks.has(task.id)) {
        const nudge = getNextNudge();
        sendNotification(
          `⚠️ Overdue: ${task.title}`,
          nudge.short + ' — Tap to handle it now.',
          { tag: `overdue-${task.id}`, data: { taskId: task.id } }
        );
      }
    }
  });
}

function showPostponeAlert(task) {
  if (typeof window.__app !== 'undefined' && window.__app) {
    window.__app.showPostponeAlert(task);
  }
}

/* ---- Helpers ---- */
function getUrgencyLabel(task) {
  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if (!task.dueDate)          return '📋';
  if (task.dueDate < today)   return '🔴';
  if (task.dueDate === today)  return '🟡';
  return '🟢';
}

function formatTime12(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${suffix}`;
}

/* ---- Listen for SW messages (snooze/done from notification click) ---- */
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', async (event) => {
    const { action, taskId } = event.data || {};
    if (!taskId) return;

    if (action === 'done') {
      await completeTask(taskId);
      cancelNotification(taskId);
      if (window.__app) window.__app.refreshDashboard();
    } else if (action === 'snooze5')  { await snoozeTaskNotif(taskId, 5);  }
    else if (action === 'snooze10') { await snoozeTaskNotif(taskId, 10); }
    else if (action === 'snooze30') { await snoozeTaskNotif(taskId, 30); }
  });
}

async function snoozeTaskNotif(taskId, minutes) {
  await snoozeTask(taskId, minutes);
  cancelNotification(taskId);
  const task = await getTaskById(taskId);
  if (task) scheduleNotification(task);
  if (window.__app) window.__app.refreshDashboard();
}

/* ======================================================
   FOCUS SYSTEM SPAMMER
   ====================================================== */
let _focusInterval = null;
let _audioCtx = null;

function beep(duration = 200, frequency = 440) {
  try {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
    const oscillator = _audioCtx.createOscillator();
    const gainNode = _audioCtx.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.value = frequency;

    oscillator.connect(gainNode);
    gainNode.connect(_audioCtx.destination);

    gainNode.gain.setValueAtTime(0.1, _audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, _audioCtx.currentTime + duration/1000);

    oscillator.start();
    setTimeout(() => oscillator.stop(), duration);
  } catch (e) {
    console.error("Audio beep failed", e);
  }
}

window.startFocusSpam = function(task) {
  if (_focusInterval) clearInterval(_focusInterval);
  
  // Try to beep
  beep(300, 800); setTimeout(() => beep(500, 600), 300);
  
  sendNotification(`FOCUS: ${task.title}`, 'Do not close the app until this is finished!', { tag: 'focus-alert', requireInteraction: true });
  
  // Super aggressive check every 15 seconds
  _focusInterval = setInterval(() => {
    if (document.hidden) {
      sendNotification(`⚠️ GET BACK TO WORK!`, `Focus task pending: ${task.title}`, { tag: `focus-spam-${Date.now()}`, requireInteraction: true });
    } else {
      beep(100, 400); setTimeout(() => beep(100, 400), 200);
    }
  }, 15000); 
};

window.stopFocusSpam = function() {
  if (_focusInterval) {
    clearInterval(_focusInterval);
    _focusInterval = null;
  }
};

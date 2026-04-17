/* ==========================================
   AI.JS — Client-side AI features
   Task breakdown, priority, motivation
   ========================================== */

/* ---- Task Breakdown Templates ---- */
const BREAKDOWN_TEMPLATES = {
  exam: (subject) => [
    `Review ${subject} notes from the beginning`,
    `Watch/read key topics in ${subject}`,
    `Solve practice problems for ${subject}`,
    `Create summary cheat sheet for ${subject}`,
    `Do a full mock test for ${subject}`,
    `Revisit weak areas in ${subject}`,
  ],
  study: (subject) => [
    `Set a 25-minute focused study block for ${subject}`,
    `Read and understand main concepts in ${subject}`,
    `Take notes on important points in ${subject}`,
    `Practice examples from ${subject}`,
    `Review what you have studied in ${subject}`,
  ],
  project: (name) => [
    `Define the goal and scope of "${name}"`,
    `Break "${name}" into smaller milestones`,
    `Research requirements for "${name}"`,
    `Start the first actionable step for "${name}"`,
    `Set a deadline for each milestone in "${name}"`,
    `Review and test the output of "${name}"`,
  ],
  workout: () => [
    'Do a 5-minute warm-up',
    'Complete your main workout session (30 min)',
    'Stretch and cool down (5 min)',
    'Track your progress and note improvements',
  ],
  eat: () => [
    'Plan meals for the week',
    'Prep ingredients in advance',
    'Cook meals in bulk',
    'Set reminders to eat on time',
  ],
  meeting: (context) => [
    `Prepare agenda for ${context}`,
    `Gather relevant documents for ${context}`,
    `Send calendar invite to participants`,
    `Note down key action items after ${context}`,
    `Follow up on commitments from ${context}`,
  ],
  clean: () => [
    'Declutter one area at a time (10 min)',
    'Wipe surfaces and dust',
    'Organize your desk/workspace',
    'Take out trash',
    'Do laundry if needed',
  ],
  read: (book) => [
    `Find a quiet time block for reading ${book}`,
    `Read for 20 minutes without distractions`,
    `Take notes on key insights from ${book}`,
    `Summarize what you read in 3 sentences`,
  ],
  call: (person) => [
    `Decide what you need to discuss with ${person}`,
    `Find a good time to call ${person}`,
    `Make the call to ${person}`,
    `Follow up on any decisions or next steps`,
  ],
  default: (topic) => [
    `Define what "${topic}" means concretely`,
    `Identify the very first action you can take`,
    `Set a 15-minute timer and just start`,
    `Review your progress and plan next steps`,
  ],
  stressed: (about) => [
    `List everything stressing you about "${about}"`,
    `Pick just ONE thing to tackle first`,
    `Break that one thing into 3 tiny steps`,
    `Start with just the first tiny step (5 min)`,
    `Take a 2-minute breathing break if overwhelmed`,
    `Reward yourself after completing something`,
  ],
  overwhelmed: () => [
    'Write down everything on your mind (brain dump)',
    'Pick the single most important task',
    'Do 5-2-1: 5 deep breaths, 2 minutes stand up, 1 task to start',
    'Block out all distractions and focus for 25 minutes',
    'Take a proper 5-minute break',
    'Review and prioritize what is left',
  ],
};

/**
 * Detect breakdown category from text
 * Returns { category, subject, tasks }
 */
function aiBreakdownTasks(text) {
  const lower = text.toLowerCase();

  // Stress / overwhelm
  if (/\boverwhelmed\b/.test(lower)) {
    return { tasks: BREAKDOWN_TEMPLATES.overwhelmed(), category: 'overwhelmed' };
  }
  if (/\bstressed?\b/.test(lower) || /\banxious\b/.test(lower)) {
    const about = extractSubject(lower, ['stressed about', 'anxious about', 'worried about']) || 'this';
    return { tasks: BREAKDOWN_TEMPLATES.stressed(about), category: 'stress' };
  }

  // Study / exam
  if (/\bexam\b|\btest\b/.test(lower)) {
    const subject = extractSubject(lower, ['exam', 'test', 'for', 'in']) || 'the exam';
    return { tasks: BREAKDOWN_TEMPLATES.exam(subject), category: 'exam' };
  }
  if (/\bstudy\b|\blearn\b/.test(lower)) {
    const subject = extractSubject(lower, ['study', 'learn', 'studying', 'learning']) || 'the topic';
    return { tasks: BREAKDOWN_TEMPLATES.study(subject), category: 'study' };
  }

  // Project / work
  if (/\bproject\b/.test(lower)) {
    const name = extractSubject(lower, ['project', 'work on', 'finish']) || 'the project';
    return { tasks: BREAKDOWN_TEMPLATES.project(name), category: 'project' };
  }

  // Workout / exercise
  if (/\bworkout\b|\bexercise\b|\bgym\b|\brun\b|\bjog\b/.test(lower)) {
    return { tasks: BREAKDOWN_TEMPLATES.workout(), category: 'workout' };
  }

  // Meeting
  if (/\bmeeting\b|\bcall\b|\bpresentation\b|\bpresent\b/.test(lower)) {
    const context = extractSubject(lower, ['meeting', 'call', 'with', 'about']) || 'the meeting';
    if (/\bcall\b/.test(lower)) {
      const person = extractSubject(lower, ['call', 'with']) || 'them';
      return { tasks: BREAKDOWN_TEMPLATES.call(person), category: 'call' };
    }
    return { tasks: BREAKDOWN_TEMPLATES.meeting(context), category: 'meeting' };
  }

  // Reading
  if (/\bread\b|\bbook\b/.test(lower)) {
    const book = extractSubject(lower, ['read', 'reading', 'finish']) || 'the book';
    return { tasks: BREAKDOWN_TEMPLATES.read(book), category: 'reading' };
  }

  // Cleaning
  if (/\bclean\b|\borganize\b|\btidy\b/.test(lower)) {
    return { tasks: BREAKDOWN_TEMPLATES.clean(), category: 'clean' };
  }

  // Eating / food
  if (/\beat\b|\bmeal\b|\bcook\b|\bdiet\b/.test(lower)) {
    return { tasks: BREAKDOWN_TEMPLATES.eat(), category: 'food' };
  }

  // Generic fallback
  const topic = text.trim() || 'this';
  return { tasks: BREAKDOWN_TEMPLATES.default(topic), category: 'generic' };
}

function extractSubject(text, keywords) {
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx !== -1) {
      const after = text.slice(idx + kw.length).trim();
      const words = after.split(/\b(tomorrow|today|urgent|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at|by|on|in|for)\b/)[0];
      if (words && words.length > 1) return words.trim();
    }
  }
  return null;
}

/* ---- Priority Suggestion ---- */
function suggestPriority(task) {
  const now     = new Date();
  const dueDate = task.dueDate ? new Date(task.dueDate + 'T12:00:00') : null;
  const titleLower = (task.title || '').toLowerCase();

  // Keyword overrides
  if (/\b(urgent|critical|asap|emergency)\b/.test(titleLower)) return 'high';
  if (/\b(later|someday|whenever|no rush)\b/.test(titleLower)) return 'low';

  // Time-based
  if (dueDate) {
    const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0)  return 'high';
    if (daysUntil <= 1)  return 'high';
    if (daysUntil <= 3)  return 'medium';
    if (daysUntil <= 7)  return 'medium';
    return 'low';
  }

  return 'medium';
}

/* ---- Postpone Detection ---- */
function detectExcessivePostponing(task) {
  return (task.snoozeCount || 0) >= 3;
}

function getPostponeMessage(task) {
  const count = task.snoozeCount || 0;
  const messages = [
    `You've snoozed "${task.title}" ${count} times. It's time to schedule a fixed slot.`,
    `"${task.title}" keeps getting pushed back. Block 30 minutes NOW to handle it.`,
    `You've delayed "${task.title}" ${count}x. Try breaking it into smaller steps.`,
  ];
  return messages[Math.min(count - 3, messages.length - 1)];
}

/* ---- Motivational Nudges ---- */
const MOTIVATIONAL_NUDGES = [
  { short: '⚡ Just start for 5 minutes.', full: 'You don\'t have to finish it all. Just start for 5 minutes — momentum will follow.' },
  { short: '🧠 Your future self will thank you.', full: 'Do this now, and the version of you tomorrow will be grateful. Don\'t let them down.' },
  { short: '🔥 What\'s stopping you right now?', full: 'Seriously — what is the specific obstacle? Name it, and usually it shrinks.' },
  { short: '⏰ This is stealing mental energy.', full: 'Keeping this undone takes more energy than doing it. Five minutes and it\'s gone.' },
  { short: '💪 One task at a time.', full: 'You don\'t need to do everything. You just need to do this one thing. That\'s it.' },
  { short: '🌱 Progress over perfection.', full: 'Done imperfectly is infinitely better than perfect in your head. Ship it.' },
  { short: '🎯 The hardest part is starting.', full: 'After 5 minutes you\'ll wonder why you waited. The first step is always the hardest.' },
  { short: '🤝 You made a commitment.', full: 'You set this task for a reason. Honor your past self\'s judgment.' },
  { short: '🕰️ Time is moving.', full: 'Every minute you delay is a minute closer to it being truly too late. Start now.' },
  { short: '💡 Break it down.', full: 'If this feels too big, break it into 3 pieces and do just the first one.' },
  { short: '🔋 You have enough energy.', full: 'You don\'t need to feel ready. You just need to begin.' },
  { short: '😤 You\'ve been delaying this too long.', full: 'Just start for 5 minutes. That\'s all. If you hate it after 5 min, you can stop.' },
  { short: '🌟 Small actions create big results.', full: 'Every great achievement started with a single small step. This is yours.' },
  { short: '🎊 Imagine how good done feels.', full: 'Picture the relief of checking this off. Now go make that feeling real.' },
  { short: '💥 Action kills anxiety.', full: 'The worry about doing it is worse than actually doing it. Move.' },
];

function getMotivationalNudge(task) {
  const idx = Math.floor(Math.random() * MOTIVATIONAL_NUDGES.length);
  return MOTIVATIONAL_NUDGES[idx];
}

let _nudgeIndex = 0;
function getNextNudge() {
  const nudge = MOTIVATIONAL_NUDGES[_nudgeIndex % MOTIVATIONAL_NUDGES.length];
  _nudgeIndex++;
  return nudge;
}

/* ---- Fixed Schedule Suggestion ---- */
function getFixedScheduleSuggestion(task) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  return {
    message: `You've postponed "${task.title}" ${task.snoozeCount} times. Let's fix it for tomorrow at 9 AM.`,
    suggestedDate: toDateStr(tomorrow),
    suggestedTime: '09:00',
  };

  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}

/* ---- Greeting ---- */
function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function getBrainStatus(missed, todayCount) {
  if (missed > 3) return { icon: '🔴', text: 'Brain Overloaded', color: 'var(--color-overdue)' };
  if (missed > 0) return { icon: '🟡', text: 'Behind Schedule', color: 'var(--color-today)' };
  if (todayCount > 0) return { icon: '🟢', text: 'On Track', color: 'var(--color-upcoming)' };
  return { icon: '✨', text: 'All Clear', color: 'var(--color-upcoming)' };
}

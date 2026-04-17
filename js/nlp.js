/* ==========================================
   NLP.JS — Natural Language Parser
   Parses date, time, and priority from text
   ========================================== */

const DAYS_OF_WEEK = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

const MONTH_NAMES = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

/**
 * Parse natural language text into task metadata.
 * Returns: { cleanedText, dueDate, dueTime, priority, notifyAt }
 */
function parseNaturalLanguage(text) {
  const original = text;
  let workText   = text.toLowerCase().trim();
  let result     = { cleanedText: text, dueDate: null, dueTime: null, priority: 'medium', notifyAt: null };

  // 1. Extract priority
  result.priority = extractPriority(workText);
  workText = removePriorityWords(workText);

  // 2. Extract date
  const dateResult = extractDate(workText);
  if (dateResult.date) {
    result.dueDate = dateResult.date;
    workText       = dateResult.remaining;
  }

  // 3. Extract time
  const timeResult = extractTime(workText);
  if (timeResult.time) {
    result.dueTime = timeResult.time;
    workText       = timeResult.remaining;
  }

  // 4. Set notifyAt
  if (result.dueDate) {
    const dt = new Date(result.dueDate);
    if (result.dueTime) {
      const [h, m] = result.dueTime.split(':').map(Number);
      dt.setHours(h, m, 0, 0);
    } else {
      dt.setHours(9, 0, 0, 0); // default 9am
    }
    result.notifyAt = dt.toISOString();
  }

  // 5. Clean up the text
  result.cleanedText = cleanupText(original, workText);

  return result;
}

/* ---- Priority Extraction ---- */
function extractPriority(text) {
  if (/\b(urgent|critical|asap|emergency|immediately|now|high priority|high)\b/i.test(text)) return 'high';
  if (/\b(important|medium|soon|moderate)\b/i.test(text)) return 'medium';
  if (/\b(whenever|low|later|someday|eventually|can wait|no rush)\b/i.test(text)) return 'low';
  return 'medium';
}

function removePriorityWords(text) {
  return text
    .replace(/\b(urgent|critical|asap|emergency|immediately|high priority)\b/gi, '')
    .replace(/\b(important|high|medium|low|later|someday|eventually|can wait|no rush)\b/gi, '')
    .trim();
}

/* ---- Date Extraction ---- */
function extractDate(text) {
  const now    = new Date();
  let date     = null;
  let remaining = text;

  // "today"
  if (/\btoday\b/.test(text)) {
    date = toDateStr(now);
    remaining = text.replace(/\btoday\b/g, '').trim();
    return { date, remaining };
  }

  // "tomorrow"
  if (/\btomorrow\b/.test(text)) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    date = toDateStr(d);
    remaining = text.replace(/\btomorrow\b/g, '').trim();
    return { date, remaining };
  }

  // "yesterday" (edge case for recorded tasks)
  if (/\byesterday\b/.test(text)) {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    date = toDateStr(d);
    remaining = text.replace(/\byesterday\b/g, '').trim();
    return { date, remaining };
  }

  // "next Monday", "this Friday", "on Wednesday"
  const dayMatch = text.match(/\b(?:next|this|on)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (dayMatch) {
    const targetDay = DAYS_OF_WEEK.indexOf(dayMatch[1].toLowerCase());
    const d         = new Date(now);
    const currentDay = d.getDay();
    let diff         = targetDay - currentDay;
    if (diff <= 0 || /\bnext\b/.test(dayMatch[0])) diff += 7;
    d.setDate(d.getDate() + diff);
    date      = toDateStr(d);
    remaining = text.replace(dayMatch[0], '').trim();
    return { date, remaining };
  }

  // "in X days / hours"
  const inMatch = text.match(/\bin\s+(\d+)\s+(day|days|week|weeks|hour|hours|minute|minutes)\b/i);
  if (inMatch) {
    const n    = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const d    = new Date(now);
    if (unit.startsWith('day'))  d.setDate(d.getDate() + n);
    if (unit.startsWith('week')) d.setDate(d.getDate() + n * 7);
    if (unit.startsWith('hour')) d.setHours(d.getHours() + n);
    if (unit.startsWith('min'))  d.setMinutes(d.getMinutes() + n);
    date      = toDateStr(d);
    remaining = text.replace(inMatch[0], '').trim();
    return { date, remaining };
  }

  // "tonight", "this evening", "this morning"
  if (/\btonight\b|\bthis evening\b/.test(text)) {
    date = toDateStr(now);
    remaining = text.replace(/\btonight\b|\bthis evening\b/g, '').trim();
    // attempt time
    if (!remaining.match(/\d/)) {
      return { date, remaining, defaultTime: '20:00' };
    }
    return { date, remaining };
  }

  if (/\bthis morning\b/.test(text)) {
    date = toDateStr(now);
    remaining = text.replace(/\bthis morning\b/g, '').trim();
    return { date, remaining, defaultTime: '09:00' };
  }

  if (/\bthis afternoon\b/.test(text)) {
    date = toDateStr(now);
    remaining = text.replace(/\bthis afternoon\b/g, '').trim();
    return { date, remaining, defaultTime: '14:00' };
  }

  // "Jan 15", "15 Jan", "15th", "January 15"
  const monthDayMatch = text.match(
    /\b(\d{1,2})\s*(st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i
  );
  if (monthDayMatch) {
    let day, monthStr;
    if (monthDayMatch[1]) { day = parseInt(monthDayMatch[1]); monthStr = monthDayMatch[3]; }
    else                  { day = parseInt(monthDayMatch[6]); monthStr = monthDayMatch[5]; }
    const month = MONTH_NAMES[monthStr.toLowerCase().replace(/\./, '')];
    if (month !== undefined) {
      const d = new Date(now.getFullYear(), month, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      date      = toDateStr(d);
      remaining = text.replace(monthDayMatch[0], '').trim();
      return { date, remaining };
    }
  }

  // "15th" standalone
  const dayNumMatch = text.match(/\b(\d{1,2})(st|nd|rd|th)\b/i);
  if (dayNumMatch) {
    const day = parseInt(dayNumMatch[1]);
    const d   = new Date(now.getFullYear(), now.getMonth(), day);
    if (d <= now) d.setMonth(d.getMonth() + 1);
    date      = toDateStr(d);
    remaining = text.replace(dayNumMatch[0], '').trim();
    return { date, remaining };
  }

  // "next week"
  if (/\bnext week\b/.test(text)) {
    const d = new Date(now); d.setDate(d.getDate() + 7);
    date      = toDateStr(d);
    remaining = text.replace(/\bnext week\b/, '').trim();
    return { date, remaining };
  }

  // "next month"
  if (/\bnext month\b/.test(text)) {
    const d = new Date(now); d.setMonth(d.getMonth() + 1);
    date      = toDateStr(d);
    remaining = text.replace(/\bnext month\b/, '').trim();
    return { date, remaining };
  }

  return { date: null, remaining: text };
}

/* ---- Time Extraction ---- */
function extractTime(text) {
  let time = null, remaining = text;

  // "5:30pm", "5:30 pm", "5pm", "17:30"
  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const m   = parseInt(timeMatch[2] || '0');
    const meridiem = timeMatch[3].toLowerCase();
    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    time      = `${pad(h)}:${pad(m)}`;
    remaining = text.replace(timeMatch[0], '').trim();
    return { time, remaining };
  }

  // "17:30" 24hr
  const time24Match = text.match(/\b(\d{2}):(\d{2})\b/);
  if (time24Match) {
    const h = parseInt(time24Match[1]);
    const m = parseInt(time24Match[2]);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      time      = `${pad(h)}:${pad(m)}`;
      remaining = text.replace(time24Match[0], '').trim();
      return { time, remaining };
    }
  }

  // "at noon"
  if (/\b(at\s+)?noon\b/.test(text)) {
    time      = '12:00';
    remaining = text.replace(/\b(at\s+)?noon\b/, '').trim();
    return { time, remaining };
  }

  // "at midnight"
  if (/\b(at\s+)?midnight\b/.test(text)) {
    time      = '00:00';
    remaining = text.replace(/\b(at\s+)?midnight\b/, '').trim();
    return { time, remaining };
  }

  return { time: null, remaining };
}

/* ---- Helpers ---- */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}-${m}-${d}`;
}

function pad(n) { return n.toString().padStart(2, '0'); }

function cleanupText(original, workText) {
  // Remove leftover connector words
  let clean = workText.replace(/\b(at|on|by|for|before|after|around|about|the|a|an)\b/gi, '').trim();
  // If too short or empty, use original first part
  clean = clean.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length < 3) return original;
  // Capitalize first letter
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Format a dueDate + dueTime into a friendly string
 */
function formatDueDateTime(dueDate, dueTime) {
  if (!dueDate) return null;

  const now   = new Date();
  const today = toDateStr(now);
  const tomorrow = toDateStr(new Date(now.getTime() + 86400000));

  let dateLabel;
  if (dueDate === today)     dateLabel = 'Today';
  else if (dueDate === tomorrow) dateLabel = 'Tomorrow';
  else {
    const d = new Date(dueDate + 'T12:00:00');
    dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  if (dueTime) {
    const [h, m] = dueTime.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12    = h % 12 || 12;
    return `${dateLabel} at ${h12}:${pad(m)} ${suffix}`;
  }
  return dateLabel;
}

/**
 * Get urgency class: overdue | today | upcoming
 */
function getUrgency(dueDate, status) {
  if (status === 'completed') return 'completed';
  if (!dueDate) return 'upcoming';

  const now   = new Date();
  const today = toDateStr(now);
  const taskDate = dueDate;

  if (taskDate < today) return 'overdue';
  if (taskDate === today) return 'today';
  return 'upcoming';
}

/**
 * Detect if text is vague / stress-based
 */
function detectVagueness(text) {
  const vague = [
    /\bstressed?\b/i, /\boverwhelmed\b/i, /\banxious\b/i, /\bworried?\b/i,
    /\bi need to\b/i, /\bi have to\b/i, /\bdon't know where to start\b/i,
    /\bso much\b/i, /\ba lot\b/i, /\bcan't focus\b/i
  ];
  return vague.some(r => r.test(text));
}

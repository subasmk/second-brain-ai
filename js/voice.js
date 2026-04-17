/* ==========================================
   VOICE.JS — Speech Recognition & Synthesis
   ========================================== */

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let _recognition = null;
let _isListening  = false;

/**
 * Check if speech recognition is supported
 */
function isVoiceSupported() {
  return !!SpeechRecognition;
}

/**
 * Start voice recognition
 * @param {function} onResult   - called with (transcript) when done
 * @param {function} onStart    - called when recording starts
 * @param {function} onEnd      - called when recording ends
 * @param {function} onError    - called with (error) on failure
 */
function startVoiceInput({ onResult, onStart, onEnd, onError }) {
  if (!isVoiceSupported()) {
    onError && onError('Voice recognition not supported on this browser. Please use Chrome.');
    return;
  }

  if (_isListening) {
    stopVoiceInput();
    return;
  }

  _recognition = new SpeechRecognition();
  _recognition.continuous         = false;
  _recognition.interimResults     = true;
  _recognition.lang               = 'en-US';
  _recognition.maxAlternatives    = 1;

  _recognition.onstart = () => {
    _isListening = true;
    onStart && onStart();
  };

  _recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    onResult && onResult(transcript, event.results[event.results.length - 1].isFinal);
  };

  _recognition.onend = () => {
    _isListening = false;
    onEnd && onEnd();
  };

  _recognition.onerror = (event) => {
    _isListening = false;
    let msg = 'Voice error: ' + event.error;
    if (event.error === 'not-allowed') msg = 'Microphone access denied. Please allow mic in browser settings.';
    if (event.error === 'no-speech')   msg = 'No speech detected. Try again.';
    onError && onError(msg);
  };

  try {
    _recognition.start();
  } catch (e) {
    onError && onError('Could not start microphone: ' + e.message);
  }
}

function stopVoiceInput() {
  if (_recognition && _isListening) {
    _recognition.stop();
    _isListening = false;
  }
}

function isListening() { return _isListening; }

/* ---- Speech Synthesis (TTS) ---- */

function speak(text, { rate = 1, pitch = 1, volume = 0.8 } = {}) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance  = new SpeechSynthesisUtterance(text);
  utterance.rate   = rate;
  utterance.pitch  = pitch;
  utterance.volume = volume;
  utterance.lang   = 'en-US';
  window.speechSynthesis.speak(utterance);
}

function speakTaskConfirmation(task) {
  const timeStr = task.dueTime ? ` at ${formatTimeSpoken(task.dueTime)}` : '';
  const dateStr = task.dueDate ? ` for ${formatDateSpoken(task.dueDate)}` : '';
  speak(`Task added: ${task.title}${dateStr}${timeStr}`);
}

function formatTimeSpoken(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  const minStr = m > 0 ? ` ${m}` : '';
  return `${h12}${minStr} ${suffix}`;
}

function formatDateSpoken(dateStr) {
  if (!dateStr) return '';
  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const tomorrow = new Date(now.getTime() + 86400000);
  const tmrStr   = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  if (dateStr === today) return 'today';
  if (dateStr === tmrStr) return 'tomorrow';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

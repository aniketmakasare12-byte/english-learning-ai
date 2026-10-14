const chat = document.getElementById("chat");
const input = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const statusEl = document.getElementById("status");
const voiceToggle = document.getElementById("voiceToggle");
let history = [];
let voiceEnabled = true;
let recognition = null;
let isListening = false;

function setStatus(text) { statusEl.textContent = text; }

function addMessage(role, text, speakButton = false) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "YOU" : "AI";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  // Use textContent rather than innerHTML so model output cannot inject markup.
  const p = document.createElement("p");
  p.textContent = text;
  bubble.appendChild(p);
  if (speakButton && role === "assistant") {
    const btn = document.createElement("button");
    btn.className = "speak-inline";
    btn.textContent = "🔊 Listen";
    btn.addEventListener("click", () => speak(text));
    bubble.appendChild(btn);
  }
  article.append(avatar, bubble);
  chat.appendChild(article);
  chat.scrollTop = chat.scrollHeight;
}

function speak(text) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = /[\u0900-\u097F]/.test(text) ? "mr-IN" : "en-IN";
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

async function sendMessage(forcedText) {
  const text = (forcedText ?? input.value).trim();
  if (!text || sendBtn.disabled) return;
  addMessage("user", text);
  input.value = "";
  sendBtn.disabled = true;
  setStatus("AI is preparing your lesson…");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    addMessage("assistant", data.reply, true);
    history.push({ role: "user", text }, { role: "model", text: data.reply });
    history = history.slice(-12);
    setStatus("Great work! Keep practising. 🌟");
    speak(data.reply);
  } catch (err) {
    addMessage("assistant", `माफ कर, एक अडचण आली: ${err.message}`);
    setStatus("कनेक्शन तपासा आणि पुन्हा प्रयत्न करा.");
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

sendBtn.addEventListener("click", () => sendMessage());
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
document.querySelectorAll("[data-prompt]").forEach(btn => {
  btn.addEventListener("click", () => sendMessage(btn.dataset.prompt));
});
document.querySelectorAll("[data-speak]").forEach(btn => {
  btn.addEventListener("click", () => speak(btn.dataset.speak));
});

voiceToggle.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  voiceToggle.textContent = voiceEnabled ? "🔊 Voice: On" : "🔇 Voice: Off";
  voiceToggle.setAttribute("aria-pressed", String(voiceEnabled));
  if (!voiceEnabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add("listening");
    micBtn.innerHTML = "🔴 <span>Listening…</span>";
    setStatus("बोलायला सुरुवात कर. Microphone चालू आहे.");
  };
  recognition.onresult = event => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = transcript;
  };
  recognition.onerror = event => {
    setStatus(event.error === "not-allowed"
      ? "Microphone permission द्या. Browser address bar जवळील lock icon तपासा."
      : `Voice recognition समस्या: ${event.error}. तुम्ही टाइप करू शकता.`);
  };
  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.innerHTML = "🎙️ <span>Speak</span>";
    if (input.value.trim()) setStatus("तुझे बोलणे text मध्ये आले. Send दाब.");
  };
  micBtn.addEventListener("click", () => {
    if (isListening) recognition.stop();
    else {
      try { recognition.start(); }
      catch (_) { setStatus("Microphone पुन्हा सुरू करण्यापूर्वी थोडा वेळ थांब."); }
    }
  });
} else {
  micBtn.disabled = true;
  micBtn.title = "Speech recognition is not supported in this browser. Try Microsoft Edge or Google Chrome.";
  micBtn.innerHTML = "🎙️ <span>Mic not supported</span>";
  setStatus("Microphone speech-to-text साठी Chrome किंवा Edge वापरा. Typing उपलब्ध आहे.");
}


const STORAGE_KEY = "luckDiaryRecords";

let records = loadRecords();
let selectedDate = toDateKey(new Date());
let viewDate = new Date(); // controls calendar month/year display

const selectedDateLabel = document.getElementById("selectedDateLabel");
const entryInput = document.getElementById("entryInput");
const charCount = document.getElementById("charCount");
const currentStreakEl = document.getElementById("currentStreak");
const longestStreakEl = document.getElementById("longestStreak");
const monthLabel = document.getElementById("monthLabel");
const calendarGrid = document.getElementById("calendarGrid");

document.getElementById("saveBtn").addEventListener("click", onSave);
document.getElementById("deleteBtn").addEventListener("click", onDelete);
document.getElementById("todayBtn").addEventListener("click", goToToday);
document.getElementById("prevMonthBtn").addEventListener("click", () => changeMonth(-1));
document.getElementById("nextMonthBtn").addEventListener("click", () => changeMonth(1));
document.getElementById("backupBtn").addEventListener("click", backupData);
document.getElementById("restoreBtn").addEventListener("click", restoreData);
entryInput.addEventListener("input", updateCounter);

init();

function init() {
  renderAll();
  registerServiceWorker();
}

function renderAll() {
  renderEntry();
  renderCalendar();
  renderStreaks();
}

function renderEntry() {
  selectedDateLabel.textContent = selectedDate;
  entryInput.value = records[selectedDate] || "";
  updateCounter();
}

function updateCounter() {
  const len = entryInput.value.length;
  charCount.textContent = `${len}/50`;
}

function onSave() {
  const text = entryInput.value.trim();

  if (!text) {
    alert("Please enter a luck event.");
    return;
  }
  if (text.length > 50) {
    alert("Max 50 characters.");
    return;
  }

  records[selectedDate] = text;
  saveRecords(records);
  renderAll();
}

function onDelete() {
  if (!records[selectedDate]) {
    alert("No entry on this date.");
    return;
  }
  if (!confirm(`Delete entry for ${selectedDate}?`)) return;
  delete records[selectedDate];
  saveRecords(records);
  renderAll();
}

function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  monthLabel.textContent = new Date(year, month, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long"
  });

  calendarGrid.innerHTML = "";

  const firstDayWeekIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(new Date());

  for (let i = 0; i < firstDayWeekIndex; i++) {
    const empty = document.createElement("div");
    empty.className = "day-empty";
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = toDateKey(new Date(year, month, day));
    const btn = document.createElement("button");
    btn.className = "day";
    btn.type = "button";
    btn.textContent = String(day);

    if (records[dateKey]) btn.classList.add("has-record");
    if (dateKey === selectedDate) btn.classList.add("selected");
    if (dateKey === todayKey) btn.classList.add("today");

    btn.addEventListener("click", () => {
      selectedDate = dateKey;
      renderEntry();
      renderCalendar();
    });

    calendarGrid.appendChild(btn);
  }
}

function changeMonth(step) {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + step, 1);
  renderCalendar();
}

function goToToday() {
  const now = new Date();
  selectedDate = toDateKey(now);
  viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
  renderAll();
}

function renderStreaks() {
  const keys = Object.keys(records);
  const current = calculateCurrentStreak(keys);
  const longest = calculateLongestStreak(keys);
  currentStreakEl.textContent = `Current Streak: ${current}`;
  longestStreakEl.textContent = `Longest Streak: ${longest}`;
}

function calculateCurrentStreak(dateKeys) {
  if (!dateKeys.length) return 0;
  const set = new Set(dateKeys);
  let streak = 0;
  let cursor = new Date();

  while (true) {
    const key = toDateKey(cursor);
    if (set.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function calculateLongestStreak(dateKeys) {
  if (!dateKeys.length) return 0;

  const sorted = [...dateKeys].sort();
  let longest = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = fromDateKey(sorted[i - 1]);
    const curr = fromDateKey(sorted[i]);
    const diffDays = Math.round((curr - prev) / 86400000);

    if (diffDays === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

function backupData() {
  const payload = {
    app: "LuckDiary",
    version: 1,
    exportedAt: new Date().toISOString(),
    records
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `luck-diary-backup-${toDateKey(new Date())}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

function restoreData() {
  const fileInput = document.getElementById("restoreFile");
  const file = fileInput.files?.[0];
  if (!file) {
    alert("Please choose a JSON backup file.");
    return;
  }

  const mode = document.querySelector('input[name="restoreMode"]:checked')?.value || "merge";
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = normalizeImportedData(parsed);

      if (!incoming) {
        alert("Invalid backup format.");
        return;
      }

      // sanitize + enforce 50 chars
      const cleaned = {};
      for (const [date, text] of Object.entries(incoming)) {
        if (!isDateKey(date)) continue;
        if (typeof text !== "string") continue;
        const t = text.trim();
        if (!t || t.length > 50) continue;
        cleaned[date] = t;
      }

      if (mode === "replace") {
        records = cleaned;
      } else {
        records = { ...records, ...cleaned };
      }

      saveRecords(records);
      renderAll();
      alert("Restore successful.");
      fileInput.value = "";
    } catch (e) {
      alert("Could not parse JSON file.");
    }
  };

  reader.readAsText(file);
}

function normalizeImportedData(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  if (parsed.records && typeof parsed.records === "object" && !Array.isArray(parsed.records)) {
    return parsed.records; // wrapped format
  }

  return parsed; // raw records format
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveRecords(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((err) => {
        console.warn("SW registration failed:", err);
      });
    });
  }
}

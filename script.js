/* =========================================================
   NIROflow — cleaned and consolidated JavaScript
   Keeps the existing localStorage keys and HTML element IDs.
   ========================================================= */

const NIRO_KEYS = {
  goals: "niroflow-goals",
  notes: "niroflow-notes",
  planPrefix: "niroflow-"
};

// Keep the existing default month (October 2026).
const _now = new Date();
let selectedDate = new Date(_now.getFullYear(), _now.getMonth(), 1);

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

function setDisplay(id, value) {
  const element = byId(id);
  if (element) element.style.display = value;
}

function formatMoney(value) {
  return "₦" + (Number(value) || 0).toLocaleString("en-NG", {
    maximumFractionDigits: 2
  });
}

function currentMonthKey() {
  return selectedDate.getFullYear() + "-" +
    String(selectedDate.getMonth() + 1).padStart(2, "0");
}

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error("Could not read saved data:", key, error);
    return [];
  }
}

function readPlan() {
  const raw = localStorage.getItem(NIRO_KEYS.planPrefix + currentMonthKey());
  if (!raw) return null;

  try {
    const plan = JSON.parse(raw);
    if (!plan || typeof plan !== "object") return null;
    plan.total = Number(plan.total) || 0;
    plan.categories = plan.categories && typeof plan.categories === "object"
      ? plan.categories
      : {};
    return plan;
  } catch (error) {
    console.error("Could not read the monthly plan:", error);
    return null;
  }
}

function calculatePlan(plan) {
  let allocated = 0;
  let biggestCategory = "";
  let biggestAmount = 0;

  Object.entries(plan.categories || {}).forEach(([category, rawAmount]) => {
    const amount = Math.max(0, Number(rawAmount) || 0);
   allocated = Math.round((allocated + amount) * 100) / 100;
    if (amount > biggestAmount) {
      biggestAmount = amount;
      biggestCategory = category;
    }
  });

  return {
    allocated,
  remaining: Math.round((plan.total - allocated) * 100) / 100,
    percentage: plan.total > 0 ? Math.round((allocated / plan.total) * 100) : 0,
    biggestCategory,
    biggestAmount,
    biggestPercentage: plan.total > 0 ? Math.round((biggestAmount / plan.total) * 100) : 0
  };
}

/* -------------------------
   LANDING PAGE + NAVIGATION
------------------------- */

function enterApp() {
  ["plannerPage", "allocationPage", "goalsPage", "notesPage", "insightsPage"]
    .forEach((id) => setDisplay(id, "none"));
  setDisplay("dashboard", "block");

  const landing = document.querySelector(".landing");
  const appPage = document.querySelector(".app-page");

  if (landing) landing.style.display = "none";
  if (appPage) appPage.classList.add("show");

  refreshAll();
}


function showDashboardFrom(pageId) {
  setDisplay(pageId, "none");
  setDisplay("dashboard", "block");
  refreshAll();
}

function openPlanner() {
  const saved = readPlan();
  const moneyInput = byId("availableMoney");
  if (moneyInput) moneyInput.value = saved && saved.total > 0 ? saved.total : "";
  setDisplay("dashboard", "none");
  setDisplay("plannerPage", "block");
}

function closePlanner() {
  setDisplay("plannerPage", "none");
  setDisplay("dashboard", "block");
  refreshAll();
}

function openGoals() {
  setDisplay("dashboard", "none");
  setDisplay("goalsPage", "block");
  loadGoals();
}

function closeGoals() {
  showDashboardFrom("goalsPage");
}

function openNotes() {
  setDisplay("dashboard", "none");
  setDisplay("notesPage", "block");
  loadNotes();
}

function closeNotes() {
  showDashboardFrom("notesPage");
}

function openInsights() {
  setDisplay("dashboard", "none");
  setDisplay("insightsPage", "block");
  loadInsights();
}

function closeInsights() {
  showDashboardFrom("insightsPage");
}

/* -------------------------
   MONTH SELECTOR
------------------------- */

function updateMonthLabel() {
  const label = selectedDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  });

  setText("currentMonth", label);
}

function changeMonth(direction) {
  selectedDate.setMonth(selectedDate.getMonth() + Number(direction || 0));

  updateMonthLabel();
  loadMonthlyPlan();
  loadInsights();
}

/* -------------------------
   MONTHLY PLAN + ALLOCATIONS
------------------------- */

function startPlanning() {
  const amountInput = byId("availableMoney");
  const amount = Number(amountInput ? amountInput.value : 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Please enter the amount available.");
    return;
  }

  setText("totalMoney", formatMoney(amount));
  setText("remainingMoney", formatMoney(amount));

  const allocationTotal = byId("availableForAllocation");
  if (allocationTotal) allocationTotal.value = amount;

  // Pre-fill category fields if a plan already exists for this month.
  const savedPlan = readPlan();

  document.querySelectorAll(".allocation-input").forEach((input) => {
    const category = input.dataset.category;

    if (
      savedPlan &&
      category &&
      Object.prototype.hasOwnProperty.call(savedPlan.categories, category)
    ) {
      input.value = savedPlan.categories[category];
    } else {
      input.value = "";
    }
  });

  const warning = byId("budgetWarning");
  if (warning) warning.style.display = "none";

  setDisplay("plannerPage", "none");
  setDisplay("allocationPage", "block");

  updateAllocation();
}

function updateAllocation() {
  const totalInput = byId("availableForAllocation");
  const total = Number(totalInput ? totalInput.value : 0) || 0;

  let allocated = 0;

  document.querySelectorAll(".allocation-input").forEach((input) => {
    const amount = Number(input.value);

    if (Number.isFinite(amount) && amount > 0) {
      allocated += amount;
    }
  });

  const remaining = total - allocated;

  setText("remainingMoney", formatMoney(Math.max(remaining, 0)));

  const warning = byId("budgetWarning");

  if (warning && allocated <= total) {
    warning.style.display = "none";
  }
}

function backToPlanner() {
  setDisplay("allocationPage", "none");
  setDisplay("plannerPage", "block");
}

function savePlan() {
  const totalInput = byId("availableForAllocation");
  const total = Number(totalInput ? totalInput.value : 0);

  if (!Number.isFinite(total) || total <= 0) {
    alert("Please enter a valid amount available.");
    return;
  }

  const categories = {};
  let allocated = 0;

  document.querySelectorAll(".allocation-input").forEach((input) => {
    const category = input.dataset.category || input.name || input.id;
    const amount = Number(input.value) || 0;

    if (amount < 0) return;

    if (category) {
      categories[category] = amount;
    }

    allocated += amount;
  });

  const warning = byId("budgetWarning");
  const warningText = byId("budgetWarningText");

  if (allocated > total) {
    if (warning) warning.style.display = "block";

    if (warningText) {
      warningText.textContent =
        "You've allocated " + formatMoney(allocated - total) +
        " more than your available money. Reduce one or more categories before saving.";
    }

    return;
  }

  if (warning) warning.style.display = "none";

  const plan = {
    total,
    categories
  };

  localStorage.setItem(
    NIRO_KEYS.planPrefix + currentMonthKey(),
    JSON.stringify(plan)
  );

  setDisplay("allocationPage", "none");
  setDisplay("plannerPage", "none");
  setDisplay("dashboard", "block");

  refreshAll();

  alert("Your plan has been saved.");
}

// Dashboard: money available + "Your flow" percentage only.
function loadMonthlyPlan() {
  updateMonthLabel();

  const plan = readPlan();

  const moneyCardHeading = byId("dashboardMoney");
  const percentageLabel = byId("dashboardPercentage");
  const progressBar = byId("dashboardProgress");
  const flowMessage = byId("dashboardFlowMessage");

  if (!plan) {
    if (moneyCardHeading) moneyCardHeading.textContent = formatMoney(0);
    if (percentageLabel) percentageLabel.textContent = "0%";
    if (progressBar) progressBar.style.width = "0%";

    if (flowMessage) {
      flowMessage.textContent =
        "Create your first plan to see your money flow.";
    }

    return;
  }

  const stats = calculatePlan(plan);

  if (moneyCardHeading) moneyCardHeading.textContent = formatMoney(plan.total);
  if (percentageLabel) percentageLabel.textContent = stats.percentage + "%";

  if (progressBar) {
    progressBar.style.width =
      Math.max(0, Math.min(stats.percentage, 100)) + "%";
  }

  if (flowMessage) {
    if (stats.remaining === 0) {
      flowMessage.textContent =
        "Your money has a purpose this month.";
    } else if (stats.remaining > 0) {
      flowMessage.textContent =
        formatMoney(stats.remaining) + " is still unallocated.";
    } else {
      flowMessage.textContent =
        "You are over budget by " +
        formatMoney(Math.abs(stats.remaining)) + ".";
    }
  }
}

/* -------------------------
   GOALS
------------------------- */

function createGoal() {
  const nameInput = byId("goalName");
  const targetInput = byId("goalTarget");
  const currentInput = byId("goalCurrent");

  const name = nameInput ? nameInput.value.trim() : "";
  const target = Number(targetInput ? targetInput.value : 0);
  const current = Number(currentInput && currentInput.value ? currentInput.value : 0);

  if (!name) {
    alert("Please enter a goal name.");
    return;
  }

  if (!Number.isFinite(target) || target <= 0) {
    alert("Please enter a valid goal target.");
    return;
  }

  if (!Number.isFinite(current) || current < 0) {
    alert("Please enter a valid current amount.");
    return;
  }

  if (current > target) {
    alert("Your current amount cannot be greater than your target.");
    return;
  }

  const goals = readArray(NIRO_KEYS.goals);

  goals.unshift({
    id: Date.now(),
    name,
    target,
    current
  });

  localStorage.setItem(NIRO_KEYS.goals, JSON.stringify(goals));

  if (nameInput) nameInput.value = "";
  if (targetInput) targetInput.value = "";
  if (currentInput) currentInput.value = "";

  // Stay on the goals page so the new goal shows up in the list below.
  loadGoals();
  loadInsights();
}

let goalsExpanded = false;
const GOALS_PREVIEW_COUNT = 3;

function loadGoals() {
  const display = byId("goalDisplay");

  if (!display) return;

  const goals = readArray(NIRO_KEYS.goals);

  display.innerHTML = "";

  if (!goals.length) {
    display.innerHTML =
      '<p class="empty-goal">Create a goal to start tracking your progress.</p>';
    return;
  }

  const visibleGoals = goalsExpanded
    ? goals
    : goals.slice(0, GOALS_PREVIEW_COUNT);

  visibleGoals.forEach((goal) => {
    const target = Number(goal.target) || 0;
    const current = Number(goal.current) || 0;

    const percentage = target > 0
      ? Math.min(Math.round((current / target) * 100), 100)
      : 0;

    const card = document.createElement("div");
    card.className = "goal-card";

    const top = document.createElement("div");
    top.className = "goal-card-top";

    const title = document.createElement("strong");
    title.textContent = goal.name || "Untitled goal";

    const percent = document.createElement("span");
    percent.className = "goal-percentage";
    percent.textContent = percentage + "%";

    top.append(title, percent);

    const bar = document.createElement("div");
    bar.className = "goal-progress-bar";

    const fill = document.createElement("div");
    fill.className = "goal-progress";
    fill.style.width = percentage + "%";

    bar.appendChild(fill);

    const amounts = document.createElement("div");
    amounts.className = "goal-amounts";

    const currentLabel = document.createElement("span");
    currentLabel.textContent = formatMoney(current);

    const targetLabel = document.createElement("span");
    targetLabel.textContent = formatMoney(target);

    amounts.append(currentLabel, targetLabel);

    const actions = document.createElement("div");
    actions.className = "goal-actions";

       const updateButton = document.createElement("button");
    updateButton.className = "update-goal-button";
    updateButton.textContent = "UPDATE PROGRESS";
    updateButton.type = "button";
    updateButton.dataset.goalAction = "update";
    updateButton.dataset.goalId = String(goal.id);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-goal-button";
    deleteButton.textContent = "DELETE GOAL";
    deleteButton.type = "button";
    deleteButton.dataset.goalAction = "delete";
    deleteButton.dataset.goalId = String(goal.id);

    actions.append(updateButton, deleteButton);


    card.append(top, bar, amounts, actions);

    display.appendChild(card);
  });

  // Show the expand/collapse control only when there are more than three goals.
  if (goals.length > GOALS_PREVIEW_COUNT) {
    const toggle = document.createElement("button");

    toggle.type = "button";
    toggle.className = "goals-toggle-button";
    toggle.textContent = goalsExpanded ? "SHOW LESS" : "SHOW MORE";

    toggle.style.display = "block";
    toggle.style.margin = "16px auto";
    toggle.style.padding = "10px 18px";
    toggle.style.borderRadius = "10px";
    toggle.style.border = "1px solid currentColor";
    toggle.style.background = "transparent";
    toggle.style.color = "inherit";
    toggle.style.fontWeight = "700";
    toggle.style.cursor = "pointer";

    toggle.addEventListener("click", function () {
      goalsExpanded = !goalsExpanded;
      loadGoals();
    });

    display.appendChild(toggle);
  }
}

function handleGoalDisplayClick(event) {
  const button = event.target.closest("[data-goal-action]");
  if (!button) return;

  const goalId = button.dataset.goalId;

  if (button.dataset.goalAction === "update") {
    updateGoalProgress(goalId);
  } else if (button.dataset.goalAction === "delete") {
    deleteGoal(goalId);
  }
}

// One delegated click handler keeps goal actions working after cards are re-rendered.
// In-page dialog (browser prompt()/confirm() are blocked in many previews and
// in-app browsers, which made these buttons silently do nothing).
function niroDialog(opts) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "niro-dialog-overlay";

    const box = document.createElement("div");
    box.className = "niro-dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    const title = document.createElement("h3");
    title.textContent = opts.title;

    const message = document.createElement("p");
    message.textContent = opts.message;

    box.append(title, message);

    let input = null;
    if (opts.withInput) {
      input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "any";
      input.inputMode = "decimal";
      input.value = opts.defaultValue;
      box.appendChild(input);
    }

    const error = document.createElement("p");
    error.className = "niro-dialog-error";
    box.appendChild(error);

    const actions = document.createElement("div");
    actions.className = "niro-dialog-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "niro-dialog-cancel";
    cancel.textContent = "CANCEL";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "niro-dialog-confirm" + (opts.danger ? " danger" : "");
    confirmBtn.textContent = opts.confirmText || "OK";

    actions.append(cancel, confirmBtn);
    box.appendChild(actions);
    overlay.appendChild(box);

    function close(result) {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(result);
    }

    function submit() {
      if (!input) return close(true);
      const raw = input.value.trim();
      const value = Number(raw);
      const problem = opts.validate ? opts.validate(value, raw) : "";
      if (problem) {
        error.textContent = problem;
        return;
      }
      close(value);
    }

    function onKey(event) {
      if (event.key === "Escape") close(null);
      else if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    }

    cancel.addEventListener("click", () => close(null));
    confirmBtn.addEventListener("click", submit);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    (input || confirmBtn).focus();
    if (input) input.select();
  });
}

async function updateGoalProgress(goalId) {
  const goal = readArray(NIRO_KEYS.goals).find(
    (item) => String(item.id) === String(goalId)
  );

  if (!goal) return;

  const target = Number(goal.target) || 0;

  const newAmount = await niroDialog({
    title: "Update progress",
    message: "How much have you currently set aside for " + goal.name + "?",
    withInput: true,
    defaultValue: String(goal.current || 0),
    confirmText: "SAVE",
    validate: (value, raw) => {
      if (raw === "" || !Number.isFinite(value) || value < 0) {
        return "Enter a valid amount of zero or more.";
      }
      if (value > target) {
        return "That is more than your goal target of " + formatMoney(target) + ".";
      }
      return "";
    }
  });

  if (newAmount === null) return;

  // Re-read after the dialog so we never save over stale data.
  const goals = readArray(NIRO_KEYS.goals);
  const fresh = goals.find((item) => String(item.id) === String(goalId));
  if (!fresh) return;

  fresh.current = newAmount;
  localStorage.setItem(NIRO_KEYS.goals, JSON.stringify(goals));

  loadGoals();
  loadInsights();
}

async function deleteGoal(goalId) {
  const goal = readArray(NIRO_KEYS.goals).find(
    (item) => String(item.id) === String(goalId)
  );

  if (!goal) return;

  const ok = await niroDialog({
    title: "Delete goal",
    message: 'Delete the goal "' + goal.name + '"? This can\'t be undone.',
    confirmText: "DELETE",
    danger: true
  });

  if (!ok) return;

  const remaining = readArray(NIRO_KEYS.goals).filter(
    (item) => String(item.id) !== String(goalId)
  );

  localStorage.setItem(NIRO_KEYS.goals, JSON.stringify(remaining));

  loadGoals();
  loadInsights();
}


/* -------------------------
   NOTES
------------------------- */

function saveNote() {
  const titleInput = byId("noteTitle");
  const contentInput = byId("noteContent");

  const title = titleInput ? titleInput.value.trim() : "";
  const content = contentInput ? contentInput.value.trim() : "";

  if (!title) {
    return alert("Please enter a note title.");
  }

  if (!content) {
    return alert("Please write something first.");
  }

  const notes = readArray(NIRO_KEYS.notes);

  notes.unshift({
    id: Date.now(),
    title,
    content,
    date: new Date().toLocaleDateString()
  });

  localStorage.setItem(
    NIRO_KEYS.notes,
    JSON.stringify(notes)
  );

  if (titleInput) titleInput.value = "";
  if (contentInput) contentInput.value = "";

  // Stay on the notes page so the new note shows up in the list below.
  loadNotes();
}

function loadNotes() {
  const display = byId("notesDisplay");

  if (!display) return;

  const notes = readArray(NIRO_KEYS.notes);

  if (!notes.length) {
    display.innerHTML =
      '<p class="empty-note">Write your first note to see it here.</p>';
    return;
  }

  display.innerHTML = "";

  notes.forEach((note) => {
    const card = document.createElement("div");
    card.className = "note-card";

    const title = document.createElement("div");
    title.className = "note-card-title";
    title.textContent = note.title || "Untitled note";

    const content = document.createElement("div");
    content.className = "note-card-content";
    content.textContent = note.content || "";

    const date = document.createElement("span");
    date.className = "note-card-date";
    date.textContent = note.date || "";

    card.append(title, content, date);

    display.appendChild(card);
  });
}

/* -------------------------
   INSIGHTS
------------------------- */

function loadInsights() {
  const status = byId("insightStatus");
  const statusText = byId("insightStatusText");
  const allocatedElement = byId("insightAllocated");
  const remainingElement = byId("insightRemaining");
  const biggestElement = byId("insightBiggest");

  const plan = readPlan();

  if (!plan) {
    if (status) status.textContent = "No plan yet";

    if (statusText) {
      statusText.textContent =
        "Create a monthly plan to see your insights.";
    }

    if (allocatedElement) {
      allocatedElement.textContent = formatMoney(0);
    }

    if (remainingElement) {
      remainingElement.textContent = formatMoney(0);
    }

    if (biggestElement) {
      biggestElement.textContent = "No allocations yet";
    }

    return;
  }

  const stats = calculatePlan(plan);

  if (allocatedElement) {
    allocatedElement.textContent = formatMoney(stats.allocated);
  }

  if (remainingElement) {
    remainingElement.textContent =
      formatMoney(Math.max(stats.remaining, 0));
  }

  if (biggestElement) {
    biggestElement.textContent = stats.biggestAmount > 0
      ? stats.biggestCategory + " — " +
        formatMoney(stats.biggestAmount) +
        " (" + stats.biggestPercentage + "%)"
      : "No allocations yet";
  }

  if (stats.remaining < 0) {
    if (status) status.textContent = "Over budget";

    if (statusText) {
      statusText.textContent =
        "Your allocations are higher than the money available.";
    }
  } else if (stats.remaining === 0) {
    if (status) status.textContent = "Fully planned";

    if (statusText) {
      statusText.textContent =
        "Every naira in this month's plan has a purpose.";
    }
  } else {
    if (status) status.textContent = "Partially planned";

    if (statusText) {
      statusText.textContent =
        "You still have " +
        formatMoney(stats.remaining) +
        " waiting for a purpose.";
    }
  }
}

/* -------------------------
   REFRESH ALL APP DATA
------------------------- */

function refreshAll() {
  loadMonthlyPlan();
  loadGoals();
  loadNotes();
  loadInsights();
}

// Recalculate the remaining amount while the user edits allocation inputs.
document.addEventListener("input", function (event) {
  if (
    event.target &&
    event.target.matches(".allocation-input, #availableForAllocation")
  ) {
    updateAllocation();
  }
});

// Make goal actions available to inline button handlers and existing HTML onclicks.
window.createGoal = createGoal;
window.updateGoalProgress = updateGoalProgress;
window.deleteGoal = deleteGoal;

function initializeNIROflow() {
  updateMonthLabel();

  const goalDisplay = byId("goalDisplay");
  if (goalDisplay) goalDisplay.addEventListener("click", handleGoalDisplayClick);

  refreshAll();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeNIROflow,
    { once: true }
  );
} else {
  initializeNIROflow();
}
/* -------------------------
   BUCKET LIST
------------------------- */

const BUCKET_KEY = "niroflow-bucket";

function openBucket() {
  setDisplay("dashboard", "none");
  setDisplay("bucketPage", "block");
  loadBucket();
}

function closeBucket() {
  showDashboardFrom("bucketPage");
}

function addBucketItem() {
  const input = byId("bucketInput");
  const text = input ? input.value.trim() : "";

  if (!text) {
    alert("Please write something for your bucket list.");
    return;
  }

  const items = readArray(BUCKET_KEY);
  items.push({ id: Date.now(), text, done: false });
  localStorage.setItem(BUCKET_KEY, JSON.stringify(items));

  input.value = "";
  input.focus();
  loadBucket();
}

function loadBucket() {
  const list = byId("bucketList");
  if (!list) return;

  const items = readArray(BUCKET_KEY);
  const doneCount = items.filter((item) => item.done).length;

  setText("bucketCount", doneCount + " of " + items.length + " done");

  const bar = byId("bucketProgress");
  if (bar) {
    bar.style.width = items.length
      ? Math.round((doneCount / items.length) * 100) + "%"
      : "0%";
  }

  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML =
      '<li class="bucket-empty">Your bucket list is empty. Add your first dream above.</li>';
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("li");
    row.className = "bucket-item" + (item.done ? " done" : "");

    const check = docuconstment.createElement("button");
    check.type = "button";
    check.className = "bucket-check";
    check.setAttribute("aria-label", item.done ? "Mark as not done" : "Mark as done");
    check.textContent = item.done ? "✓" : "";
    check.dataset.bucketAction = "toggle";
    check.dataset.bucketId = String(item.id);

    const label = document.createElement("span");
    label.className = "bucket-text";
    label.textContent = item.text;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bucket-delete";
    remove.setAttribute("aria-label", "Delete item");
    remove.textContent = "✕";
    remove.dataset.bucketAction = "delete";
    remove.dataset.bucketId = String(item.id);

    row.append(check, label, remove);
    list.appendChild(row);
  });
}

// One click handler for all ticks and deletes (works after every re-render).
document.addEventListener("click", function (event) {
  const button = event.target.closest("[data-bucket-action]");
  if (!button) return;

  const id = button.dataset.bucketId;
  let items = readArray(BUCKET_KEY);

  if (button.dataset.bucketAction === "toggle") {
    const item = items.find((entry) => String(entry.id) === id);
    if (item) item.done = !item.done;
  } else if (button.dataset.bucketAction === "delete") {
    items = items.filter((entry) => String(entry.id) !== id);
  }

  localStorage.setItem(BUCKET_KEY, JSON.stringify(items));
  loadBucket();
});

// Press Enter to add an item.
document.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && event.target && event.target.id === "bucketInput") {
    event.preventDefault();
    addBucketItem();
  }
});

window.openBucket = openBucket;
window.closeBucket = closeBucket;
window.addBucketItem = addBucketItem;

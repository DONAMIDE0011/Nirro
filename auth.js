import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCOM2v3-EsknnJXn6de9s4A3kmpvEFUsiM",
  authDomain: "niroflow-fc8a3.firebaseapp.com",
  projectId: "niroflow-fc8a3",
  storageBucket: "niroflow-fc8a3.firebasestorage.app",
  messagingSenderId: "631210641281",
  appId: "1:631210641281:web:8d2529b65330fa0f374a80",
  measurementId: "G-PTW1DZ126L"
};

const configured = !firebaseConfig.apiKey.startsWith("YOUR_");
const app = configured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app
  ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, "donald")
  : null;

let mode = "login"; // "login" or "signup"

function el(id) { return document.getElementById(id); }

/* -------------------------
   CLOUD SYNC
   Your app keeps using localStorage. This layer loads the user's data
   from Firestore at login and mirrors every save back to Firestore.
------------------------- */

const PREFIX = "niroflow-";
let cloudReady = false;
let currentUid = null;
let dirty = {}; // changes made before the cloud data finished loading
const pendingSaves = new Set();

const nativeSetItem = Storage.prototype.setItem;

Storage.prototype.setItem = function (key, value) {
  nativeSetItem.call(this, key, value);
  if (this === localStorage && String(key).startsWith(PREFIX)) {
    saveToCloud(String(key), String(value));
  }
};

function clearLocalAppData() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(PREFIX))
    .forEach((key) => localStorage.removeItem(key));
}

function setSyncBanner(text) {
  let banner = el("syncBanner");

  if (!text) {
    if (banner) banner.remove();
    return;
  }

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "syncBanner";
    banner.style.cssText =
      "position:fixed;left:50%;transform:translateX(-50%);bottom:18px;" +
      "z-index:9999;background:#0d0d0d;border:1px solid #20ed70;color:#fff;" +
      "padding:10px 16px;border-radius:999px;font-size:13px;max-width:90%;" +
      "text-align:center;";
    document.body.appendChild(banner);
  }

  banner.textContent = text;
}

function refreshScreens() {
  if (typeof window.refreshAll === "function") window.refreshAll();
  if (typeof window.loadBucket === "function") window.loadBucket();
}

// Loads this user's data in the background. Retries until it works.
async function syncFromCloud(uid) {
  setSyncBanner("Syncing your data...");

  while (currentUid === uid) {
    try {
      const snap = await Promise.race([
        getDoc(doc(db, "users", uid)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 20000)
        )
      ]);

      if (currentUid !== uid) return;

      const data = snap.exists() ? (snap.data().data || {}) : {};

      Object.entries(data).forEach(([key, value]) => {
        if (!(key in dirty)) nativeSetItem.call(localStorage, key, value);
      });

      cloudReady = true;

      const pending = dirty;
      dirty = {};
      Object.entries(pending).forEach(([key, value]) => saveToCloud(key, value));

      setSyncBanner("");
      refreshScreens();
      return;
    } catch (error) {
      console.error("Cloud load failed:", error);
      setSyncBanner(
        "Can't reach your saved data yet. Retrying... (" +
        (error.code || error.message) + ")"
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

let savedTimer = null;

function saveToCloud(key, value) {
  if (!currentUid) return;

  if (!cloudReady) {
    dirty[key] = value;
    return;
  }

  setSyncBanner("Saving...");

  const job = setDoc(
    doc(db, "users", currentUid),
    { data: { [key]: value }, updatedAt: Date.now() },
    { merge: true }
  )
    .then(() => {
      if (pendingSaves.size <= 1) {
        setSyncBanner("Saved ✓");
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => setSyncBanner(""), 1500);
      }
    })
    .catch((error) => {
      console.error("Cloud save failed:", error);
      setSyncBanner("Couldn't save: " + (error.code || error.message));
    })
    .finally(() => pendingSaves.delete(job));

  pendingSaves.add(job);
}

// Called as soon as someone is logged in. Opens the app immediately.
function handleUser(user) {
  if (currentUid === user.uid) return;

  clearLocalAppData();
  dirty = {};
  cloudReady = false;
  currentUid = user.uid;

  el("authPage").classList.remove("show");
  el("authPassword").value = "";
  showMessage("");

  const initial = (user.displayName || user.email || "N").charAt(0).toUpperCase();
  el("profileInitial").textContent = initial;

  const passwordPage = el("passwordPage");
  if (passwordPage) passwordPage.style.display = "none";

  window.enterApp();
  syncFromCloud(user.uid);
}

/* -------------------------
   LOGIN / SIGN UP SCREEN
------------------------- */

function showMessage(text, good) {
  const box = el("authMessage");
  box.textContent = text || "";
  box.className = "auth-message" + (good ? " good" : "");
}

function friendlyError(error) {
  const code = (error && error.code) || "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/missing-password": "Please enter your password.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/user-not-found": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a bit and try again.",
    "auth/network-request-failed": "No internet connection. Please try again."
  };
  return map[code] || "Something went wrong. Please try again.";
}

function setBusy(busy) {
  const button = el("authSubmit");
  button.disabled = busy;
  if (busy) button.textContent = "PLEASE WAIT...";
  else button.textContent = mode === "login" ? "LOG IN →" : "CREATE ACCOUNT →";
}

function applyMode() {
  const login = mode === "login";
  el("authTitle").textContent = login ? "Welcome back." : "Start your flow.";
  el("authSub").textContent = login
    ? "Log in to continue your flow."
    : "Create your free account in seconds.";
  el("authNameField").style.display = login ? "none" : "block";
  el("authForgot").style.display = login ? "inline-block" : "none";
  el("authSwitchText").textContent = login ? "New here?" : "Already have an account?";
  el("authSwitchBtn").textContent = login ? "Create an account" : "Log in";
  el("authPassword").autocomplete = login ? "current-password" : "new-password";
  showMessage("");
  setBusy(false);
}

window.switchAuthMode = function () {
  mode = mode === "login" ? "signup" : "login";
  applyMode();
};

window.showAuth = function () {
  document.querySelector(".landing").style.display = "none";
  el("authPage").classList.add("show");
  applyMode();
};

window.backToLanding = function () {
  el("authPage").classList.remove("show");
  document.querySelector(".landing").style.display = "";
};

window.startFromLanding = function () {
  if (auth && auth.currentUser) window.enterApp();
  else window.showAuth();
};

window.submitAuth = async function () {
  if (!configured) {
    showMessage("Firebase isn't set up yet. Paste your config into auth.js.");
    return;
  }

  const email = el("authEmail").value.trim();
  const password = el("authPassword").value;
  const name = el("authName").value.trim();

  if (!email || !password) {
    showMessage("Please enter your email and password.");
    return;
  }

  setBusy(true);
  showMessage("");

  try {
    if (mode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
      handleUser(cred.user);
    } else {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      handleUser(cred.user);
    }
  } catch (error) {
    showMessage(friendlyError(error));
    setBusy(false);
  }
};

window.resetPassword = async function () {
  if (!configured) return;
  const email = el("authEmail").value.trim();
  if (!email) {
    showMessage("Type your email above first, then tap Forgot password.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset email sent. Check your inbox.", true);
  } catch (error) {
    showMessage(friendlyError(error));
  }
};

window.logOut = async function () {
  if (!auth) return;
  await Promise.allSettled([...pendingSaves]); // let unsaved changes finish first
  cloudReady = false;
  currentUid = null;
  dirty = {};
  setSyncBanner("");
  clearLocalAppData();
  await signOut(auth);
};

/* -------------------------
   CHANGE PASSWORD
   Builds its own button + page, so index.html needs no changes.
------------------------- */

function setPwMessage(text, good) {
  const box = el("pwMessage");
  if (!box) return;
  box.textContent = text || "";
  box.className = "auth-message" + (good ? " good" : "");
}

function passwordError(error) {
  const code = (error && error.code) || "";
  const map = {
    "auth/invalid-credential": "Your current password is incorrect.",
    "auth/wrong-password": "Your current password is incorrect.",
    "auth/weak-password": "New password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a bit and try again.",
    "auth/network-request-failed": "No internet connection. Please try again.",
    "auth/requires-recent-login": "For security, please log out, log in again, and retry."
  };
  return map[code] || "Something went wrong. Please try again.";
}

window.openPassword = function () {
  ["pwOld", "pwNew", "pwConfirm"].forEach((id) => { el(id).value = ""; });
  setPwMessage("");
  el("pwSubmit").disabled = false;
  el("pwSubmit").textContent = "UPDATE PASSWORD →";
  el("dashboard").style.display = "none";
  el("passwordPage").style.display = "block";
};

window.closePassword = function () {
  el("passwordPage").style.display = "none";
  el("dashboard").style.display = "block";
};

window.changePassword = async function () {
  const user = auth && auth.currentUser;

  if (!user || !user.email) {
    setPwMessage("Please log in again.");
    return;
  }

  const oldPassword = el("pwOld").value;
  const newPassword = el("pwNew").value;
  const confirmPassword = el("pwConfirm").value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    setPwMessage("Please fill in all three fields.");
    return;
  }
  if (newPassword.length < 6) {
    setPwMessage("New password must be at least 6 characters.");
    return;
  }
  if (newPassword !== confirmPassword) {
    setPwMessage("The new passwords don't match.");
    return;
  }
  if (newPassword === oldPassword) {
    setPwMessage("Your new password must be different from the current one.");
    return;
  }

  const button = el("pwSubmit");
  button.disabled = true;
  button.textContent = "PLEASE WAIT...";
  setPwMessage("");

  try {
    // Firebase checks the old password first.
    const credential = EmailAuthProvider.credential(user.email, oldPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);

    ["pwOld", "pwNew", "pwConfirm"].forEach((id) => { el(id).value = ""; });
    setPwMessage("Password changed successfully.", true);
  } catch (error) {
    setPwMessage(passwordError(error));
  }

  button.disabled = false;
  button.textContent = "UPDATE PASSWORD →";
};

function buildPasswordUI() {
  const appPage = document.querySelector(".app-page");
  const dashboard = el("dashboard");
  if (!appPage || !dashboard || el("passwordPage")) return;

  // Button at the bottom of the dashboard
  const account = document.createElement("div");
  account.className = "account-section";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "account-button";
  openButton.textContent = "Change password";
  openButton.addEventListener("click", window.openPassword);

  account.appendChild(openButton);
  dashboard.appendChild(account);

  // The page itself
  const page = document.createElement("div");
  page.id = "passwordPage";
  page.innerHTML =
    '<button type="button" class="back-button" id="pwBack">← Back</button>' +
    '<p class="small-text">YOUR ACCOUNT</p>' +
    '<h2>Change password.</h2>' +
    '<p class="planner-description">Enter your current password, then choose a new one.</p>' +
    '<div class="auth-field"><label for="pwOld">CURRENT PASSWORD</label>' +
    '<input type="password" id="pwOld" autocomplete="current-password"></div>' +
    '<div class="auth-field"><label for="pwNew">NEW PASSWORD</label>' +
    '<input type="password" id="pwNew" placeholder="At least 6 characters" autocomplete="new-password"></div>' +
    '<div class="auth-field"><label for="pwConfirm">CONFIRM NEW PASSWORD</label>' +
    '<input type="password" id="pwConfirm" autocomplete="new-password"></div>' +
    '<p class="auth-message" id="pwMessage"></p>' +
    '<button type="button" class="auth-submit" id="pwSubmit">UPDATE PASSWORD →</button>';

  appPage.appendChild(page);

  el("pwBack").addEventListener("click", window.closePassword);
  el("pwSubmit").addEventListener("click", window.changePassword);
}

buildPasswordUI();

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      handleUser(user);
    } else {
      cloudReady = false;
      currentUid = null;
      dirty = {};
      setSyncBanner("");
      clearLocalAppData();
      document.querySelector(".app-page").classList.remove("show");
      el("authPage").classList.remove("show");
      document.querySelector(".landing").style.display = "";
      setBusy(false);
    }
  });
}

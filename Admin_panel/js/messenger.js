// admin-panel/js/messenger.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const logoutBtn = document.getElementById("logoutBtn");
const statusEl = document.getElementById("messengerStatus");
const threadListEl = document.getElementById("messengerThreadList");
const conversationEl = document.getElementById("messengerConversation");
const headerEl = document.getElementById("messengerHeader");
const replyForm = document.getElementById("messengerReplyForm");
const replyInput = document.getElementById("messengerReplyInput");
const searchInput = document.getElementById("messengerSearch");
const unreadBadge = document.getElementById("messengerUnreadBadge");
const totalThreadsStat = document.getElementById("messengerTotalValue");
const awaitingThreadsStat = document.getElementById("messengerAwaitingValue");

let unsubscribeChat = null;
let initialSnapshotComplete = false;
let currentThreads = [];
let activeThreadKey = null;
let unsubscribeUsers = null;
const verifiedPresence = new Map();
const ONLINE_THRESHOLD_MS = 120000;

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } finally {
      window.location.href = "index.html";
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  startMessenger();
});

function startMessenger() {
  if (unsubscribeChat) return;
  setStatus("Connecting to live chat...", "warning");
  const q = query(collection(db, "liveChat"), orderBy("createdAt", "asc"));
  unsubscribeChat = onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
    currentThreads = buildThreadsFromMessages(items);
    renderThreadList(currentThreads);
    refreshUnreadBadge(currentThreads);

    if (!currentThreads.length) {
      setConversationPlaceholder();
    }

    if (activeThreadKey) {
      const activeThread = currentThreads.find((t) => t.key === activeThreadKey);
      if (activeThread) {
        renderConversation(activeThread, { autoScroll: true });
      } else {
        activeThreadKey = null;
        setConversationPlaceholder();
      }
    } else if (currentThreads.length) {
      setActiveThread(currentThreads[0].key);
    }

    if (!initialSnapshotComplete) {
      initialSnapshotComplete = true;
      clearStatus();
    }
  }, (err) => {
    console.error("Messenger snapshot failed", err);
    setStatus("Unable to load conversations. Please refresh the page.", "danger");
  });
  listenToVerifiedUsers();
}

function renderThreadList(threads) {
  if (!threadListEl) return;
  const totalThreads = threads.length;
  const awaitingThreads = threads.reduce((count, thread) => count + (thread.unread ? 1 : 0), 0);
  updateThreadStats(totalThreads, awaitingThreads);
  if (!threads.length) {
    threadListEl.innerHTML = '<div class="text-center text-muted py-5 small">No conversations yet.</div>';
    return;
  }

  const searchTerm = (searchInput && searchInput.value ? searchInput.value : "").trim().toLowerCase();

  const rows = threads.map((thread) => {
    const lastMessage = thread.messages[thread.messages.length - 1] || {};
    const preview = truncateText(lastMessage.text || "", 90);
    const timestamp = resolveTimestamp(lastMessage.createdAt);
    const lastLabel = timestamp ? formatRelativeTime(timestamp) : "";
    const displayName = resolveThreadName(thread);
    const unreadBadgeMarkup = thread.unread ? `<span class="badge bg-danger ms-2">${thread.unread}</span>` : "";
    const isActive = activeThreadKey === thread.key;
    const presenceMarkup = buildThreadPresenceMarkup(thread);

    return `
      <button type="button"
        class="messenger-thread list-group-item list-group-item-action${isActive ? " active" : ""}"
        data-thread-key="${escapeHtml(thread.key)}"
        ${searchTerm && !matchesThreadSearch(thread, searchTerm) ? " hidden" : ""}
      >
        <div class="d-flex justify-content-between align-items-center">
          <div class="fw-semibold text-truncate">${escapeHtml(displayName)}${unreadBadgeMarkup}</div>
          <span class="messenger-thread-time small text-muted">${escapeHtml(lastLabel)}</span>
        </div>
        <div class="small text-muted text-truncate mt-1">${escapeHtml(preview)}</div>
        ${presenceMarkup ? `<div class="messenger-thread-presence">${presenceMarkup}</div>` : ""}
      </button>
    `;
  }).join("");

  threadListEl.innerHTML = `<div class="list-group list-group-flush messenger-thread-group">${rows}</div>`;

  threadListEl.querySelectorAll("[data-thread-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveThread(btn.getAttribute("data-thread-key"));
    });
  });
}

function matchesThreadSearch(thread, term) {
  const haystack = [
    resolveThreadName(thread),
    thread.phone || "",
    thread.email || "",
    thread.uid || "",
    (thread.messages[thread.messages.length - 1] || {}).text || ""
  ].join(" ").toLowerCase();
  return haystack.includes(term);
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderThreadList(currentThreads);
  });
}

function setActiveThread(threadKey) {
  activeThreadKey = threadKey;
  const thread = currentThreads.find((t) => t.key === threadKey);
  if (!thread) {
    setConversationPlaceholder();
    return;
  }
  renderThreadList(currentThreads);
  renderConversation(thread, { autoScroll: true, markRead: true });
}

function renderConversation(thread, { autoScroll = false, markRead = false } = {}) {
  if (!conversationEl || !headerEl) return;

  headerEl.classList.remove("empty");
  const displayName = resolveThreadName(thread);
  const metaParts = [];
  if (thread.email) metaParts.push(`<a href="mailto:${encodeURIComponent(thread.email)}" class="text-decoration-none">${escapeHtml(thread.email)}</a>`);
  if (thread.phone) metaParts.push(`<a href="tel:${encodeURIComponent(thread.phone)}" class="text-decoration-none">${escapeHtml(thread.phone)}</a>`);
  const presenceMarkup = buildConversationPresenceMarkup(thread);
  headerEl.innerHTML = `
    <div>
      <h5 class="mb-1">${escapeHtml(displayName)}</h5>
      <div class="messenger-header-meta small text-muted">${metaParts.join("<span class=\"dot\">•</span>") || "No contact details provided"}</div>
      ${presenceMarkup ? `<div class="messenger-header-presence small">${presenceMarkup}</div>` : ""}
    </div>
  `;

  if (!thread.messages.length) {
    conversationEl.innerHTML = `
      <div class="messenger-conversation-placeholder">
        <span class="placeholder-icon" aria-hidden="true">✉️</span>
        <h6 class="mb-1">No messages yet</h6>
        <p class="text-muted mb-0">Send the first reply to kick off this conversation.</p>
      </div>
    `;
  } else {
    let lastDayLabel = "";
    const rows = [];
    thread.messages.forEach((message) => {
      const isAdmin = !!message.fromAdmin;
      const authorName = message.name || thread.name || "Guest";
      const displayLabel = isAdmin ? "You" : authorName;
      const avatarLabel = isAdmin ? (message.name || "Admin") : authorName;
      const stamp = resolveTimestamp(message.createdAt);
      const dayLabel = formatDayLabel(stamp);
      if (dayLabel && dayLabel !== lastDayLabel) {
        rows.push(`<div class="messenger-day-divider"><span>${escapeHtml(dayLabel)}</span></div>`);
        lastDayLabel = dayLabel;
      }
      const timeLabel = formatBubbleTime(stamp);
      const rowClass = `messenger-bubble-row ${isAdmin ? "admin" : "visitor"}`;
      const bubbleClass = `messenger-bubble ${isAdmin ? "admin" : "visitor"}`;
      rows.push(`
        <div class="${rowClass}">
          <div class="bubble-avatar" aria-hidden="true">${escapeHtml(extractInitial(avatarLabel || displayLabel))}</div>
          <div class="bubble-inner">
            <div class="messenger-bubble-meta">
              <span class="bubble-author">${escapeHtml(displayLabel)}</span>
              ${timeLabel ? `<span class="dot">•</span><span>${escapeHtml(timeLabel)}</span>` : ""}
            </div>
            <div class="${bubbleClass}">
              <div class="messenger-bubble-body">${escapeHtml(message.text || "")}</div>
            </div>
          </div>
        </div>
      `);
    });
    conversationEl.innerHTML = rows.join("");
  }

  if (autoScroll) {
    requestAnimationFrame(() => {
      conversationEl.scrollTop = conversationEl.scrollHeight;
    });
  }

  if (markRead) {
    markThreadMessagesRead(thread).catch((err) => {
      console.error("Failed to mark messages read", err);
    });
  }
}

async function markThreadMessagesRead(thread) {
  const unread = thread.messages.filter((msg) => !msg.fromAdmin && !msg.read);
  if (!unread.length) return;
  for (const msg of unread) {
    try {
      await updateDoc(doc(db, "liveChat", msg.id), { read: true });
    } catch (err) {
      console.error("mark read failed", msg.id, err);
    }
  }
}

function setConversationPlaceholder() {
  if (!conversationEl || !headerEl) return;
  headerEl.classList.add("empty");
  headerEl.innerHTML = `
    <div>
      <h5 class="mb-1">Select a conversation</h5>
      <p class="mb-0 text-muted small">Choose a visitor on the left to review their messages and reply.</p>
    </div>
  `;
  conversationEl.innerHTML = `
    <div class="messenger-conversation-placeholder">
      <span class="placeholder-icon" aria-hidden="true">💬</span>
      <h6 class="mb-1">No conversation selected</h6>
      <p class="text-muted mb-0">Choose a visitor on the left to review their messages and reply.</p>
    </div>
  `;
}

if (replyForm) {
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const thread = currentThreads.find((t) => t.key === activeThreadKey);
    if (!thread) return;
    const text = (replyInput.value || "").trim();
    if (!text) return;

    const submitBtn = replyForm.querySelector("button[type=submit]");
    if (submitBtn) submitBtn.disabled = true;

    const lastUserMessage = [...thread.messages].reverse().find((msg) => !msg.fromAdmin);
    const payload = {
      text,
      fromAdmin: true,
      createdAt: serverTimestamp(),
      uid: auth.currentUser ? `admin:${auth.currentUser.uid}` : "admin",
      replyTo: lastUserMessage ? lastUserMessage.id : null,
      threadId: thread.threadId || (lastUserMessage ? lastUserMessage.threadId || lastUserMessage.uid || null : null),
      name: auth.currentUser && auth.currentUser.displayName ? auth.currentUser.displayName : "Admin",
      email: auth.currentUser ? auth.currentUser.email || null : null
    };

    try {
      await addDoc(collection(db, "liveChat"), payload);
      replyInput.value = "";
      if (conversationEl) {
        requestAnimationFrame(() => {
          conversationEl.scrollTop = conversationEl.scrollHeight;
        });
      }
    } catch (err) {
      console.error("Reply failed", err);
      setStatus(`Failed to send reply: ${escapeHtml(err.message || "")}`, "danger");
      setTimeout(clearStatus, 4000);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function refreshUnreadBadge(threads) {
  if (!unreadBadge) return;
  const total = threads.reduce((sum, thread) => sum + (thread.unread || 0), 0);
  if (!total) {
    unreadBadge.classList.add("d-none");
    unreadBadge.textContent = "0";
    return;
  }
  unreadBadge.classList.remove("d-none");
  unreadBadge.textContent = String(total > 99 ? "99+" : total);
}

function resolveThreadName(thread) {
  if (thread.name) return thread.name;
  if (thread.email) return thread.email;
  if (thread.phone) return thread.phone;
  if (thread.threadId) return `Thread ${thread.threadId}`;
  if (thread.key && thread.key.startsWith("uid:")) return thread.key.slice(4);
  return "Guest";
}

function buildThreadsFromMessages(items) {
  const msgMeta = {};

  items.forEach((msg) => {
    if (msg.threadId) {
      msgMeta[msg.id] = {
        key: `thread:${msg.threadId}`,
        threadId: msg.threadId,
        uid: !isAdminUid(msg.uid) ? msg.threadId : null,
        name: msg.name || null,
        phone: msg.phone || null,
        email: msg.email || null
      };
      return;
    }
    if (msg.uid && String(msg.uid).startsWith("admin:")) return;
    let key = null;
    if (msg.uid) key = `uid:${msg.uid}`;
    else if (msg.email) key = `email:${msg.email}`;
    else if (msg.phone) key = `phone:${msg.phone}`;
    else if (msg.name) key = `guest:${msg.name}`;
    else key = `anon:${msg.id}`;
    msgMeta[msg.id] = {
      key,
      threadId: msg.threadId || (!isAdminUid(msg.uid) ? msg.uid : null) || null,
      uid: !isAdminUid(msg.uid) ? msg.uid : null,
      name: msg.name || null,
      phone: msg.phone || null,
      email: msg.email || null
    };
  });

  items.forEach((msg) => {
    if (!(msg.uid && String(msg.uid).startsWith("admin:"))) return;
    if (msg.replyTo && msgMeta[msg.replyTo]) {
      msgMeta[msg.id] = { ...msgMeta[msg.replyTo] };
    } else if (msg.threadId) {
      msgMeta[msg.id] = { key: `thread:${msg.threadId}`, threadId: msg.threadId, uid: msg.threadId };
    } else {
      msgMeta[msg.id] = {
        key: msg.email ? `email:${msg.email}` : `anon:${msg.id}`,
        email: msg.email || null,
        uid: null
      };
    }
  });

  const threads = {};
  items.forEach((msg) => {
    const meta = msgMeta[msg.id] || { key: `anon:${msg.id}` };
    const key = meta.key;
    if (!threads[key]) {
      threads[key] = {
        key,
        threadId: meta.threadId || msg.threadId || null,
        uid: meta.uid || (!msg.fromAdmin && !isAdminUid(msg.uid) ? msg.uid : null) || null,
        name: meta.name || msg.name || null,
        phone: meta.phone || msg.phone || null,
        email: meta.email || msg.email || null,
        messages: [],
        lastAt: 0,
        unread: 0
      };
    }
    threads[key].messages.push(msg);
    const at = resolveTimestamp(msg.createdAt)
      ? resolveTimestamp(msg.createdAt).getTime()
      : Date.now();
    if (at > threads[key].lastAt) threads[key].lastAt = at;
    if (!threads[key].uid && meta.uid) {
      threads[key].uid = meta.uid;
    }
    if (!msg.fromAdmin && !msg.read) {
      threads[key].unread = (threads[key].unread || 0) + 1;
    }
  });

  Object.values(threads).forEach((thread) => {
    thread.messages.sort((a, b) => {
      const atA = resolveTimestamp(a.createdAt);
      const atB = resolveTimestamp(b.createdAt);
      const timeA = atA ? atA.getTime() : 0;
      const timeB = atB ? atB.getTime() : 0;
      return timeA - timeB;
    });
  });

  return Object.values(threads).sort((a, b) => b.lastAt - a.lastAt);
}

function resolveTimestamp(value) {
  if (!value) return null;
  try {
    return value.toDate ? value.toDate() : new Date(value);
  } catch (err) {
    return null;
  }
}

function formatRelativeTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Just now";
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

function formatTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function formatDayLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameYear = today.getFullYear() === date.getFullYear();
  const options = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString(undefined, options);
}

function formatBubbleTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function extractInitial(label) {
  if (!label) return "?";
  const str = String(label).trim();
  if (!str) return "?";
  const match = str.match(/[A-Za-z0-9]/);
  return (match ? match[0] : str[0]).toUpperCase();
}

function truncateText(str, maxLength) {
  const value = (str || "").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateThreadStats(total, awaiting) {
  if (totalThreadsStat) totalThreadsStat.textContent = formatStatValue(total);
  if (awaitingThreadsStat) awaitingThreadsStat.textContent = formatStatValue(awaiting);
}

function formatStatValue(value) {
  if (!Number.isFinite(value)) return "0";
  const safe = Math.max(0, Math.floor(value));
  if (safe > 999) return "999+";
  return String(safe);
}

function setStatus(message, tone = "warning") {
  if (!statusEl) return;
  if (!message) {
    clearStatus();
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.remove("d-none", "alert-warning", "alert-danger", "alert-success", "alert-info");
  statusEl.classList.add(`alert-${tone}`);
}

function clearStatus() {
  if (!statusEl) return;
  statusEl.textContent = "";
  statusEl.classList.add("d-none");
}

function listenToVerifiedUsers() {
  if (unsubscribeUsers) return;
  const usersQuery = query(collection(db, "users"), where("emailVerified", "==", true));
  unsubscribeUsers = onSnapshot(usersQuery, (snap) => {
    verifiedPresence.clear();
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      verifiedPresence.set(docSnap.id, {
        uid: docSnap.id,
        displayName: data.displayName || null,
        email: data.email || null,
        lastActiveAt: resolveTimestamp(data.lastActiveAt),
        isOnline: typeof data.isOnline === "boolean" ? data.isOnline : null
      });
    });
    renderThreadList(currentThreads);
    if (activeThreadKey) {
      const thread = currentThreads.find((t) => t.key === activeThreadKey);
      if (thread) {
        renderConversation(thread, { autoScroll: false, markRead: false });
      }
    }
  }, (err) => {
    console.error("users snapshot failed", err);
  });
}

function getThreadPresence(thread) {
  if (!thread) return null;
  const candidateUid = thread.uid || thread.threadId || null;
  if (!candidateUid) return null;
  return verifiedPresence.get(String(candidateUid));
}

function getPresenceStatus(presence) {
  if (!presence) return null;
  const lastActive = presence.lastActiveAt ? presence.lastActiveAt.getTime() : 0;
  const now = Date.now();
  const computedOnline = lastActive && (now - lastActive) <= ONLINE_THRESHOLD_MS;
  const hasRealtimeFlag = typeof presence.isOnline === "boolean";
  const isOnline = hasRealtimeFlag ? presence.isOnline : !!computedOnline;
  const label = isOnline ? "Online" : "Offline";
  const className = isOnline ? "bg-success-subtle text-success" : "bg-secondary";
  const lastSeenLabel = presence.lastActiveAt
    ? (isOnline ? "Active now" : `Last active ${formatRelativeTime(presence.lastActiveAt)}`)
    : "";
  return { isOnline, label, className, lastSeenLabel };
}

function buildThreadPresenceMarkup(thread) {
  const presence = getThreadPresence(thread);
  const uidValue = thread && (thread.uid || thread.threadId || (presence && presence.uid)) || null;
  const uidLabel = escapeHtml(uidValue || "");
  if (!uidLabel) return "";
  if (!presence) {
    return `UID: <code>${uidLabel}</code>`;
  }
  const status = getPresenceStatus(presence);
  if (!status) {
    return `UID: <code>${uidLabel}</code>`;
  }
  const lastSeen = status.lastSeenLabel ? `<span class="text-muted">${escapeHtml(status.lastSeenLabel)}</span>` : "";
  return `UID: <code>${uidLabel}</code> <span class="badge ${status.className}">${escapeHtml(status.label)}</span>${lastSeen ? ` ${lastSeen}` : ""}`;
}

function buildConversationPresenceMarkup(thread) {
  const presence = getThreadPresence(thread);
  const uidValue = thread && (thread.uid || thread.threadId || (presence && presence.uid)) || null;
  const uidLabel = escapeHtml(uidValue || "");
  if (!uidLabel) return "";
  if (!presence) {
    return `User ID: <code>${uidLabel}</code>`;
  }
  const status = getPresenceStatus(presence);
  if (!status) {
    return `User ID: <code>${uidLabel}</code>`;
  }
  const lastSeen = status.lastSeenLabel ? `<span class="text-muted">${escapeHtml(status.lastSeenLabel)}</span>` : "";
  return `User ID: <code>${uidLabel}</code> <span class="badge ${status.className}">${escapeHtml(status.label)}</span>${lastSeen ? ` ${lastSeen}` : ""}`;
}

function isAdminUid(uid) {
  if (!uid) return false;
  return String(uid).startsWith("admin:");
}

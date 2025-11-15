// admin-panel/js/notifications.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs, limit, orderBy, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const logoutBtn = document.getElementById("logoutBtn");
const statusEl = document.getElementById("notificationStatus");
const listEl = document.getElementById("notificationsList");
const filterSelect = document.getElementById("notificationFilter");
const refreshBtn = document.getElementById("refreshNotificationsBtn");
const summaryCountEl = document.getElementById("notificationSummaryCount");
const lastUpdatedEl = document.getElementById("notificationLastUpdated");

const MAX_ITEMS_PER_FEED = 25;
const state = {
  items: [],
  filter: "all"
};

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

if (filterSelect) {
  filterSelect.addEventListener("change", () => {
    state.filter = filterSelect.value || "all";
    renderList();
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    loadNotifications();
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  await loadNotifications();
});

async function loadNotifications() {
  setStatus("Loading notifications...", "info");
  if (listEl) {
    listEl.innerHTML = '<div class="list-group-item text-muted">Loading notifications...</div>';
  }

  try {
    const bookingsRef = collection(db, "bookings");
    const contactsRef = collection(db, "contacts");

    const [bookingsSnap, contactsSnap] = await Promise.all([
      getDocs(query(bookingsRef, orderBy("createdAt", "desc"), limit(MAX_ITEMS_PER_FEED))),
      getDocs(query(contactsRef, orderBy("createdAt", "desc"), limit(MAX_ITEMS_PER_FEED)))
    ]);

    const bookingItems = bookingsSnap.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const createdAt = resolveTimestamp(data.createdAt);
      return {
        id: docSnap.id,
        type: "booking",
        title: `${data.name || "Guest"} requested ${data.venueTitle || "a venue"}`,
        status: (data.status || "pending").toLowerCase(),
        eventDate: data.date || "",
        email: data.email || "",
        createdAt,
        createdAtMs: createdAt ? createdAt.getTime() : 0
      };
    });

    const contactItems = contactsSnap.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const createdAt = resolveTimestamp(data.createdAt);
      return {
        id: docSnap.id,
        type: "contact",
        title: `${data.name || "Visitor"} sent an enquiry`,
        message: data.subject || data.message || "No subject provided",
        email: data.email || "",
        createdAt,
        createdAtMs: createdAt ? createdAt.getTime() : 0
      };
    });

    state.items = [...bookingItems, ...contactItems].sort((a, b) => b.createdAtMs - a.createdAtMs);
    renderList();
    updateSummary();
    updateLastUpdated();
    setStatus("", "info");
  } catch (error) {
    console.error("Failed to load notifications", error);
    setStatus(`Unable to load notifications. ${error.message}`, "danger");
    if (listEl) {
      listEl.innerHTML = '<div class="list-group-item text-danger">Failed to load notifications.</div>';
    }
  }
}

function renderList() {
  if (!listEl) return;
  const activeFilter = state.filter || "all";
  const filteredItems = state.items.filter((item) => activeFilter === "all" || item.type === activeFilter);

  if (!filteredItems.length) {
    const label = activeFilter === "booking" ? "booking updates" : activeFilter === "contact" ? "enquiries" : "notifications";
    listEl.innerHTML = `<div class="list-group-item text-muted text-center">No ${escapeHtml(label)} yet.</div>`;
    return;
  }

  listEl.innerHTML = filteredItems
    .map((item) => {
      const relative = item.createdAt ? formatRelativeTime(item.createdAt) : "Time unknown";
      const exact = item.createdAt ? formatDateTime(item.createdAt) : "";
      const metaParts = [relative];
      if (item.type === "booking" && item.eventDate) {
        metaParts.push(`Event date: ${escapeHtml(formatEventDate(item.eventDate))}`);
      }
      if (item.email) {
        metaParts.push(`Email: ${escapeHtml(item.email)}`);
      }
      const metaLine = metaParts.join(" • ");
      const badgeMarkup = buildBadge(item);
      const detailsMarkup = item.type === "contact"
        ? `<div class="small text-secondary mt-1">${escapeHtml(truncateText(item.message || "", 140))}</div>`
        : "";

      return `
        <div class="list-group-item d-flex justify-content-between align-items-start">
          <div class="me-3">
            <div class="fw-semibold">${escapeHtml(item.title)}</div>
            <div class="small text-muted" title="${escapeHtml(exact)}">${metaLine}</div>
            ${detailsMarkup}
          </div>
          <div class="ms-auto">${badgeMarkup}</div>
        </div>
      `;
    })
    .join("");
}

function buildBadge(item) {
  if (item.type === "booking") {
    const meta = getBookingStatusMeta(item.status);
    return `<span class="badge ${meta.badgeClass}">${escapeHtml(meta.label)}</span>`;
  }
  return '<span class="badge bg-primary">Enquiry</span>';
}

function updateSummary() {
  if (!summaryCountEl) return;
  summaryCountEl.textContent = state.items.length.toString();
}

function updateLastUpdated() {
  if (!lastUpdatedEl) return;
  const now = new Date();
  lastUpdatedEl.textContent = `Updated ${formatRelativeTime(now)} (${now.toLocaleString()})`;
}

function setStatus(message, tone) {
  if (!statusEl) return;
  statusEl.className = "alert d-none";
  if (!message) return;
  statusEl.textContent = message;
  statusEl.classList.remove("d-none");
  const map = { info: "alert-info", danger: "alert-danger", success: "alert-success", warning: "alert-warning" };
  statusEl.classList.add(map[tone] || "alert-info");
}

function getBookingStatusMeta(status) {
  const normalised = (status || "pending").toLowerCase();
  if (normalised === "accepted") return { label: "Accepted", badgeClass: "bg-success" };
  if (normalised === "rejected") return { label: "Rejected", badgeClass: "bg-danger" };
  return { label: "Pending", badgeClass: "bg-secondary" };
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
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (!Number.isFinite(diffMs)) return "";
  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 45) return "Just now";
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

function formatDateTime(date) {
  try {
    return date.toLocaleString();
  } catch (err) {
    return "";
  }
}

function formatEventDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function truncateText(str, maxLength) {
  if (!str) return "";
  const clean = String(str).trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3)}...`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

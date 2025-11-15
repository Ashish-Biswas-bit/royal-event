// admin-panel/js/dashboard.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs, limit, orderBy, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

const dashboardStatus = document.getElementById("dashboardStatus");
const venueCountEl = document.getElementById("venueCount");
const bookingCountEl = document.getElementById("bookingCount");
const portfolioCountEl = document.getElementById("portfolioCount");
const memberCountEl = document.getElementById("memberCount");
const bookingPendingCountEl = document.getElementById("bookingPendingCount");
const bookingAcceptedCountEl = document.getElementById("bookingAcceptedCount");
const bookingRejectedCountEl = document.getElementById("bookingRejectedCount");
const recentBookingsBody = document.getElementById("recentBookingsBody");
const recentContactsBody = document.getElementById("recentContactsBody");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  await loadDashboardData();
});

async function loadDashboardData() {
  setStatus("Loading latest data...", "muted");

  try {
    const bookingsCollection = collection(db, "bookings");
    const contactsCollection = collection(db, "contacts");

    const [
      venuesSnap,
      bookingsSnap,
      portfolioSnap,
      membersSnap,
      recentBookingsSnap,
      recentContactsSnap
    ] = await Promise.all([
      getDocs(collection(db, "venues")),
      getDocs(bookingsCollection),
      getDocs(collection(db, "portfolio")),
      getDocs(collection(db, "teamMembers")),
      getDocs(query(bookingsCollection, orderBy("createdAt", "desc"), limit(5))),
      getDocs(query(contactsCollection, orderBy("createdAt", "desc"), limit(5)))
    ]);

    setCount(venueCountEl, venuesSnap.size);
    setCount(bookingCountEl, bookingsSnap.size);
    setCount(portfolioCountEl, portfolioSnap.size);
    setCount(memberCountEl, membersSnap.size);

    const bookingTotals = summariseBookingStatuses(bookingsSnap.docs);
    setCount(bookingPendingCountEl, bookingTotals.pending);
    setCount(bookingAcceptedCountEl, bookingTotals.accepted);
    setCount(bookingRejectedCountEl, bookingTotals.rejected);

    const recentBookings = recentBookingsSnap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: data.name || "Guest",
        email: data.email || "",
        venueTitle: data.venueTitle || "N/A",
        date: data.date || "",
        status: data.status || "pending",
        createdAt: data.createdAt
      };
    });
    renderRecentBookings(recentBookings);

    const recentContacts = recentContactsSnap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: data.name || "Visitor",
        email: data.email || "",
        subject: data.subject || data.message || "General enquiry",
        createdAt: data.createdAt
      };
    });
    renderRecentContacts(recentContacts);

    if (!venuesSnap.size && !bookingsSnap.size && !portfolioSnap.size && !membersSnap.size) {
      setStatus("No data found yet - start by adding a venue or recording a booking.", "warning");
    } else {
      setStatus("");
    }
  } catch (error) {
    console.error("Failed to load dashboard data", error);
    setStatus(`Unable to load dashboard data. ${error.message}`, "danger");
    renderRecentBookings([]);
    renderRecentContacts([]);
  }
}

function summariseBookingStatuses(docs) {
  return docs.reduce(
    (acc, doc) => {
      const data = doc.data() || {};
      const status = (data.status || "pending").toLowerCase();
      if (status === "accepted") acc.accepted += 1;
      else if (status === "rejected") acc.rejected += 1;
      else acc.pending += 1;
      return acc;
    },
    { pending: 0, accepted: 0, rejected: 0 }
  );
}

function renderRecentBookings(items) {
  if (!recentBookingsBody) return;
  if (!items.length) {
    recentBookingsBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No bookings yet.</td></tr>';
    return;
  }

  recentBookingsBody.innerHTML = items
    .map((item) => {
      const statusMeta = getStatusMeta(item.status);
      const createdLabel = formatDateTime(item.createdAt);
      return `
        <tr>
          <td>
            <div class="fw-semibold">${escapeHtml(item.name)}</div>
            ${item.email ? `<div class="small text-muted">${escapeHtml(item.email)}</div>` : ""}
          </td>
          <td>${escapeHtml(item.venueTitle)}</td>
          <td>${formatEventDate(item.date)}</td>
          <td><span class="badge ${statusMeta.badgeClass}">${statusMeta.label}</span></td>
          <td>${createdLabel}</td>
        </tr>
      `;
    })
    .join("");
}

function renderRecentContacts(items) {
  if (!recentContactsBody) return;
  if (!items.length) {
    recentContactsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No enquiries yet.</td></tr>';
    return;
  }

  recentContactsBody.innerHTML = items
    .map((item) => {
      const createdLabel = formatDateTime(item.createdAt);
      const emailMarkup = item.email
        ? `<a href="mailto:${encodeURIComponent(item.email)}" class="text-decoration-none">${escapeHtml(item.email)}</a>`
        : "<span class=\"text-muted\">Not provided</span>";
      return `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${emailMarkup}</td>
          <td>${escapeHtml(truncateText(item.subject, 48))}</td>
          <td>${createdLabel}</td>
        </tr>
      `;
    })
    .join("");
}

function setCount(el, value) {
  if (!el) return;
  el.textContent = typeof value === "number" ? value.toString() : value || "0";
}

function setStatus(message, tone = "muted") {
  if (!dashboardStatus) return;
  dashboardStatus.classList.remove("d-none", "text-muted", "text-danger", "text-warning", "text-success");
  if (!message) {
    dashboardStatus.textContent = "";
    dashboardStatus.classList.add("d-none", "text-muted");
    return;
  }
  dashboardStatus.textContent = message;
  dashboardStatus.classList.add(`text-${tone}`);
}

function getStatusMeta(status) {
  const normalised = (status || "pending").toLowerCase();
  if (normalised === "accepted") return { label: "Accepted", badgeClass: "bg-success" };
  if (normalised === "rejected") return { label: "Rejected", badgeClass: "bg-danger" };
  return { label: "Pending", badgeClass: "bg-secondary" };
}

function formatEventDate(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return escapeHtml(parsed.toLocaleDateString());
  }
  return escapeHtml(String(value));
}

function formatDateTime(timestamp) {
  if (!timestamp) return "N/A";
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "N/A";
    return escapeHtml(date.toLocaleString());
  } catch (_) {
    return "N/A";
  }
}

function truncateText(str, maxLength) {
  if (!str) return "N/A";
  const clean = String(str).trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}...`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

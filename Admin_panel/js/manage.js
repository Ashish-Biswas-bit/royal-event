// admin-panel/js/manage.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadFileList, uploadImageToCloudinary } from "./cloudinary.js";
import { sendBookingStatusEmail } from "./email.js";

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

const notificationDropdownEl = document.getElementById('adminNotificationDropdown');
const notificationListEl = document.getElementById('adminNotificationList');
const notificationBadgeEl = document.getElementById('adminNotificationBadge');

const adminNotifications = [];
const MAX_ADMIN_NOTIFICATIONS = 20;

let liveChatInitialLoadComplete = false;

let bookingsUnsubscribe = null;
let bookingsData = [];
let bookingsInitialLoadComplete = false;
let contactsUnsubscribe = null;
let contactsInitialLoadComplete = false;

if (notificationListEl) {
  notificationListEl.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-notification-remove]');
    if (!removeBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const notificationId = removeBtn.getAttribute('data-notification-remove');
    removeAdminNotification(notificationId);
  });
}

refreshAdminNotifications();

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "index.html");
  await loadAll();
});

async function loadAll() {
  await loadCollection("venues", renderVenues);
  await loadCollection("portfolio", renderPortfolio);
  await loadCollection("teamMembers", renderMembers);
  await loadCollection("users", renderUsers);
  initBookingsListener();
  initContactsListener();
  // start live chat listener
  initLiveChat();
}

function initBookingsListener(){
  if (bookingsUnsubscribe) return;
  const bookingsQuery = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
  bookingsUnsubscribe = onSnapshot(bookingsQuery, (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));

    if (bookingsInitialLoadComplete) {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
          const payload = change.doc.data() || {};
          notifyNewBooking({ id: change.doc.id, ...payload });
          addAdminNotification({
            type: 'booking',
            title: `${payload.name || 'Guest'} requested ${payload.venueTitle || 'a venue'}`,
            description: payload.date ? `Event date: ${payload.date}` : 'Review this booking request.',
            createdAt: resolveTimestamp(payload.createdAt)
          });
        }
      });
    }

    bookingsData = items;
    renderBookings(items);
    if (!bookingsInitialLoadComplete) {
      bookingsInitialLoadComplete = true;
    }
  }, (err) => console.error('bookings snapshot failed', err));
}

function initContactsListener(){
  if (contactsUnsubscribe) return;
  const contactsQuery = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
  contactsUnsubscribe = onSnapshot(contactsQuery, (snap) => {
    const items = [];
    snap.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));

    if (contactsInitialLoadComplete) {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
          const payload = change.doc.data() || {};
          notifyNewEnquiry({ id: change.doc.id, ...payload });
          addAdminNotification({
            type: 'enquiry',
            title: `${payload.name || 'Visitor'} sent a new enquiry`,
            description: truncateText(payload.message || payload.subject || '', 90),
            createdAt: resolveTimestamp(payload.createdAt)
          });
        }
      });
    }

    renderContacts(items);
    if (!contactsInitialLoadComplete) {
      contactsInitialLoadComplete = true;
    }
  }, (err) => console.error('contacts snapshot failed', err));
}

function initLiveChat(){
  const inboxEl = document.getElementById('chatInbox');
  const threadEl = document.getElementById('chatThread');
  if (!inboxEl || !threadEl) return;
  const q = query(collection(db,'liveChat'), orderBy('createdAt','asc'));
  onSnapshot(q, (snap) => {
    if (liveChatInitialLoadComplete) {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
          const data = change.doc.data() || {};
          if (!data.fromAdmin) {
            notifyNewChatMessage({ id: change.doc.id, ...data });
            addAdminNotification({
              type: 'message',
              title: `${data.name || data.email || 'Guest'} sent a new message`,
              description: truncateText(data.text || '', 90),
              createdAt: resolveTimestamp(data.createdAt)
            });
          }
        }
      });
    }
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    // build threads and render inbox
    const threads = buildThreadsFromMessages(rows);
    renderInbox(threads);
    // update global unread badge
    const totalUnread = threads.reduce((s,t) => s + (t.unread||0), 0);
    updateLiveChatBadge(totalUnread);
    // if a thread is currently open, refresh it
    const opened = inboxEl.querySelector('.list-group-item.active');
    if (opened && opened.dataset && opened.dataset.threadKey) {
      showThread(opened.dataset.threadKey, threads);
    }
    if (!liveChatInitialLoadComplete) {
      liveChatInitialLoadComplete = true;
    }
  }, (err) => console.error('liveChat snapshot failed', err));
  // nav button to jump to chat tab
  const liveNav = document.getElementById('liveChatNav');
  if (liveNav) {
    liveNav.addEventListener('click', (ev) => {
      ev.preventDefault();
      const tabBtn = document.getElementById('livechat-tab');
      if (tabBtn) tabBtn.click();
    });
  }
}

function updateLiveChatBadge(count){
  const el = document.getElementById('liveChatBadge');
  if (!el) return;
  if (!count) {
    el.style.display = 'none';
    el.textContent = '0';
  } else {
    el.style.display = '';
    el.textContent = String(count);
  }
}
function buildThreadsFromMessages(items){
  // items: [{id, uid, name, phone, fromAdmin, replyTo, read, text, createdAt}, ...]
  const byId = {};
  items.forEach(m => byId[m.id] = { ...m });

  // preliminary userKey assignment for non-admin messages
  const msgMeta = {};
  items.forEach(m => {
    // Prefer explicit threadId when available
    if (m.threadId) {
      const key = `thread:${m.threadId}`;
      msgMeta[m.id] = { key, threadId: m.threadId, name: m.name||null, phone: m.phone||null };
      return;
    }
    if (m.uid && String(m.uid).startsWith('admin:')) return; // skip admin for now
    let key = null;
    if (m.uid) key = `uid:${m.uid}`;
    else if (m.name || m.phone) key = `guest:${(m.name||'').trim()}|${(m.phone||'').trim()}`;
    else key = `anon:${m.id}`;
    msgMeta[m.id] = { key, name: m.name||null, phone: m.phone||null };
  });

  // assign admin messages to threads via replyTo when possible
  items.forEach(m => {
    if (!(m.uid && String(m.uid).startsWith('admin:'))) return;
    if (m.replyTo && msgMeta[m.replyTo]) {
      msgMeta[m.id] = { key: msgMeta[m.replyTo].key };
    } else if (m.threadId) {
      msgMeta[m.id] = { key: `thread:${m.threadId}`, threadId: m.threadId };
    } else if (m.name || m.phone) {
      msgMeta[m.id] = { key: `guest:${(m.name||'').trim()}|${(m.phone||'').trim()}` };
    } else {
      msgMeta[m.id] = { key: `anon:${m.id}` };
    }
  });

  // build threads map
  const threads = {}; // key -> { key, name, phone, messages: [], lastAt, unread }
  items.forEach(m => {
    const meta = msgMeta[m.id] || { key: `anon:${m.id}` };
    const key = meta.key;
    if (!threads[key]) threads[key] = { key, threadId: meta.threadId || null, name: meta.name || m.name || null, phone: meta.phone || m.phone || null, messages: [], lastAt: 0, unread: 0 };
    threads[key].messages.push(m);
    const at = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().getTime() : Date.now();
    if (at > threads[key].lastAt) threads[key].lastAt = at;
    if (!m.fromAdmin && !m.read) threads[key].unread = (threads[key].unread||0) + 1;
  });

  // sort messages within each thread
  Object.values(threads).forEach(t => t.messages.sort((a,b)=>{
    const aa = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
    const bb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
    return aa - bb;
  }));

  return Object.values(threads).sort((a,b)=> b.lastAt - a.lastAt);
}

function renderInbox(threads){
  const inbox = document.getElementById('chatInbox');
  if (!inbox) return;
  if (!threads.length) { inbox.innerHTML = '<p class="text-muted">No chats yet.</p>'; return; }
  const rows = threads.map(t => {
    const last = t.messages[t.messages.length-1];
    const preview = escapeHtml((last && last.text) ? String(last.text).slice(0,80) : '');
    const name = t.name || (t.key && t.key.startsWith('uid:') ? t.key.slice(4) : 'Guest');
    const time = last && last.createdAt && last.createdAt.toDate ? new Date(last.createdAt.toDate()).toLocaleString() : '';
    const unreadBadge = t.unread ? `<span class="badge bg-danger ms-2">${t.unread}</span>` : '';
    return `<a href="#" class="list-group-item list-group-item-action d-flex justify-content-between align-items-start" data-thread-key="${escapeHtml(t.key)}">
      <div>
        <div class="fw-bold">${escapeHtml(name)} ${unreadBadge}</div>
        <div class="small text-muted">${escapeHtml(time)}</div>
        <div class="small text-truncate">${preview}</div>
      </div>
    </a>`;
  }).join('\n');
  inbox.innerHTML = `<div class="list-group">${rows}</div>`;

  // wire click handlers for thread items
  inbox.querySelectorAll('[data-thread-key]').forEach(a => a.addEventListener('click', (ev)=>{
    ev.preventDefault();
    // remove active from others
    inbox.querySelectorAll('.list-group-item').forEach(i=>i.classList.remove('active'));
    a.classList.add('active');
    const key = a.dataset.threadKey;
    showThread(key, threads);
  }));

  // wire search
  const search = document.getElementById('chatSearch');
  if (search) {
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      const list = inbox.querySelectorAll('.list-group-item');
      list.forEach(li => {
        const txt = li.textContent.toLowerCase();
        li.style.display = txt.includes(q) ? '' : 'none';
      });
    };
  }
}

async function showThread(threadKey, threads){
  const threadEl = document.getElementById('chatThread');
  const header = document.getElementById('chatThreadHeader');
  if (!threadEl || !header) return;
  const thread = threads.find(t => t.key === threadKey);
  if (!thread) { threadEl.innerHTML = '<p class="text-muted">Thread not found.</p>'; return; }
  header.innerHTML = `<h5>${escapeHtml(thread.name || thread.key)}</h5><div class="small text-muted">${escapeHtml(thread.phone||'')}</div>`;
  threadEl.innerHTML = thread.messages.map(m => {
    const who = m.fromAdmin ? '<strong>Admin</strong>' : escapeHtml(m.name || (m.uid || 'Guest'));
    const time = m.createdAt && m.createdAt.toDate ? new Date(m.createdAt.toDate()).toLocaleString() : '';
    const cls = m.fromAdmin ? 'text-end text-primary' : '';
    return `<div class="mb-2 ${cls}"><div class="small text-muted">${who} • ${escapeHtml(time)}</div><div class="p-2 bg-white rounded mt-1">${escapeHtml(m.text||'')}</div></div>`;
  }).join('');

  // mark unread user messages as read
  const unreadMsgs = thread.messages.filter(m => !m.fromAdmin && !m.read);
  for (const m of unreadMsgs) {
    try {
      await updateDoc(doc(db,'liveChat', m.id), { read: true });
    } catch (err) {
      console.error('Failed to mark message read', m.id, err);
    }
  }

  // wire reply form
  const replyForm = document.getElementById('adminReplyForm');
  const replyInput = document.getElementById('adminReplyInput');
  replyForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = (replyInput.value || '').trim();
    if (!text) return;
    // replyTo: last non-admin message id if present
    const lastUserMsg = [...thread.messages].reverse().find(mm => !mm.fromAdmin);
    try {
      await addDoc(collection(db,'liveChat'), {
        text,
        uid: `admin:${auth.currentUser ? auth.currentUser.uid : 'admin'}`,
        fromAdmin: true,
        createdAt: serverTimestamp(),
        replyTo: lastUserMsg ? lastUserMsg.id : null,
        threadId: thread.threadId || (lastUserMsg ? lastUserMsg.threadId : null) || null
      });
      replyInput.value = '';
    } catch (err) {
      console.error('Reply failed', err);
      alert('Reply failed: ' + err.message);
    }
  };
}

async function loadCollection(name, renderer) {
  const snap = await getDocs(collection(db, name));
  const items = [];
  snap.forEach(d => items.push({ id: d.id, ...d.data() }));
  renderer(items);
}

function renderVenues(items) {
  const container = document.getElementById("venuesList");
  if (!items.length) {
    container.innerHTML = '<p class="text-muted">No venues found.</p>';
    return;
  }
  const rows = items.map(i => `
    <div class="card mb-2">
      <div class="card-body d-flex justify-content-between align-items-center">
        <div>
          <h5>${escapeHtml(i.title || '')}</h5>
          <p class="mb-0">${escapeHtml(i.location || '')} • Budget: ${escapeHtml(String(i.budget || ''))}</p>
          <p class="mb-0 small text-muted">Created: ${escapeHtml(formatDate(i.createdAt) || '')}</p>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-collection="venues" data-id="${i.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-collection="venues" data-id="${i.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
  container.innerHTML = rows;
}

function renderPortfolio(items) {
  const container = document.getElementById("portfolioList");
  if (!items.length) {
    container.innerHTML = '<p class="text-muted">No portfolio items found.</p>';
    return;
  }
  const rows = items.map(i => `
    <div class="card mb-2">
      <div class="card-body d-flex justify-content-between align-items-center">
        <div>
          <h5>${escapeHtml(i.title || '')}</h5>
          <p class="mb-0">${escapeHtml(i.client || '')} • ${escapeHtml(i.category || '')}</p>
          <p class="mb-0 small text-muted">Created: ${escapeHtml(formatDate(i.createdAt) || '')}</p>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-collection="portfolio" data-id="${i.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-collection="portfolio" data-id="${i.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
  container.innerHTML = rows;
}

function renderMembers(items) {
  const container = document.getElementById("membersList");
  if (!items.length) {
    container.innerHTML = '<p class="text-muted">No members found.</p>';
    return;
  }
  const rows = items.map(i => `
    <div class="card mb-2">
      <div class="card-body d-flex justify-content-between align-items-center">
        <div>
          <h5>${escapeHtml(i.name || '')}</h5>
          <p class="mb-0">${escapeHtml(i.designation || '')}</p>
          ${i.phone || i.email ? `<p class="mb-0 small text-muted">${escapeHtml(i.phone || '')}${i.phone && i.email ? ' • ' : ''}${escapeHtml(i.email || '')}</p>` : ''}
          ${i.facebook || i.instagram ? `<p class="mb-0 small text-muted">${i.facebook ? '<span>Facebook</span>' : ''}${i.facebook && i.instagram ? ' • ' : ''}${i.instagram ? '<span>Instagram</span>' : ''}</p>` : ''}
          <p class="mb-0 small text-muted">Created: ${escapeHtml(formatDate(i.createdAt) || '')}</p>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-collection="teamMembers" data-id="${i.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-collection="teamMembers" data-id="${i.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
  container.innerHTML = rows;
}

function renderBookings(items) {
  const container = document.getElementById('bookingsList');
  if (!container) return;

  const groups = {
    pending: items.filter((entry) => (entry.status || 'pending').toLowerCase() === 'pending'),
    accepted: items.filter((entry) => (entry.status || 'pending').toLowerCase() === 'accepted'),
    rejected: items.filter((entry) => (entry.status || 'pending').toLowerCase() === 'rejected')
  };

  const counts = {
    all: items.length,
    pending: groups.pending.length,
    accepted: groups.accepted.length,
    rejected: groups.rejected.length
  };

  if (!container.dataset.initialized) {
    container.innerHTML = `
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body d-flex flex-wrap align-items-center gap-3">
          <div class="d-flex align-items-center gap-2">
            <span class="fw-semibold">Total</span>
            <span class="badge bg-primary" data-booking-count="all">0</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="fw-semibold text-secondary">Pending</span>
            <span class="badge bg-secondary-subtle text-secondary" data-booking-count="pending">0</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="fw-semibold text-success">Accepted</span>
            <span class="badge bg-success-subtle text-success" data-booking-count="accepted">0</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="fw-semibold text-danger">Rejected</span>
            <span class="badge bg-danger-subtle text-danger" data-booking-count="rejected">0</span>
          </div>
          <div class="text-muted small ms-auto">Update booking statuses anytime—entries move to the correct list immediately.</div>
        </div>
      </div>
      <div class="row g-3">
        <div class="col-lg-4 col-md-6">
          <div class="card shadow-sm h-100">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
              <h6 class="mb-0">Pending</h6>
              <span class="badge bg-secondary-subtle text-secondary" data-booking-count="pending">0</span>
            </div>
            <div class="card-body" id="bookingListPending"></div>
          </div>
        </div>
        <div class="col-lg-4 col-md-6">
          <div class="card shadow-sm h-100">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
              <h6 class="mb-0">Accepted</h6>
              <span class="badge bg-success-subtle text-success" data-booking-count="accepted">0</span>
            </div>
            <div class="card-body" id="bookingListAccepted"></div>
          </div>
        </div>
        <div class="col-lg-4 col-md-6">
          <div class="card shadow-sm h-100">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
              <h6 class="mb-0">Rejected</h6>
              <span class="badge bg-danger-subtle text-danger" data-booking-count="rejected">0</span>
            </div>
            <div class="card-body" id="bookingListRejected"></div>
          </div>
        </div>
      </div>
    `;
    container.dataset.initialized = 'true';
  }

  container.querySelectorAll('[data-booking-count]').forEach((badge) => {
    const key = badge.getAttribute('data-booking-count') || 'all';
    const total = counts[key] ?? 0;
    badge.textContent = String(total);
  });

  updateBookingGroup(container.querySelector('#bookingListPending'), groups.pending, 'pending');
  updateBookingGroup(container.querySelector('#bookingListAccepted'), groups.accepted, 'accepted');
  updateBookingGroup(container.querySelector('#bookingListRejected'), groups.rejected, 'rejected');
}

function updateBookingGroup(host, items, statusLabel) {
  if (!host) return;
  if (!items.length) {
    const label = statusLabel === 'pending' ? 'pending bookings' : `${statusLabel} bookings`;
    host.innerHTML = `<p class="text-muted text-center mb-0">No ${escapeHtml(label)}.</p>`;
    return;
  }
  host.innerHTML = items.map(renderBookingCard).join('');
}

function renderBookingCard(booking) {
  const status = (booking.status || 'pending').toLowerCase();
  const statusMeta = getBookingStatusMeta(status);
  const statusUpdated = booking.statusUpdatedAt ? formatDate(booking.statusUpdatedAt) : '';
  const adminNote = booking.adminNote ? `<p class="mt-2 small text-muted">Admin note: ${escapeHtml(booking.adminNote)}</p>` : '';
  const disableAccept = status === 'accepted' ? 'disabled' : '';
  const disableReject = status === 'rejected' ? 'disabled' : '';
  const disablePending = status === 'pending' ? 'disabled' : '';
  return `
    <div class="card mb-2">
      <div class="card-body d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center gap-2 mb-1">
            <h6 class="mb-0">${escapeHtml(booking.venueTitle || 'Unknown Venue')}</h6>
            <span class="badge ${statusMeta.badgeClass}">${statusMeta.label}</span>
          </div>
          <p class="mb-0 small">${escapeHtml(booking.name || '')} • ${escapeHtml(booking.email || '')} • ${escapeHtml(booking.phone || '')}</p>
          <p class="mb-0 small text-muted">Event: ${escapeHtml(booking.eventCategory || 'Not specified')}</p>
          <p class="mb-0 small text-muted">Date: ${escapeHtml(booking.date || '')}</p>
          <p class="mb-0 small text-muted">Created: ${escapeHtml(formatDate(booking.createdAt) || '')}</p>
          ${statusUpdated ? `<p class="mb-0 small text-muted">Status updated: ${escapeHtml(statusUpdated)}</p>` : ''}
          <p class="mt-2">${escapeHtml(booking.message || '')}</p>
          ${adminNote}
        </div>
        <div class="d-flex flex-column align-items-stretch gap-2 flex-shrink-0">
          <button class="btn btn-sm btn-success" data-action="set-booking-status" data-id="${booking.id}" data-status="accepted" ${disableAccept}>Accept</button>
          <button class="btn btn-sm btn-outline-secondary" data-action="set-booking-status" data-id="${booking.id}" data-status="pending" ${disablePending}>Mark Pending</button>
          <button class="btn btn-sm btn-danger" data-action="set-booking-status" data-id="${booking.id}" data-status="rejected" ${disableReject}>Reject</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-collection="bookings" data-id="${booking.id}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function renderContacts(items) {
  const container = document.getElementById("contactsList");
  if (!items.length) {
    container.innerHTML = '<p class="text-muted">No contacts found.</p>';
    return;
  }
  const rows = items.map(i => `
    <div class="card mb-2">
      <div class="card-body d-flex justify-content-between align-items-start">
        <div>
          <h6 class="mb-1">${escapeHtml(i.name || '')}</h6>
          <p class="mb-0 small">${escapeHtml(i.email || '')}</p>
          <p class="mb-0 small text-muted">Created: ${escapeHtml(formatDate(i.createdAt) || '')}</p>
          <p class="mt-2">${escapeHtml(i.message || '')}</p>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-collection="contacts" data-id="${i.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
  container.innerHTML = rows;
}

function renderUsers(items) {
  const container = document.getElementById('usersList');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<p class="text-muted">No registered users yet.</p>';
    return;
  }

  const getTime = (entry) => {
    const candidate = entry.lastLoginAt || entry.createdAt || null;
    if (!candidate) return 0;
    if (candidate && typeof candidate.toDate === 'function') return candidate.toDate().getTime();
    const date = new Date(candidate);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  const sorted = [...items].sort((a, b) => {
    const at = getTime(a);
    const bt = getTime(b);
    return bt - at;
  });

  const rows = sorted.map((user) => {
    const created = formatDate(user.createdAt) || '-';
    const lastSeen = formatDate(user.lastLoginAt) || '-';
    const verifiedBadge = user.emailVerified ? '<span class="badge bg-success">Verified</span>' : '<span class="badge bg-warning text-dark">Unverified</span>';
    const initial = (user.displayName || user.email || '?').slice(0, 1).toUpperCase();
    const providerBadges = formatAuthProviders(user.providers);
    return `<tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="rounded-circle border bg-light d-flex align-items-center justify-content-center" style="width:36px;height:36px;">
            <span class="fw-semibold">${escapeHtml(initial)}</span>
          </div>
          <div>
            <div class="fw-semibold">${escapeHtml(user.displayName || user.email || 'User')}</div>
            <div class="small text-muted">${escapeHtml(user.email || 'No email')}</div>
          </div>
        </div>
      </td>
      <td>${verifiedBadge}</td>
      <td>${providerBadges}</td>
      <td>${escapeHtml(created)}</td>
      <td>${escapeHtml(lastSeen)}</td>
      <td class="text-break">${escapeHtml(user.uid || '')}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th scope="col">User</th>
            <th scope="col">Status</th>
            <th scope="col">Providers</th>
            <th scope="col">Created</th>
            <th scope="col">Last Login</th>
            <th scope="col">UID</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function formatAuthProviders(providers) {
  if (!Array.isArray(providers) || !providers.length) {
    return '<span class="badge text-bg-secondary">Unknown</span>';
  }
  const normalized = providers.filter((id) => typeof id === 'string' && id);
  if (!normalized.length) {
    return '<span class="badge text-bg-secondary">Unknown</span>';
  }
  const catalog = {
    'google.com': { label: 'Google', className: 'badge text-bg-danger' },
    'password': { label: 'Email & password', className: 'badge text-bg-primary' },
    'phone': { label: 'Phone', className: 'badge text-bg-success' },
    'anonymous': { label: 'Guest', className: 'badge text-bg-secondary' },
    'facebook.com': { label: 'Facebook', className: 'badge bg-primary text-white' },
    'apple.com': { label: 'Apple', className: 'badge bg-dark text-white' },
    'github.com': { label: 'GitHub', className: 'badge bg-dark text-white' }
  };
  return normalized.map((id) => {
    const meta = catalog[id] || { label: id.replace(/\.com$/, ''), className: 'badge text-bg-secondary' };
    return `<span class="${meta.className} me-1">${escapeHtml(meta.label)}</span>`;
  }).join('');
}

function getBookingStatusMeta(status) {
  switch (status) {
    case 'accepted':
      return { label: 'Accepted', badgeClass: 'bg-success' };
    case 'rejected':
      return { label: 'Rejected', badgeClass: 'bg-danger' };
    case 'pending':
    default:
      return { label: 'Pending', badgeClass: 'bg-secondary' };
  }
}

function notifyNewBooking(booking) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  if (typeof bootstrap === 'undefined') return;
  const toastId = `booking-toast-${booking.id}-${Date.now()}`;
  const safeName = escapeHtml(booking.name || 'Guest');
  const safeVenue = escapeHtml(booking.venueTitle || 'Selected venue');
  container.insertAdjacentHTML('beforeend', `
    <div id="${toastId}" class="toast align-items-center text-bg-primary border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          New booking from <strong>${safeName}</strong> for ${safeVenue}.
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `);
  const toastEl = document.getElementById(toastId);
  if (!toastEl) return;
  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 5000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function notifyNewChatMessage(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  if (typeof bootstrap === 'undefined') return;
  const toastId = `chat-toast-${message.id || Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeName = escapeHtml(message.name || message.email || 'Guest');
  const safePreview = escapeHtml(truncateText(message.text || '', 120));
  container.insertAdjacentHTML('beforeend', `
    <div id="${toastId}" class="toast align-items-center text-bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          New message from <strong>${safeName}</strong>: ${safePreview}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `);
  const toastEl = document.getElementById(toastId);
  if (!toastEl) return;
  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 5000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function notifyNewEnquiry(entry) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  if (typeof bootstrap === 'undefined') return;
  const toastId = `enquiry-toast-${entry.id || Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeName = escapeHtml(entry.name || entry.email || 'Visitor');
  const safeSnippet = escapeHtml(truncateText(entry.message || entry.subject || '', 120));
  container.insertAdjacentHTML('beforeend', `
    <div id="${toastId}" class="toast align-items-center text-bg-warning border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          New enquiry from <strong>${safeName}</strong>${safeSnippet ? `: ${safeSnippet}` : '.'}
        </div>
        <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `);
  const toastEl = document.getElementById(toastId);
  if (!toastEl) return;
  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 5000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function addAdminNotification(entry) {
  if (!entry) return;
  const resolvedAt = resolveTimestamp(entry.createdAt);
  const notification = {
    id: entry.id || `${entry.type || 'notice'}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: entry.type || 'general',
    title: entry.title || 'Notification',
    description: entry.description || '',
    createdAt: resolvedAt,
    read: false
  };
  const existingIndex = adminNotifications.findIndex((item) => item.id === notification.id);
  if (existingIndex >= 0) {
    adminNotifications.splice(existingIndex, 1);
  }
  adminNotifications.unshift(notification);
  if (adminNotifications.length > MAX_ADMIN_NOTIFICATIONS) {
    adminNotifications.length = MAX_ADMIN_NOTIFICATIONS;
  }
  refreshAdminNotifications();
}

function removeAdminNotification(id) {
  if (!id) return;
  const index = adminNotifications.findIndex((item) => item.id === id);
  if (index === -1) return;
  adminNotifications.splice(index, 1);
  refreshAdminNotifications();
}

function refreshAdminNotifications() {
  if (!notificationListEl) return;
  if (!adminNotifications.length) {
    notificationListEl.innerHTML = '<div class="px-3 py-2 text-muted">No notifications yet.</div>';
    updateAdminNotificationBadge();
    return;
  }
  const typeMeta = {
    booking: { label: 'Booking', className: 'bg-primary' },
    message: { label: 'Message', className: 'bg-success' },
    enquiry: { label: 'Enquiry', className: 'bg-warning text-dark' },
    general: { label: 'Update', className: 'bg-secondary' }
  };
  notificationListEl.innerHTML = adminNotifications.map((item) => {
    const meta = typeMeta[item.type] || typeMeta.general;
    const timeLabel = formatNotificationTime(item.createdAt);
    return `
      <div class="dropdown-item notification-entry">
        <div class="d-flex align-items-start gap-2">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="badge ${meta.className}">${escapeHtml(meta.label)}</span>
              <small class="text-muted">${escapeHtml(timeLabel)}</small>
            </div>
            <div class="fw-semibold">${escapeHtml(item.title)}</div>
            ${item.description ? `<div class="small text-muted">${escapeHtml(item.description)}</div>` : ''}
          </div>
          <button type="button" class="btn-close" aria-label="Dismiss notification" data-notification-remove="${escapeHtml(item.id)}"></button>
        </div>
      </div>
    `;
  }).join('');
  updateAdminNotificationBadge();
}

function updateAdminNotificationBadge() {
  if (!notificationBadgeEl) return;
  const totalCount = adminNotifications.length;
  if (!totalCount) {
    notificationBadgeEl.classList.add('d-none');
    notificationBadgeEl.textContent = '0';
  } else {
    notificationBadgeEl.classList.remove('d-none');
    notificationBadgeEl.textContent = String(totalCount > 99 ? '99+' : totalCount);
  }
}

async function updateBookingStatus(id, newStatus) {
  if (!newStatus) return;
  const booking = bookingsData.find(b => b.id === id);
  if (!booking) {
    alert('Booking record not found.');
    return;
  }
  if ((booking.status || 'pending') === newStatus) {
    alert(`Booking is already marked as ${newStatus}.`);
    return;
  }

  let adminMessage = '';
  let confirmationLabel = 'update this booking';
  if (newStatus === 'accepted') confirmationLabel = 'accept this booking';
  else if (newStatus === 'rejected') confirmationLabel = 'reject this booking';
  else if (newStatus === 'pending') confirmationLabel = 'mark this booking as pending';

  if (newStatus === 'accepted' || newStatus === 'rejected') {
    const safeName = booking.name || 'there';
    const safeVenue = booking.venueTitle || 'your selected venue';
    const safeDate = booking.date || 'your requested date';
    const defaultMessage = newStatus === 'accepted'
      ? `Hi ${safeName}, we are excited to confirm your booking for ${safeVenue} on ${safeDate}. Our team will reach out shortly with the next steps.`
      : `Hi ${safeName}, we are sorry to let you know that we cannot confirm your booking for ${safeVenue} on ${safeDate}. Please contact us if you would like to review alternative options.`;

    const input = prompt('Edit the message that will be emailed to the guest:', defaultMessage);
    if (input === null) {
      return; // user cancelled
    }
    adminMessage = input.trim() || defaultMessage;
  }

  let confirmMessage = `Are you sure you want to ${confirmationLabel}?`;
  if (adminMessage) {
    confirmMessage += `\n\nEmail preview:\n${adminMessage}`;
  }

  if (!confirm(confirmMessage)) {
    return;
  }

  const adminNoteValue = adminMessage || booking.adminNote || '';

  try {
    await updateDoc(doc(db, 'bookings', id), {
      status: newStatus,
      statusUpdatedAt: serverTimestamp(),
      adminNote: adminNoteValue
    });
  } catch (err) {
    console.error(err);
    alert('Failed to update booking status: ' + err.message);
    return;
  }

  const recipientEmail = typeof booking.email === 'string' ? booking.email.trim() : '';

  if ((newStatus === 'accepted' || newStatus === 'rejected') && recipientEmail) {
    try {
      await sendBookingStatusEmail({
        status: newStatus,
        toEmail: recipientEmail,
        toName: booking.name,
        venueTitle: booking.venueTitle,
        eventDate: booking.date,
        eventCategory: booking.eventCategory,
        adminMessage: adminMessage
      });
    } catch (err) {
      console.error('Email notification failed', err);
      alert('Status updated, but sending the email failed: ' + err.message);
    }
  } else if ((newStatus === 'accepted' || newStatus === 'rejected') && !recipientEmail) {
    alert('Status updated, but this booking does not have an email address.');
  }
}

// Delegated click handler for edit/delete
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const collectionName = btn.getAttribute('data-collection');
  const id = btn.getAttribute('data-id');
  if (action === 'delete') {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      await loadAll();
    } catch (err) {
      console.error(err);
      alert('Delete failed: ' + err.message);
    }
  } else if (action === 'set-booking-status') {
    await updateBookingStatus(id, btn.getAttribute('data-status'));
  } else if (action === 'reply-chat') {
    // open a small prompt to reply
    const reply = prompt('Reply to message:');
    if (!reply) return;
    try {
      // fetch original message to inherit threadId when available
      const origSnap = await getDoc(doc(db,'liveChat', id));
      const orig = origSnap.exists() ? origSnap.data() : null;
      await addDoc(collection(db,'liveChat'), {
        text: reply,
        uid: `admin:${auth.currentUser ? auth.currentUser.uid : 'admin'}`,
        createdAt: serverTimestamp(),
        replyTo: id,
        threadId: orig && orig.threadId ? orig.threadId : null,
        fromAdmin: true
      });
      // no reload needed; onSnapshot will update
    } catch (err) {
      console.error('Reply failed', err);
      alert('Reply failed: ' + err.message);
    }
  } else if (action === 'edit') {
    openEditModal(collectionName, id);
  }
});

async function openEditModal(collectionName, id) {
  const dref = doc(db, collectionName, id);
  const snap = await getDoc(dref);
  if (!snap.exists()) return alert('Item not found');
  const data = snap.data();

  document.getElementById('editCollection').value = collectionName;
  document.getElementById('editId').value = id;

  const fields = buildFieldsForCollection(collectionName, data);
  document.getElementById('editFields').innerHTML = fields;

  const modalEl = document.getElementById('editModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

function renderImagePreview(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return '<p class="text-muted small mb-2">No images stored yet.</p>';
  }

  const items = urls
    .map((url, idx) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Image ${idx + 1}</a></li>`)
    .join("");

  return `<ul class="list-unstyled small mb-2">${items}</ul>`;
}

function renderSingleImage(url) {
  if (!url) {
    return '<p class="text-muted small mb-2">No photo stored yet.</p>';
  }

  return `<p class="small mb-2"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">View current photo</a></p>`;
}

function buildFieldsForCollection(collectionName, data) {
  // For each collection, build custom form fields
  if (collectionName === 'venues') {
    return `
      <div class="row">
        <div class="col-md-6 mb-2"><input class="form-control" id="field_title" placeholder="Title" value="${escapeHtml(data.title||'')}"></div>
        <div class="col-md-6 mb-2"><input class="form-control" id="field_location" placeholder="Location" value="${escapeHtml(data.location||'')}"></div>
        <div class="col-md-6 mb-2"><input class="form-control" id="field_budget" placeholder="Budget" value="${escapeHtml(String(data.budget||''))}"></div>
        <div class="col-md-12 mb-2"><textarea class="form-control" id="field_description" placeholder="Description" rows="3">${escapeHtml(data.description||'')}</textarea></div>
        <div class="col-md-12 mb-2">
          <label class="form-label">Current Images</label>
          ${renderImagePreview(data.images)}
          <textarea class="form-control" id="field_images" placeholder="Comma separated image URLs" rows="3">${escapeHtml((data.images||[]).join(','))}</textarea>
          <div class="form-text">Edit the list to keep or remove existing images. Uploaded files append their Cloudinary links automatically.</div>
        </div>
        <div class="col-md-12 mb-2">
          <label class="form-label">Upload Additional Images</label>
          <input class="form-control" id="field_images_upload" type="file" accept="image/*" multiple>
          <div class="form-text">Select images to upload to Cloudinary and append to the list above when you save.</div>
        </div>
      </div>
    `;
  }
  if (collectionName === 'portfolio') {
    return `
      <div class="row">
        <div class="col-md-12 mb-2"><input class="form-control" id="field_title" placeholder="Title" value="${escapeHtml(data.title||'')}"></div>
        <div class="col-md-12 mb-2"><textarea class="form-control" id="field_description" placeholder="Description" rows="3">${escapeHtml(data.description||'')}</textarea></div>
        <div class="col-md-12 mb-2">
          <label class="form-label">Current Images</label>
          ${renderImagePreview(data.images)}
          <textarea class="form-control" id="field_images" placeholder="Comma separated image URLs" rows="3">${escapeHtml((data.images||[]).join(','))}</textarea>
          <div class="form-text">Adjust the URLs to keep or remove existing images. Newly uploaded files append their Cloudinary links.</div>
        </div>
        <div class="col-md-12 mb-2">
          <label class="form-label">Upload Additional Images</label>
          <input class="form-control" id="field_images_upload" type="file" accept="image/*" multiple>
          <div class="form-text">Select files to upload to Cloudinary and add to this portfolio entry.</div>
        </div>
        <div class="col-md-6 mb-2"><input class="form-control" id="field_client" placeholder="Client" value="${escapeHtml(data.client||'')}"></div>
        <div class="col-md-6 mb-2"><input class="form-control" id="field_category" placeholder="Category" value="${escapeHtml(data.category||'')}"></div>
        <div class="col-md-6 mb-2"><input type="date" class="form-control" id="field_date" value="${escapeHtml(data.date||'')}"></div>
      </div>
    `;
  }
  // teamMembers
  return `
    <div class="row">
      <div class="col-md-12 mb-2"><input class="form-control" id="field_name" placeholder="Full Name" value="${escapeHtml(data.name||'')}"></div>
      <div class="col-md-12 mb-2"><input class="form-control" id="field_designation" placeholder="Designation" value="${escapeHtml(data.designation||'')}"></div>
      <div class="col-md-12 mb-2"><textarea class="form-control" id="field_bio" placeholder="Bio" rows="3">${escapeHtml(data.bio||'')}</textarea></div>
      <div class="col-md-6 mb-2"><input class="form-control" id="field_phone" placeholder="Phone" value="${escapeHtml(data.phone||'')}"></div>
      <div class="col-md-6 mb-2"><input class="form-control" id="field_email" placeholder="Email" value="${escapeHtml(data.email||'')}"></div>
      <div class="col-md-6 mb-2"><input class="form-control" id="field_facebook" placeholder="Facebook URL" value="${escapeHtml(data.facebook||'')}"></div>
      <div class="col-md-6 mb-2"><input class="form-control" id="field_instagram" placeholder="Instagram URL" value="${escapeHtml(data.instagram||'')}"></div>
      <div class="col-md-12 mb-2">
        <label class="form-label">Current Photo</label>
        ${renderSingleImage(data.photoURL)}
        <input class="form-control" id="field_photoURL" placeholder="Photo URL" value="${escapeHtml(data.photoURL||'')}">
        <div class="form-text">Leave the URL as-is or replace it after uploading a new image below.</div>
      </div>
      <div class="col-md-12 mb-2">
        <label class="form-label">Upload New Photo</label>
        <input class="form-control" id="field_photo_upload" type="file" accept="image/*">
        <div class="form-text">Uploading a file sends it to Cloudinary and replaces the current photo URL.</div>
      </div>
    </div>
  `;
}

// Handle edit form submit
document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formEl = e.target;
  const submitBtn = formEl.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : null;
  const collectionName = document.getElementById('editCollection').value;
  const id = document.getElementById('editId').value;
  const dref = doc(db, collectionName, id);

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  try {
    const updates = await gatherUpdatesForCollection(collectionName);
    await updateDoc(dref, updates);
    // hide modal
    const modalEl = document.getElementById('editModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    await loadAll();
  } catch (err) {
    console.error(err);
    alert('Update failed: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText || 'Save';
    }
  }
});

async function gatherUpdatesForCollection(collectionName) {
  if (collectionName === 'venues') {
    const title = document.getElementById('field_title').value.trim();
    const location = document.getElementById('field_location').value.trim();
    const budget = Number(document.getElementById('field_budget').value) || 0;
    const description = document.getElementById('field_description').value.trim();
    const imagesField = document.getElementById('field_images');
    let images = imagesField ? imagesField.value.split(',').map(s=>s.trim()).filter(Boolean) : [];
    const uploadInput = document.getElementById('field_images_upload');
    if (uploadInput && uploadInput.files && uploadInput.files.length) {
      const uploadedUrls = await uploadFileList(uploadInput.files, { folder: 'venues' });
      images = images.concat(uploadedUrls);
    }
    return { title, location, budget, description, images };
  }
  if (collectionName === 'portfolio') {
    const title = document.getElementById('field_title').value.trim();
    const description = document.getElementById('field_description').value.trim();
    const imagesField = document.getElementById('field_images');
    let images = imagesField ? imagesField.value.split(',').map(s=>s.trim()).filter(Boolean) : [];
    const uploadInput = document.getElementById('field_images_upload');
    if (uploadInput && uploadInput.files && uploadInput.files.length) {
      const uploadedUrls = await uploadFileList(uploadInput.files, { folder: 'portfolio' });
      images = images.concat(uploadedUrls);
    }
    const client = document.getElementById('field_client').value.trim();
    const category = document.getElementById('field_category').value.trim();
    const date = document.getElementById('field_date').value;
    return { title, description, images, client, category, date };
  }
  // members
  const name = document.getElementById('field_name').value.trim();
  const designation = document.getElementById('field_designation').value.trim();
  const bio = document.getElementById('field_bio').value.trim();
  const phone = document.getElementById('field_phone').value.trim();
  const email = document.getElementById('field_email').value.trim();
  const facebook = document.getElementById('field_facebook').value.trim();
  const instagram = document.getElementById('field_instagram').value.trim();
  let photoURL = document.getElementById('field_photoURL').value.trim();
  const photoInput = document.getElementById('field_photo_upload');
  if (photoInput && photoInput.files && photoInput.files.length) {
    photoURL = await uploadImageToCloudinary(photoInput.files[0], { folder: 'team' });
  }
  return {
    name,
    designation,
    bio,
    phone: phone || null,
    email: email || null,
    facebook: facebook || null,
    instagram: instagram || null,
    photoURL,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format Firestore Timestamp or JS Date/number into readable string
function formatDate(ts) {
  if (!ts) return '';
  try {
    let d = ts;
    if (ts && typeof ts.toDate === 'function') d = ts.toDate();
    else if (typeof ts === 'number') d = new Date(ts);
    else d = new Date(ts);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  } catch (e) {
    return '';
  }
}

function resolveTimestamp(ts) {
  if (!ts) return new Date();
  try {
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') return new Date(ts);
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) return new Date();
    return parsed;
  } catch (err) {
    return new Date();
  }
}

function formatNotificationTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return date.toLocaleDateString();
}

function truncateText(input, maxLength) {
  const str = String(input || '').trim();
  if (str.length <= maxLength) return str;
  return str.slice(0, Math.max(0, maxLength - 3)).trimEnd() + '...';
}

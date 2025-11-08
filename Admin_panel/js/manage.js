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

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "index.html");
  await loadAll();
});

async function loadAll() {
  await loadCollection("venues", renderVenues);
  await loadCollection("portfolio", renderPortfolio);
  await loadCollection("teamMembers", renderMembers);
  await loadCollection("bookings", renderBookings);
  await loadCollection("contacts", renderContacts);
  // start live chat listener
  initLiveChat();
}

function initLiveChat(){
  const inboxEl = document.getElementById('chatInbox');
  const threadEl = document.getElementById('chatThread');
  if (!inboxEl || !threadEl) return;
  const q = query(collection(db,'liveChat'), orderBy('createdAt','asc'));
  onSnapshot(q, (snap) => {
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
  const container = document.getElementById("bookingsList");
  if (!items.length) {
    container.innerHTML = '<p class="text-muted">No bookings found.</p>';
    return;
  }
  const rows = items.map(i => `
    <div class="card mb-2">
      <div class="card-body d-flex justify-content-between align-items-start">
        <div>
          <h6 class="mb-1">${escapeHtml(i.venueTitle || 'Unknown Venue')}</h6>
          <p class="mb-0 small">${escapeHtml(i.name || '')} • ${escapeHtml(i.email || '')} • ${escapeHtml(i.phone || '')}</p>
          <p class="mb-0 small text-muted">Date: ${escapeHtml(i.date || '')}</p>
          <p class="mb-0 small text-muted">Created: ${escapeHtml(formatDate(i.createdAt) || '')}</p>
          <p class="mt-2">${escapeHtml(i.message || '')}</p>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-collection="bookings" data-id="${i.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
  container.innerHTML = rows;
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

function buildFieldsForCollection(collectionName, data) {
  // For each collection, build custom form fields
  if (collectionName === 'venues') {
    return `
      <div class="row">
        <div class="col-md-6 mb-2"><input class="form-control" id="field_title" placeholder="Title" value="${escapeHtml(data.title||'')}"></div>
        <div class="col-md-6 mb-2"><input class="form-control" id="field_location" placeholder="Location" value="${escapeHtml(data.location||'')}"></div>
        <div class="col-md-6 mb-2"><input class="form-control" id="field_budget" placeholder="Budget" value="${escapeHtml(String(data.budget||''))}"></div>
        <div class="col-md-12 mb-2"><textarea class="form-control" id="field_description" placeholder="Description">${escapeHtml(data.description||'')}</textarea></div>
        <div class="col-md-12 mb-2"><input class="form-control" id="field_images" placeholder="Comma separated image URLs" value="${escapeHtml((data.images||[]).join(','))}"></div>
      </div>
    `;
  }
  if (collectionName === 'portfolio') {
    return `
      <div class="row">
        <div class="col-md-12 mb-2"><input class="form-control" id="field_title" placeholder="Title" value="${escapeHtml(data.title||'')}"></div>
        <div class="col-md-12 mb-2"><textarea class="form-control" id="field_description" placeholder="Description">${escapeHtml(data.description||'')}</textarea></div>
        <div class="col-md-12 mb-2"><input class="form-control" id="field_images" placeholder="Comma separated image URLs" value="${escapeHtml((data.images||[]).join(','))}"></div>
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
      <div class="col-md-12 mb-2"><textarea class="form-control" id="field_bio" placeholder="Bio">${escapeHtml(data.bio||'')}</textarea></div>
      <div class="col-md-12 mb-2"><input class="form-control" id="field_photoURL" placeholder="Photo URL" value="${escapeHtml(data.photoURL||'')}"></div>
    </div>
  `;
}

// Handle edit form submit
document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const collectionName = document.getElementById('editCollection').value;
  const id = document.getElementById('editId').value;
  const dref = doc(db, collectionName, id);
  try {
    const updates = gatherUpdatesForCollection(collectionName);
    await updateDoc(dref, updates);
    // hide modal
    const modalEl = document.getElementById('editModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    await loadAll();
  } catch (err) {
    console.error(err);
    alert('Update failed: ' + err.message);
  }
});

function gatherUpdatesForCollection(collectionName) {
  if (collectionName === 'venues') {
    const title = document.getElementById('field_title').value.trim();
    const location = document.getElementById('field_location').value.trim();
    const budget = Number(document.getElementById('field_budget').value) || 0;
    const description = document.getElementById('field_description').value.trim();
    const images = document.getElementById('field_images').value.split(',').map(s=>s.trim()).filter(Boolean);
    return { title, location, budget, description, images };
  }
  if (collectionName === 'portfolio') {
    const title = document.getElementById('field_title').value.trim();
    const description = document.getElementById('field_description').value.trim();
    const images = document.getElementById('field_images').value.split(',').map(s=>s.trim()).filter(Boolean);
    const client = document.getElementById('field_client').value.trim();
    const category = document.getElementById('field_category').value.trim();
    const date = document.getElementById('field_date').value;
    return { title, description, images, client, category, date };
  }
  // members
  const name = document.getElementById('field_name').value.trim();
  const designation = document.getElementById('field_designation').value.trim();
  const bio = document.getElementById('field_bio').value.trim();
  const photoURL = document.getElementById('field_photoURL').value.trim();
  return { name, designation, bio, photoURL };
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
    return d.toLocaleString();
  } catch (e) {
    return '';
  }
}

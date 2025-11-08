// user_view/js/app.js
import { db, authReady, firebaseConfigExport, storage } from './firebase.js';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp, onSnapshot, query, orderBy, limit, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref as storageRef, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const venuesRow = document.getElementById('venuesRow');
const portfolioRow = document.getElementById('portfolioRow');
const venueModal = new bootstrap.Modal(document.getElementById('venueModal'));
let venuesData = []; // cache loaded venues for search/filtering
let currentUser = null;

// Load both sections once auth is ready (we sign in anonymously)
async function init(){
  let user = null;
  try {
    user = await authReady; // ensure we have an auth token before making writes
  currentUser = user;
  // Hide the status banner on successful auth (keep it for errors only)
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.style.display = 'none';
  } catch (err) {
    console.warn('authReady failed', err);
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerHTML = `<div class="alert alert-warning small mb-0">Firebase auth not ready: ${escapeHtml(err && err.message || '')}</div>`;
  }

  try {
    await Promise.all([loadVenues(), loadPortfolio(), loadMembers()]);
    attachDelegation();
    attachContactHandler();
    // wire up search bar (present in index.html)
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    if (searchBtn) searchBtn.addEventListener('click', onSearch);
    if (searchInput) searchInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') onSearch(); });
    // initialize chat UI and listeners
      initChat();
  } catch (err) {
    console.error('Failed to load sections', err);
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerHTML = `<div class="alert alert-danger small mb-0">Failed to load data: ${escapeHtml(err && err.message || '')}</div>`;
  }
}

// ----------------- Live Chat -----------------
let chatUnsub = null;
let lastMessageIds = new Set();
let userUnreadCount = 0;
let chatOffcanvasInstance = null;
let offcanvasEventsAttached = false;
function initChat(){
  const chatToggle = document.getElementById('chatToggle');
  const chatOffcanvasEl = document.getElementById('chatOffcanvas');
  if (!chatToggle || !chatOffcanvasEl) return;
  const offcanvas = new bootstrap.Offcanvas(chatOffcanvasEl);
  chatOffcanvasInstance = offcanvas;
  chatToggle.addEventListener('click', async () => {
    // require user profile (name + phone) on first open
    const existing = localStorage.getItem('royalChatUser');
    if (!existing) {
      // show profile modal
      const profileModalEl = document.getElementById('chatProfileModal');
      const profileModal = new bootstrap.Modal(profileModalEl);
      profileModal.show();
      // wire profile submit
      const form = document.getElementById('chatProfileForm');
      if (form) {
        const submitHandler = (e) => {
          e.preventDefault();
          const name = document.getElementById('chatName').value.trim();
          const phone = document.getElementById('chatPhone').value.trim();
          if (!name || !phone) return;
          // create a stable threadId for this device/user
          const threadId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `t_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
          const profileObj = { name, phone, threadId };
          localStorage.setItem('royalChatUser', JSON.stringify(profileObj));
            // request notification permission while user is interacting (user gesture)
            requestNotificationPermission().catch(()=>{});
          profileModal.hide();
          form.removeEventListener('submit', submitHandler);
          // start listener scoped to this thread
          startChatListener(threadId);
          // hide the toggle (requirement: hide icon when chat opened)
          chatToggle.style.display = 'none';
          offcanvas.show();
        };
        form.addEventListener('submit', submitHandler);
      }
      return;
    }
    // if profile exists, ensure it has a threadId and start listener if needed
    try {
      const p = JSON.parse(existing || '{}');
      if (!p.threadId) {
        p.threadId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `t_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
        localStorage.setItem('royalChatUser', JSON.stringify(p));
      }
      startChatListener(p.threadId);
    } catch (e) {
      console.warn('Failed to parse chat profile', e);
    }
    // hide the toggle and open
    chatToggle.style.display = 'none';
    offcanvas.show();
  });

  // wire form submit
  const chatForm = document.getElementById('chatForm');
  if (chatForm) chatForm.addEventListener('submit', sendChatMessage);

  // start listening for messages
  // If profile already exists, auto-start its listener
  const existing = JSON.parse(localStorage.getItem('royalChatUser') || 'null');
  if (existing && existing.threadId) startChatListener(existing.threadId);
}

function showUserBadge(count){
  const badge = document.getElementById('chatToggleBadge');
  if (!badge) return;
  if (!count) {
    badge.style.display = 'none';
    badge.textContent = '0';
  } else {
    badge.style.display = 'flex';
    badge.textContent = String(count > 99 ? '99+' : count);
  }
}

function requestNotificationPermission(){
  if (!('Notification' in window)) return Promise.resolve(false);
  if (Notification.permission === 'granted') return Promise.resolve(true);
  if (Notification.permission === 'denied') return Promise.resolve(false);
  return Notification.requestPermission().then(p => p === 'granted');
}

function notifyUser(title, body){
  try {
    if (Notification.permission === 'granted') {
      const n = new Notification(title, { body, icon: '/img/logo.png' });
      // optional click behavior: focus the window
      n.onclick = () => window.focus();
    }
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

function startChatListener(threadId){
  if (!threadId) return;
  // unsubscribe previous
  if (chatUnsub) chatUnsub();
  lastMessageIds = new Set();
  userUnreadCount = 0;
  showUserBadge(0);
  const messagesRef = collection(db, 'liveChat');
  // Use an equality filter and sort client-side to avoid requiring a composite index
  const q = query(messagesRef, where('threadId','==', threadId));
  chatUnsub = onSnapshot(q, (snap) => {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const items = [];
    snap.forEach(docSnap => {
      const d = { id: docSnap.id, ...docSnap.data() };
      items.push(d);
    });
    // sort by createdAt (fallback to id time if missing)
    items.sort((a,b)=>{
      const aa = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
      const bb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
      return aa - bb;
    });
    const out = [];
    for (const d of items) {
      out.push(renderChatMessage(d));
      if (!lastMessageIds.has(d.id)) {
        if (d.fromAdmin) {
          const isOpen = !!document.querySelector('#chatOffcanvas.show');
          if (!isOpen) {
            userUnreadCount += 1;
            showUserBadge(userUnreadCount);
            requestNotificationPermission().then(granted => { if (granted) notifyUser('New message from Royal Event', d.text || ''); });
            try { new Audio('/js/notify.mp3').play().catch(()=>{}); } catch(e){}
          }
        }
        lastMessageIds.add(d.id);
      }
    }
    container.innerHTML = out.join('') || '<div class="text-muted small">No messages yet — say hi!</div>';
    container.scrollTop = container.scrollHeight;
  }, (err) => {
    console.error('chat onSnapshot error', err && err.code, err && err.message);
    // Try a one-time fetch as a fallback
    fetchThreadMessagesOnce(threadId).catch(e => console.error('fallback fetch failed', e));
  });

  // Attach offcanvas show/hide handlers once
  if (!offcanvasEventsAttached) {
    const offEl = document.getElementById('chatOffcanvas');
    if (offEl) {
      offEl.addEventListener('hidden.bs.offcanvas', () => {
        const chatToggle = document.getElementById('chatToggle');
        if (chatToggle) chatToggle.style.display = '';
        // reset unread tracker and badge
        userUnreadCount = 0;
        showUserBadge(0);
      });
      offEl.addEventListener('shown.bs.offcanvas', () => {
        // hide toggle while open
        const chatToggle = document.getElementById('chatToggle');
        if (chatToggle) chatToggle.style.display = 'none';
        // reset unread when opened
        userUnreadCount = 0;
        showUserBadge(0);
      });
    }
    offcanvasEventsAttached = true;
  }
}

async function fetchThreadMessagesOnce(threadId){
  try{
    const messagesRef = collection(db, 'liveChat');
    const q = query(messagesRef, where('threadId','==', threadId));
    const snap = await getDocs(q);
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const items = [];
    snap.forEach(docSnap => {
      const d = { id: docSnap.id, ...docSnap.data() };
      items.push(d);
    });
    items.sort((a,b)=>{
      const aa = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
      const bb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
      return aa - bb;
    });
    const out = items.map(d => renderChatMessage(d));
    container.innerHTML = out.join('') || '<div class="text-muted small">No messages yet — say hi!</div>';
    container.scrollTop = container.scrollHeight;
  }catch(err){
    console.error('fetchThreadMessagesOnce error', err);
  }
}

async function sendChatMessage(e){
  e.preventDefault();
  const input = document.getElementById('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  try{
    const profile = JSON.parse(localStorage.getItem('royalChatUser') || '{}');
    const threadId = profile.threadId || null;
    await addDoc(collection(db,'liveChat'), {
      text,
      uid: currentUser ? currentUser.uid : null,
      name: profile.name || null,
      phone: profile.phone || null,
      threadId: threadId,
      fromAdmin: false,
      read: false,
      createdAt: serverTimestamp()
    });
    // ensure listener is active (in case it wasn't attached yet)
    if (!chatUnsub && threadId) startChatListener(threadId);
    input.value = '';
  }catch(err){
    console.error('Failed to send chat message', err);
    alert('Failed to send message: ' + (err.message||''));
  }
}

function renderChatMessage(d){
  const time = d.createdAt && d.createdAt.toDate ? new Date(d.createdAt.toDate()).toLocaleTimeString() : '';
  const who = d.name ? escapeHtml(d.name) : (d.uid ? (d.uid.slice ? d.uid.slice(0,6) : 'User') : 'Guest');
  const phone = d.phone ? `<div class="small text-muted">Phone: ${escapeHtml(d.phone)}</div>` : '';
  const safe = escapeHtml(d.text||'');
  const adminClass = d.fromAdmin ? 'border-start border-3 border-primary ps-2' : '';
  return `<div class="mb-2 ${adminClass}"><div class="small text-muted">${who} <span class="text-secondary">${escapeHtml(time)}</span></div>${phone}<div class="p-2 bg-light rounded mt-1">${safe}</div></div>`;
}


async function loadVenues(){
  venuesRow.innerHTML = '<p class="text-muted">Loading...</p>';
  try{
    const snap = await getDocs(collection(db,'venues'));
    if (snap.empty) {
      venuesRow.innerHTML = '<p class="text-muted">No venues available.</p>';
      return;
    }
    // Cache venues for client-side filtering
    venuesData = [];
    snap.forEach(d => venuesData.push({ id: d.id, ...d.data() }));
    await renderVenues(venuesData);
  }catch(err){
    console.error(err);
    venuesRow.innerHTML = '<p class="text-danger">Failed to load venues.</p>';
  }
}

async function renderVenues(list){
  if (!list || !list.length) {
    venuesRow.innerHTML = '<p class="text-muted">No venues available.</p>';
    return;
  }
  const cards = list.map((item, i) => {
    const img = (item.images && item.images.length) ? item.images[0] : '';
    const delay = (i % 6) * 60; // small stagger
    return `
      <div class="col-md-4">
        <div class="card h-100 card-animate fade-in-up" style="animation-delay:${delay}ms">
          ${buildImgTag(img, item.title||'')}
          <div class="card-body d-flex flex-column">
            <h5 class="card-title">${escapeHtml(item.title||'')}</h5>
            <p class="card-text small text-muted">${escapeHtml(item.location||'')}</p>
            <p class="mt-auto"><button class="btn btn-primary btn-sm" data-action="view-venue" data-id="${item.id}">View</button></p>
          </div>
        </div>
      </div>
    `;
  });
  venuesRow.innerHTML = cards.join('');
  await postProcessImages(venuesRow);
}

function onSearch(){
  const input = document.getElementById('searchInput');
  if (!input) return;
  const q = (input.value || '').trim().toLowerCase();
  if (!q) return renderVenues(venuesData);
  const filtered = venuesData.filter(v => {
    const t = (v.title || '').toString().toLowerCase();
    const l = (v.location || '').toString().toLowerCase();
    return t.includes(q) || l.includes(q);
  });
  renderVenues(filtered);
}

async function loadPortfolio(){
  portfolioRow.innerHTML = '<p class="text-muted">Loading...</p>';
  try{
    const snap = await getDocs(collection(db,'portfolio'));
    if (snap.empty) {
      portfolioRow.innerHTML = '<p class="text-muted">No portfolio items.</p>';
      return;
    }
    const cards = [];
    snap.forEach(d => {
      const item = { id: d.id, ...d.data() };
      const img = (item.images && item.images.length) ? item.images[0] : '';
      cards.push(`
        <div class="col-md-4">
          <div class="card h-100">
            ${buildImgTag(img, item.title||'')}
            <div class="card-body d-flex flex-column">
              <h5 class="card-title">${escapeHtml(item.title||'')}</h5>
              <p class="card-text small text-muted">${escapeHtml(item.client||'')}</p>
              <p class="mt-auto"><button class="btn btn-outline-primary btn-sm" data-action="view-portfolio" data-id="${item.id}">View</button></p>
            </div>
          </div>
        </div>
      `);
    });
    portfolioRow.innerHTML = cards.join('');
    await postProcessImages(portfolioRow);
  }catch(err){
    console.error(err);
    portfolioRow.innerHTML = '<p class="text-danger">Failed to load portfolio.</p>';
  }
}

async function loadMembers(){
  const membersRow = document.getElementById('membersRow');
  if (!membersRow) return;
  membersRow.innerHTML = '<p class="text-muted">Loading...</p>';
  try{
    const snap = await getDocs(collection(db,'teamMembers'));
    if (snap.empty) {
      membersRow.innerHTML = '<p class="text-muted">No team members found.</p>';
      return;
    }
    const cards = [];
    snap.forEach(d => {
      const item = { id: d.id, ...d.data() };
      const img = item.photoURL || (item.images && item.images[0]) || '';
      cards.push(`
        <div class="col-md-3 text-center">
          <div class="card h-100 p-2">
            ${buildMemberImgTag(img, item.name||'')}
            <div class="card-body">
              <h6 class="card-title mb-1">${escapeHtml(item.name||'')}</h6>
              <p class="small text-muted mb-1">${escapeHtml(item.designation||'')}</p>
              <p class="small">${escapeHtml((item.bio||'').slice(0,80))}${(item.bio||'').length>80? '...' : ''}</p>
            </div>
          </div>
        </div>
      `);
    });
    membersRow.innerHTML = cards.join('');
    await postProcessImages(membersRow);
  }catch(err){
    console.error(err);
    membersRow.innerHTML = '<p class="text-danger">Failed to load team members.</p>';
  }
}

// Build an img tag with a safe onerror fallback (inline SVG) so broken URLs don't leave empty boxes
function buildImgTag(url, alt) {
  const safeAlt = escapeHtml(alt||'');
  const normalized = normalizeImageUrl(url);
  const placeholder = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#e9ecef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6c757d">No image</text></svg>');
  // Render an <img> with data-src containing the original/normalized url and placeholder as src.
  // postProcessImages() will attempt to resolve data-src to a usable URL and set img.src.
  const dataSrc = escapeHtml(normalized || '');
  return `<div><img data-src="${dataSrc}" src="${placeholder}" alt="${safeAlt}" class="card-img-top lazy-img" onerror="this.onerror=null;this.src='${placeholder}';" /></div>`;
}

function buildMemberImgTag(url, alt) {
  const safeAlt = escapeHtml(alt||'');
  const normalized = normalizeImageUrl(url);
  const placeholder = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#e9ecef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6c757d">No image</text></svg>');
  const dataSrc = escapeHtml(normalized || '');
  return `${dataSrc ? `<img data-src="${dataSrc}" src="${placeholder}" class="rounded-circle mx-auto d-block lazy-img" style="width:100px;height:100px;object-fit:cover;" alt="${safeAlt}">` : ''}`;
}

// After HTML insertion, try to resolve any lazy images' data-src to a usable URL.
async function postProcessImages(containerEl){
  if (!containerEl) return;
  const imgs = containerEl.querySelectorAll('img.lazy-img[data-src]');
  for (const img of imgs) {
    const data = img.getAttribute('data-src') || '';
    if (!data) continue;
    // If data is already http(s) or data:, just set it
    if (/^(https?:|data:)/i.test(data)) {
      img.src = data;
      continue;
    }
    try {
      // If it's a gs:// url, or a bucket-relative path, attempt to use getDownloadURL
      if (data.startsWith('gs://')) {
        const without = data.replace('gs://','');
        const parts = without.split('/');
        const bucket = parts.shift();
        const path = parts.join('/');
        const refPath = `/${path}`.replace(/^\//, '');
        const sref = storageRef(storage, refPath);
        try {
          const url = await getDownloadURL(sref);
          img.src = url;
          continue;
        } catch (e) {
          console.error('getDownloadURL failed for gs:// path', data, e && e.code, e && e.message, e);
          // fall through to fallback handling
        }
      }
      // If it's a path like 'venues/xxx.jpg' and we have storage configured, try to resolve
      if (firebaseConfigExport && firebaseConfigExport.storageBucket && !/^[a-zA-Z0-9]+:/.test(data)) {
        const path = data.replace(/^\//,'');
        const sref = storageRef(storage, path);
        try {
          const url = await getDownloadURL(sref);
          img.src = url;
          continue;
        } catch(e) {
          // fallback below to alt=media URL
          console.error('getDownloadURL failed for storage path', path, e && e.code, e && e.message, e);
        }
      }
      // fallback: use the normalized alt=media URL
      const altmedia = normalizeImageUrl(data);
      if (altmedia) img.src = altmedia;
    } catch (err) {
      console.warn('Failed to resolve storage image', data, err && err.message);
    }
  }
}

function normalizeImageUrl(url) {
  if (!url) return '';
  // Handle Google Drive share links by converting to a direct-view URL
  // Examples supported:
  // - https://drive.google.com/file/d/FILEID/view?usp=sharing
  // - https://drive.google.com/open?id=FILEID
  // - https://drive.google.com/uc?export=view&id=FILEID
  try {
    const drv = url.match(/drive\.google\.com/);
    if (drv) {
      // extract file id from common patterns
      const idMatch = url.match(/[-\w]{25,}/);
      if (idMatch) {
        const fileId = idMatch[0];
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    }
  } catch (e) {
    // ignore and continue
  }
  // already a data URL or http(s)
  if (/^(https?:|data:)/i.test(url)) return url;
  // gs://bucket/path -> convert to HTTPS public download link
  if (url.startsWith('gs://')) {
    const without = url.replace('gs://','');
    const parts = without.split('/');
    const bucket = parts.shift();
    const path = parts.join('/');
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
  }
  // If it's a path starting with storage bucket name or contains bucket, try to form a URL
  if (firebaseConfigExport && firebaseConfigExport.storageBucket) {
    const bucket = firebaseConfigExport.storageBucket;
    // if url is like 'venues/xxx.jpg' or 'folder/file'
    if (!/^[a-zA-Z0-9]+:/.test(url)) {
      const path = url.replace(/^\//, '');
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
    }
  }
  // fallback: return original
  return url;
}

function attachDelegation(){
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (!action || !id) return;
    if (action === 'view-venue') await showVenueModal(id);
    if (action === 'view-portfolio') await showPortfolioModal(id);
  });
}

async function showVenueModal(id){
  const container = document.getElementById('venueModalBody');
  container.innerHTML = '<p class="text-muted">Loading...</p>';
  try{
    const dref = doc(db,'venues',id);
    const snap = await getDoc(dref);
    if (!snap.exists()) { container.innerHTML = '<p class="text-muted">Venue not found.</p>'; return; }
    const data = snap.data();
    const images = data.images || [];
    const firstImage = images.length ? normalizeImageUrl(images[0]) : '';
    container.innerHTML = `
      <div class="row">
        <div class="col-md-7">
          ${firstImage ? `<img src="${escapeHtml(firstImage)}" class="img-fluid mb-3" alt="">` : ''}
          <h4>${escapeHtml(data.title||'')}</h4>
          <p class="text-muted">${escapeHtml(data.location||'')}</p>
          <p>${escapeHtml(data.description||'')}</p>
        </div>
        <div class="col-md-5">
          <h5>Book this venue</h5>
          <form id="bookingFormModal">
            <input class="form-control mb-2" id="b_name" placeholder="Full name" required />
            <input class="form-control mb-2" id="b_email" placeholder="Email" required type="email" />
            <input class="form-control mb-2" id="b_phone" placeholder="Phone" required />
            <input class="form-control mb-2" id="b_date" type="date" required />
            <textarea class="form-control mb-2" id="b_msg" placeholder="Message (optional)"></textarea>
            <div class="d-grid"><button class="btn btn-primary" type="submit">Submit Booking</button></div>
          </form>
          <div id="bookingMsg" class="mt-2 small"></div>
        </div>
      </div>
    `;

  // Try to resolve any storage-backed images inside the modal
  await postProcessImages(container);

    document.getElementById('bookingFormModal').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('b_name').value.trim();
      const email = document.getElementById('b_email').value.trim();
      const phone = document.getElementById('b_phone').value.trim();
      const date = document.getElementById('b_date').value;
      const message = document.getElementById('b_msg').value.trim();
      const bookingMsg = document.getElementById('bookingMsg');
      bookingMsg.textContent = '⏳ Sending booking...';
      try{
        await addDoc(collection(db,'bookings'),{
          venueId: id,
          venueTitle: data.title || '',
          name, email, phone, date, message,
          createdAt: serverTimestamp()
        });
        bookingMsg.innerHTML = '<span class="text-success">✅ Booking submitted. Admin will contact you.</span>';
        e.target.reset();
      }catch(err){
        console.error(err);
        bookingMsg.innerHTML = '<span class="text-danger">Failed to submit booking: ' + escapeHtml(err.message||'') + '</span>';
      }
    });

  venueModal.show();
  }catch(err){
    console.error(err);
    container.innerHTML = '<p class="text-danger">Failed to load venue.</p>';
  }
}

async function showPortfolioModal(id){
  const container = document.getElementById('venueModalBody');
  container.innerHTML = '<p class="text-muted">Loading...</p>';
  try{
    const dref = doc(db,'portfolio',id);
    const snap = await getDoc(dref);
    if (!snap.exists()) { container.innerHTML = '<p class="text-muted">Item not found.</p>'; return; }
    const data = snap.data();
    const images = data.images || [];
    const firstImage = images.length ? normalizeImageUrl(images[0]) : '';
    container.innerHTML = `
      <div class="row">
        <div class="col-md-7">
          ${firstImage ? `<img src="${escapeHtml(firstImage)}" class="img-fluid mb-3" alt="">` : ''}
          <h4>${escapeHtml(data.title||'')}</h4>
          <p class="text-muted">${escapeHtml(data.client||'')}</p>
          <p>${escapeHtml(data.description||'')}</p>
        </div>
        <div class="col-md-5">
          <h5>Project Details</h5>
          <p><strong>Category:</strong> ${escapeHtml(data.category||'')}</p>
          <p><strong>Date:</strong> ${escapeHtml(data.date||'')}</p>
        </div>
      </div>
    `;
  // Resolve storage-backed images inside the modal
  await postProcessImages(container);
  venueModal.show();
  }catch(err){
    console.error(err);
    container.innerHTML = '<p class="text-danger">Failed to load item.</p>';
  }
}

function attachContactHandler(){
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('c_name').value.trim();
    const email = document.getElementById('c_email').value.trim();
    const message = document.getElementById('c_message').value.trim();
    const msgEl = document.getElementById('contactMsg');
    msgEl.textContent = '⏳ Sending...';
    try{
      await addDoc(collection(db,'contacts'),{ name, email, message, createdAt: serverTimestamp() });
      msgEl.innerHTML = '<span class="text-success">✅ Message sent. We will contact you.</span>';
      form.reset();
    }catch(err){
      console.error(err);
      msgEl.innerHTML = '<span class="text-danger">Failed to send: ' + escapeHtml(err.message||'') + '</span>';
    }
  });
}

function escapeHtml(str){
  return String(str||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

init();

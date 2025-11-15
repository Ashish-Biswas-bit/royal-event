import { db, firebaseConfigExport, storage } from "./firebase.js";
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ref as storageRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const container = document.getElementById("venuesContainer");
const venueModalEl = document.getElementById('venueModal');
const bookingModalEl = document.getElementById('bookingModal');
const venueModalInstance = venueModalEl ? new bootstrap.Modal(venueModalEl) : null;
const bookingModalInstance = bookingModalEl ? new bootstrap.Modal(bookingModalEl) : null;
let venuesData = [];

// Normalize image URLs (same as in app.js)
function normalizeImageUrl(url) {
  if (!url) return '';
  try {
    const drv = url.match(/drive\.google\.com/);
    if (drv) {
      const idMatch = url.match(/[-\w]{25,}/);
      if (idMatch) {
        const fileId = idMatch[0];
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    }
  } catch (e) {
    // ignore
  }
  if (/^(https?:|data:)/i.test(url)) return url;
  if (url.startsWith('gs://')) {
    const without = url.replace('gs://','');
    const parts = without.split('/');
    const bucket = parts.shift();
    const path = parts.join('/');
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
  }
  if (firebaseConfigExport && firebaseConfigExport.storageBucket) {
    const bucket = firebaseConfigExport.storageBucket;
    if (!/^[a-zA-Z0-9]+:/.test(url)) {
      const path = url.replace(/^\//, '');
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
    }
  }
  return url;
}

// Build image tag with data-src for lazy resolution
function buildImgTag(url, alt) {
  const safeAlt = escapeHtml(alt || '');
  const normalized = normalizeImageUrl(url);
  const placeholder = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#e9ecef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6c757d">No image</text></svg>');
  const dataSrc = escapeHtml(normalized || '');
  return `<img data-src="${dataSrc}" src="${placeholder}" alt="${safeAlt}" class="card-img-top lazy-img" onerror="this.onerror=null;this.src='${placeholder}';" />`;
}

// Resolve lazy images to actual URLs
async function postProcessImages(containerEl) {
  if (!containerEl) return;
  const imgs = containerEl.querySelectorAll('img.lazy-img[data-src]');
  for (const img of imgs) {
    const data = img.getAttribute('data-src') || '';
    if (!data) continue;
    if (/^(https?:|data:)/i.test(data)) {
      img.src = data;
      continue;
    }
    try {
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
          console.error('getDownloadURL failed', data, e && e.code);
        }
      }
      if (firebaseConfigExport && firebaseConfigExport.storageBucket && !/^[a-zA-Z0-9]+:/.test(data)) {
        const path = data.replace(/^\//,'');
        const sref = storageRef(storage, path);
        try {
          const url = await getDownloadURL(sref);
          img.src = url;
          continue;
        } catch(e) {
          console.error('getDownloadURL failed', path, e && e.code);
        }
      }
      const altmedia = normalizeImageUrl(data);
      if (altmedia) img.src = altmedia;
    } catch (err) {
      console.warn('Failed to resolve storage image', data, err && err.message);
    }
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadVenues() {
  try {
    const q = query(collection(db, "venues"), orderBy("createdAt", "desc"));
    const snaps = await getDocs(q);
    snaps.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      venuesData.push(data);
      const img = data.images?.[0] || '';
      const imgTag = buildImgTag(img, data.title || '');
      container.insertAdjacentHTML("beforeend", `
        <div class="col-md-4 mb-4">
          <div class="card shadow-sm card-animate">
            ${imgTag}
            <div class="card-body d-flex flex-column">
              <h5 class="card-title">${escapeHtml(data.title || '')}</h5>
              <p class="card-text small text-muted">${escapeHtml(data.location || '')}</p>
              <p class="card-text flex-grow-1"><small>Budget: ${escapeHtml(data.budget || 'N/A')}</small></p>
              <div class="d-grid gap-2">
                <button class="btn btn-view-details btn-sm d-flex align-items-center justify-content-center gap-1" onclick="window.showVenueModal('${data.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                    <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
                  </svg>
                  <span>View Details</span>
                </button>
                <button class="btn btn-outline-primary btn-sm" onclick="window.showBookingModal('${data.id}')">Book Now</button>
              </div>
            </div>
          </div>
        </div>
      `);
    });
    // Resolve lazy-loaded images
    await postProcessImages(container);
  } catch (err) {
    console.error('Failed to load venues', err);
    container.innerHTML = '<p class="text-danger">Failed to load venues.</p>';
  }
}

// Show venue detail in modal
window.showVenueModal = function(venueId) {
  const venue = venuesData.find(v => v.id === venueId);
  if (!venue) return;

  const images = venue.images || [];
  const firstImage = images.length ? normalizeImageUrl(images[0]) : '';
  const body = document.getElementById('venueModalBody');
  if (!body) return;

  body.innerHTML = `
    <div class="row">
      <div class="col-md-7">
        ${firstImage ? `<img src="${escapeHtml(firstImage)}" class="img-fluid mb-3" alt="">` : '<div class="bg-light p-5 mb-3">No image</div>'}
        <h4>${escapeHtml(venue.title || '')}</h4>
        <p class="text-muted">${escapeHtml(venue.location || '')}</p>
        <p>${escapeHtml(venue.description || '')}</p>
      </div>
      <div class="col-md-5">
        <h5>Book this venue</h5>
        <form id="bookingFormModal" novalidate>
          <div class="mb-2"><input class="form-control" name="name" placeholder="Full name" required></div>
          <div class="mb-2"><input class="form-control" name="email" placeholder="Email" required type="email"></div>
          <div class="mb-2"><input class="form-control" name="phone" placeholder="Phone" required></div>
          <div class="mb-2"><input class="form-control" name="date" type="date" required></div>
          <div class="mb-2"><textarea class="form-control" name="message" placeholder="Message (optional)"></textarea></div>
          <div class="d-grid"><button class="btn btn-primary" type="submit">Submit Booking</button></div>
        </form>
        <div class="mt-2 small" data-role="booking-msg"></div>
      </div>
    </div>
  `;

  postProcessImages(body).catch(() => {});

  const formEl = body.querySelector('#bookingFormModal');
  const statusEl = body.querySelector('[data-role="booking-msg"]');
  if (formEl && statusEl) {
    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = formEl.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      statusEl.textContent = '⏳ Submitting booking...';
      try {
        const formData = new FormData(formEl);
        const payload = {
          venueId,
          venueTitle: venue.title || '',
          name: (formData.get('name') || '').toString().trim(),
          email: (formData.get('email') || '').toString().trim(),
          phone: (formData.get('phone') || '').toString().trim(),
          date: formData.get('date') || '',
          message: (formData.get('message') || '').toString().trim(),
          status: 'pending',
          statusUpdatedAt: serverTimestamp(),
          adminNote: '',
          createdAt: serverTimestamp()
        };

        if (!payload.name || !payload.email || !payload.phone || !payload.date) {
          statusEl.innerHTML = '<span class="text-danger">Please fill in all required fields.</span>';
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        await addDoc(collection(db, 'bookings'), payload);
        statusEl.innerHTML = '<span class="text-success">✅ Booking submitted! We will contact you soon.</span>';
        formEl.reset();
      } catch (err) {
        console.error(err);
        statusEl.innerHTML = '<span class="text-danger">Failed to submit booking: ' + escapeHtml(err.message || '') + '</span>';
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (venueModalInstance) {
    venueModalInstance.show();
  } else if (venueModalEl) {
    new bootstrap.Modal(venueModalEl).show();
  }
};

window.showBookingModal = function(venueId) {
  const venue = venuesData.find(v => v.id === venueId);
  if (!venue) return;

  const body = document.getElementById('bookingModalBody');
  if (!body) return;

  body.innerHTML = `
    <h4 class="mb-2">Book ${escapeHtml(venue.title || 'this venue')}</h4>
    <p class="small text-muted mb-3">${escapeHtml(venue.location || '')}</p>
    <form id="quickBookingForm" novalidate>
      <div class="mb-2"><input class="form-control" name="name" placeholder="Full name" required></div>
      <div class="mb-2"><input class="form-control" name="email" placeholder="Email" required type="email"></div>
      <div class="mb-2"><input class="form-control" name="phone" placeholder="Phone number" required></div>
      <div class="mb-2"><input class="form-control" name="date" type="date" required></div>
      <div class="mb-2"><textarea class="form-control" name="message" placeholder="Additional details (optional)" rows="3"></textarea></div>
      <div class="d-grid"><button class="btn btn-primary" type="submit">Confirm Booking</button></div>
    </form>
    <div class="mt-2 small" data-role="booking-msg"></div>
  `;

  const formEl = body.querySelector('#quickBookingForm');
  const statusEl = body.querySelector('[data-role="booking-msg"]');
  if (formEl && statusEl) {
    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = formEl.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      statusEl.textContent = '⏳ Submitting booking...';
      try {
        const formData = new FormData(formEl);
        const payload = {
          venueId,
          venueTitle: venue.title || '',
          name: (formData.get('name') || '').toString().trim(),
          email: (formData.get('email') || '').toString().trim(),
          phone: (formData.get('phone') || '').toString().trim(),
          date: formData.get('date') || '',
          message: (formData.get('message') || '').toString().trim(),
          status: 'pending',
          statusUpdatedAt: serverTimestamp(),
          adminNote: '',
          createdAt: serverTimestamp()
        };

        if (!payload.name || !payload.email || !payload.phone || !payload.date) {
          statusEl.innerHTML = '<span class="text-danger">Please complete all required fields.</span>';
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        await addDoc(collection(db, 'bookings'), payload);
        statusEl.innerHTML = '<span class="text-success">✅ Booking submitted! We will contact you soon.</span>';
        formEl.reset();
      } catch (err) {
        console.error(err);
        statusEl.innerHTML = '<span class="text-danger">Failed to submit booking: ' + escapeHtml(err.message || '') + '</span>';
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (bookingModalInstance) {
    bookingModalInstance.show();
  } else if (bookingModalEl) {
    new bootstrap.Modal(bookingModalEl).show();
  }
};

loadVenues();

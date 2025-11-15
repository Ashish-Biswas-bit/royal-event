// user_view/js/app.js
import {
  db,
  auth,
  authReady,
  onAuthStateChange,
  signInWithGooglePopup,
  signOutUser,
  firebaseConfigExport,
  storage,
  createAccountWithEmail,
  signInWithEmail,
  sendPasswordReset,
  updateDisplayName,
  reloadCurrentUser,
  sendCurrentUserVerification,
  ensureVisitorSession
} from './firebase.js';
import { collection, getDocs, doc, getDoc, addDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, query, orderBy, limit, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref as storageRef, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const venuesRow = document.getElementById('venuesRow');
const portfolioRow = document.getElementById('portfolioRow');
const venueModalEl = document.getElementById('venueModal');
const venueModalInstance = venueModalEl ? new bootstrap.Modal(venueModalEl) : null;
const bookingModalEl = document.getElementById('bookingModal');
const bookingModalInstance = bookingModalEl ? new bootstrap.Modal(bookingModalEl) : null;
const portfolioModalEl = document.getElementById('portfolioGalleryModal');
const portfolioModalInstance = portfolioModalEl ? new bootstrap.Modal(portfolioModalEl) : null;
let venuesData = []; // cache loaded venues for search/filtering
let portfolioData = [];
let currentUser = null;
const EVENT_CATEGORIES = [
  'Wedding',
  'Corporate Event',
  'Birthday Celebration',
  'Conference or Seminar',
  'Engagement or Anniversary',
  'Cultural Program',
  'Private Party',
  'Other'
];
const portfolioGalleryState = {
  items: [],
  title: '',
  description: '',
  client: '',
  category: '',
  index: 0
};
const portfolioGalleryPlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#101827"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-size="32">No image</text></svg>');
let portfolioGalleryControlsAttached = false;

// Auth + messaging UI handles
const authTriggerBtn = document.getElementById('authTrigger');
const authNavItem = document.getElementById('authNavItem');
const accountNavItem = document.getElementById('accountNavItem');
const accountNameEl = document.getElementById('accountName');
const accountEmailEl = document.getElementById('accountEmail');
const accountAvatarEl = document.getElementById('accountAvatar');
const accountVerificationEl = document.getElementById('accountVerification');
const authBadge = document.getElementById('authBadge');
const signOutBtn = document.getElementById('signOutBtn');
const openInboxBtn = document.getElementById('openInboxBtn');
const inboxNavItem = document.getElementById('inboxNavItem');
const inboxNavBadge = document.getElementById('inboxNavBadge');
const inboxSection = document.getElementById('inbox');
const messageThreadEl = document.getElementById('messageThread');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messageBadge = document.getElementById('messageBadge');
const messageStatus = document.getElementById('messageStatus');
const messageSubtitle = document.getElementById('messageSubtitle');
const notificationNavItem = document.getElementById('notificationNavItem');
const notificationBadge = document.getElementById('notificationBadge');
const notificationList = document.getElementById('notificationList');
const notificationToggle = document.getElementById('notificationMenuToggle');
const authModalEl = document.getElementById('authModal');
const authErrorEl = document.getElementById('authError');
const authIntentEl = document.getElementById('authIntent');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authModalInstance = authModalEl && window.bootstrap ? new bootstrap.Modal(authModalEl) : null;
const authModalTitle = document.getElementById('authModalTitle');
const authSuccessEl = document.getElementById('authSuccess');
const authViewButtons = authModalEl ? authModalEl.querySelectorAll('[data-auth-view]') : [];
const authPanels = authModalEl ? authModalEl.querySelectorAll('[data-auth-panel]') : [];
const authSwitchLinks = authModalEl ? authModalEl.querySelectorAll('[data-auth-switch]') : [];
const loginForm = document.getElementById('authLoginForm');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const signupForm = document.getElementById('authSignupForm');
const signupNameInput = document.getElementById('signupName');
const signupEmailInput = document.getElementById('signupEmail');
const signupPasswordInput = document.getElementById('signupPassword');
const signupConfirmInput = document.getElementById('signupConfirm');
const signupSubmitBtn = document.getElementById('signupSubmitBtn');
const resetForm = document.getElementById('authResetForm');
const resetEmailInput = document.getElementById('resetEmail');
const resetSubmitBtn = document.getElementById('resetSubmitBtn');
const profileModalEl = document.getElementById('profileModal');
const profileModalInstance = profileModalEl && window.bootstrap ? new bootstrap.Modal(profileModalEl) : null;
const profileForm = document.getElementById('profileForm');
const profileDisplayNameInput = document.getElementById('profileDisplayName');
const profileEmailEl = document.getElementById('profileEmail');
const profileVerificationBadge = document.getElementById('profileVerificationBadge');
const profileProviderList = document.getElementById('profileProviderList');
const profileCreatedAtEl = document.getElementById('profileCreatedAt');
const profileLastLoginAtEl = document.getElementById('profileLastLoginAt');
const profileResendBtn = document.getElementById('profileResendBtn');
const profileRefreshBtn = document.getElementById('profileRefreshBtn');
const profileSaveBtn = document.getElementById('profileSaveBtn');
const profileStatusEl = document.getElementById('profileStatus');
const openProfileBtn = document.getElementById('openProfileBtn');
let authCurrentView = 'login';

let messageUnsubscribe = null;
let messageUnreadCount = 0;
let lastDeliveredAdminIds = new Set();
let isInboxPinned = false;
let latestMessages = [];
const MAX_NOTIFICATIONS = 12;
let notificationItems = [];
let venuesUnsubscribe = null;
let knownVenueIds = new Set();
let venuesInitialLoadComplete = false;
let presenceHeartbeatTimer = null;
let presenceTrackedUid = null;
let presenceVisibilityAttached = false;
const PRESENCE_INTERVAL_MS = 45000;

function refreshNotificationDropdown(){
  if (!notificationList) return;
  if (!notificationItems.length) {
    notificationList.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
    updateNotificationBadge();
    return;
  }

  const markup = notificationItems.map((item) => {
    const classes = `notification-item ${item.read ? 'read' : 'unread'}`;
    const title = escapeHtml(item.title || 'Notification');
    const description = item.description ? `<span class="notification-item-desc">${escapeHtml(item.description)}</span>` : '';
    const timeLabel = item.timestamp ? formatRelativeTime(item.timestamp) : '';
    const timeMarkup = timeLabel ? `<span class="notification-item-time">${escapeHtml(timeLabel)}</span>` : '';
    return `<button type="button" class="${classes}" data-notification-id="${escapeHtml(item.id)}"><span class="notification-item-title">${title}</span>${description}${timeMarkup}</button>`;
  }).join('');

  notificationList.innerHTML = markup;
  updateNotificationBadge();
}

function updateNotificationBadge(){
  if (!notificationBadge) return;
  const unread = notificationItems.reduce((total, item) => total + (item.read ? 0 : 1), 0);
  if (!unread) {
    notificationBadge.classList.add('d-none');
    notificationBadge.textContent = '0';
    return;
  }
  notificationBadge.classList.remove('d-none');
  notificationBadge.textContent = unread > 99 ? '99+' : String(unread);
}

function markNotificationRead(notificationId){
  if (!notificationId) return;
  const target = notificationItems.find((entry) => entry.id === notificationId);
  if (!target || target.read) return;
  target.read = true;
  refreshNotificationDropdown();
}

function addNotification(item){
  if (!item || !item.id) return;
  if (!(item.timestamp instanceof Date) || Number.isNaN(item.timestamp.getTime())) {
    item.timestamp = new Date();
  }
  const existingIndex = notificationItems.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    notificationItems.splice(existingIndex, 1);
  }
  notificationItems = [item, ...notificationItems];
  if (notificationItems.length > MAX_NOTIFICATIONS) {
    notificationItems.length = MAX_NOTIFICATIONS;
  }
  refreshNotificationDropdown();
}

function formatRelativeTime(date){
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (!Number.isFinite(diffMs)) return '';
  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 45) return 'Just now';
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getDateFromValue(value){
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (err) {
      return null;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function handleNewVenueAdded(venue){
  if (!venue || !venue.id) return;
  const timestamp = getDateFromValue(venue.createdAt) || new Date();
  const venueTitle = (venue.title || '').toString().trim();
  const title = venueTitle ? `New venue: ${venueTitle}` : 'New venue added';
  addNotification({
    id: `venue-${venue.id}-${timestamp.getTime()}`,
    type: 'venue-added',
    venueId: venue.id,
    title,
    description: 'Click to view this venue\'s details.',
    timestamp,
    read: false
  });
  requestNotificationPermission()
    .then((granted) => {
      if (granted) {
        const body = venueTitle ? `${venueTitle} is now available.` : 'A new venue is now available.';
        notifyUser('New venue added', body);
      }
    })
    .catch(() => {});
}

function stopVenueSubscription(){
  if (venuesUnsubscribe) {
    venuesUnsubscribe();
    venuesUnsubscribe = null;
  }
  knownVenueIds = new Set();
  venuesInitialLoadComplete = false;
  venuesData = [];
}

// Load sections after auth bootstrap
async function init(){
  try {
    await authReady;
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.style.display = 'none';
  } catch (err) {
    console.warn('authReady failed', err);
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerHTML = `<div class="alert alert-warning small mb-0">Firebase auth not ready: ${escapeHtml(err && err.message || '')}</div>`;
  }

  setupAuthUi();
  setupMessageBoxUi();

  attachDelegation();
  attachPortfolioGalleryControls();
  attachContactHandler();
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');
  if (searchBtn) searchBtn.addEventListener('click', onSearch);
  if (searchInput) searchInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') onSearch(); });

  await ensureVisitorSession();

  const initialUser = auth.currentUser;
  try {
    await Promise.all([loadVenues(), loadPortfolio(), loadMembers()]);
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      console.warn('Public data fetch blocked by Firestore security rules. Enable anonymous access or relax read permissions for venues, portfolio, and teamMembers.');
    } else {
      console.error('Failed to load sections', err);
    }
    const statusEl = document.getElementById('status');
    if (statusEl) {
      const statusMessage = err && err.code === 'permission-denied'
        ? 'Public data access is blocked by Firestore security rules. Enable anonymous sign-in or permit read access for visitors.'
        : `Failed to load data: ${err && err.message ? err.message : ''}`;
      statusEl.innerHTML = `<div class="alert alert-danger small mb-0">${escapeHtml(statusMessage)}</div>`;
    }
  }
}

function setupAuthUi(){
  if (authTriggerBtn) authTriggerBtn.addEventListener('click', () => showAuthModal('', 'login'));
  if (googleSignInBtn) googleSignInBtn.addEventListener('click', handleGoogleSignIn);
  (authViewButtons || []).forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      setAuthView(btn.dataset.authView || 'login');
    });
  });
  (authSwitchLinks || []).forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = link.dataset.authSwitch || 'login';
      if (target === 'reset' && resetEmailInput && loginEmailInput && loginEmailInput.value) {
        resetEmailInput.value = loginEmailInput.value.trim();
      }
      if (target === 'signup' && signupEmailInput && loginEmailInput && loginEmailInput.value) {
        signupEmailInput.value = loginEmailInput.value.trim();
      }
      if (target === 'login' && loginEmailInput && signupEmailInput && !loginEmailInput.value && signupEmailInput.value) {
        loginEmailInput.value = signupEmailInput.value.trim();
      }
      setAuthView(target);
    });
  });
  if (loginForm) {
    loginForm.addEventListener('submit', handleEmailLogin);
  }
  if (signupForm) {
    signupForm.addEventListener('submit', handleEmailSignup);
  }
  if (resetForm) {
    resetForm.addEventListener('submit', handlePasswordReset);
  }
  if (openProfileBtn) {
    openProfileBtn.addEventListener('click', (event) => {
      event.preventDefault();
      handleOpenProfile();
    });
  }
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileSave);
  }
  if (profileResendBtn) {
    profileResendBtn.addEventListener('click', handleProfileResendVerification);
  }
  if (profileRefreshBtn) {
    profileRefreshBtn.addEventListener('click', handleProfileRefresh);
  }
  if (profileModalEl) {
    profileModalEl.addEventListener('hidden.bs.modal', () => {
      clearProfileStatus();
    });
  }
  if (signOutBtn) signOutBtn.addEventListener('click', async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error('Sign-out failed', err);
    }
  });
  if (openInboxBtn) openInboxBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ensureInboxVisible();
  });
  if (inboxNavItem) {
    const anchor = inboxNavItem.querySelector('a');
    if (anchor) anchor.addEventListener('click', (ev) => {
      ev.preventDefault();
      ensureInboxVisible();
    });
  }
  if (notificationToggle) {
    notificationToggle.addEventListener('shown.bs.dropdown', () => {
      markAdminMessagesRead();
    });
  }
  if (notificationList) {
    notificationList.addEventListener('click', (event) => {
      const target = event.target.closest('[data-notification-id]');
      if (!target) return;
      const notificationId = target.getAttribute('data-notification-id');
      const item = notificationItems.find((entry) => entry.id === notificationId);
      if (!item) return;
      markNotificationRead(notificationId);
      if (notificationToggle && window.bootstrap && typeof window.bootstrap.Dropdown === 'function') {
        try {
          const dropdownInstance = bootstrap.Dropdown.getOrCreateInstance(notificationToggle);
          dropdownInstance.hide();
        } catch (err) {
          // ignore dropdown close errors
        }
      }
      if (item.type === 'venue-added' && item.venueId) {
        Promise.resolve(showVenueModal(item.venueId)).catch((err) => {
          console.error('Failed to open venue from notification', err);
        });
      }
    });
  }

  onAuthStateChange(async (user) => {
    currentUser = user;
    updateAccountUi(user);
    if (user) {
      startPresenceHeartbeat(user);
    } else {
      stopPresenceHeartbeat();
    }
    if (user && !user.isAnonymous) {
      try {
        await upsertUserProfile(user);
      } catch (err) {
        console.error('Failed to store user profile', err);
      }
      startMessageStream(user);
      if (profileModalEl && profileModalEl.classList.contains('show')) {
        populateProfileModal(user);
      }
      try {
        await Promise.all([loadVenues(), loadPortfolio(), loadMembers()]);
      } catch (err) {
        if (err && err.code === 'permission-denied') {
          console.warn('Public data fetch blocked by Firestore rules after login. Adjust security rules or ensure user has read access.');
        } else {
          console.error('Failed to refresh sections after login', err);
        }
      }
    } else {
      stopMessageStream();
      if (profileModalInstance) profileModalInstance.hide();
      clearProfileStatus();
      stopVenueSubscription();
      stopPresenceHeartbeat();
      if (!user) {
        let visitorUser = null;
        try {
          visitorUser = await ensureVisitorSession();
        } catch (err) {
          console.error('Failed to establish visitor session after logout', err);
        }
        if (visitorUser) {
          return; // onAuthStateChange will fire again for the anonymous session
        }
      }
      try {
        await Promise.all([loadVenues(), loadPortfolio(), loadMembers()]);
      } catch (err) {
        if (err && err.code === 'permission-denied') {
          console.warn('Public data fetch blocked by Firestore rules for signed-out visitors. Enable anonymous sign-in or relax read permissions.');
        } else {
          console.error('Failed to refresh sections after logout', err);
        }
      }
    }
  });
}

function setupMessageBoxUi(){
  if (messageForm) {
    messageForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = (messageInput ? messageInput.value : '').trim();
      if (!text) return;
      const user = await ensureVerifiedUser('send a message');
      if (!user) return;
      try {
        await addDoc(collection(db, 'liveChat'), {
          text,
          uid: user.uid,
          email: user.email || null,
          name: user.displayName || null,
          photoURL: user.photoURL || null,
          threadId: user.uid,
          fromAdmin: false,
          read: true,
          createdAt: serverTimestamp()
        });
        if (messageInput) messageInput.value = '';
        ensureInboxVisible();
      } catch (err) {
        console.error('Failed to send message', err);
        if (messageStatus) messageStatus.innerHTML = `<span class="text-danger">Message failed: ${escapeHtml(err.message || '')}</span>`;
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isInboxActive()) {
      markAdminMessagesRead();
    }
  });
}

  function clearAuthMessages(){
    if (authErrorEl) {
      authErrorEl.textContent = '';
      authErrorEl.classList.add('d-none');
    }
    if (authSuccessEl) {
      authSuccessEl.textContent = '';
      authSuccessEl.classList.add('d-none');
    }
  }

  function showAuthError(message){
    if (authErrorEl) {
      authErrorEl.textContent = message || 'Something went wrong. Please try again.';
      authErrorEl.classList.remove('d-none');
    }
    if (authSuccessEl) {
      authSuccessEl.textContent = '';
      authSuccessEl.classList.add('d-none');
    }
  }

  function showAuthSuccess(message){
    if (authSuccessEl) {
      authSuccessEl.textContent = message || '';
      authSuccessEl.classList.remove('d-none');
    }
    if (authErrorEl) {
      authErrorEl.textContent = '';
      authErrorEl.classList.add('d-none');
    }
  }

  function resetAuthForms(){
    if (loginForm) loginForm.reset();
    if (signupForm) signupForm.reset();
    if (resetForm) resetForm.reset();
  }

  function setAuthView(view){
    authCurrentView = view;
    (authViewButtons || []).forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.authView === view);
      btn.setAttribute('aria-pressed', btn.dataset.authView === view ? 'true' : 'false');
    });
    (authPanels || []).forEach((panel) => {
      const show = panel.dataset.authPanel === view;
      panel.classList.toggle('d-none', !show);
      panel.setAttribute('aria-hidden', show ? 'false' : 'true');
    });
    if (authModalEl) authModalEl.setAttribute('data-auth-active', view);
    if (authModalTitle) {
      if (view === 'signup') authModalTitle.textContent = 'Create your account';
      else if (view === 'reset') authModalTitle.textContent = 'Reset your password';
      else authModalTitle.textContent = 'Welcome back';
    }
    clearAuthMessages();
  }

  function showAuthModal(intentText = '', view = 'login'){
    setAuthView(view);
    resetAuthForms();
  if (authIntentEl) {
    if (intentText) {
      authIntentEl.textContent = intentText;
      authIntentEl.classList.remove('d-none');
    } else {
      authIntentEl.classList.add('d-none');
      authIntentEl.textContent = '';
    }
  }
  if (authModalInstance) authModalInstance.show();
}

async function handleGoogleSignIn(){
    clearAuthMessages();
    if (googleSignInBtn) googleSignInBtn.disabled = true;
  try {
    const user = await signInWithGooglePopup();
    if (user && authModalInstance) authModalInstance.hide();
    requestNotificationPermission().catch(()=>{});
  } catch (err) {
    console.error('Google sign-in failed', err);
      showAuthError(err && err.message ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      if (googleSignInBtn) googleSignInBtn.disabled = false;
  }
}

function handleOpenProfile(){
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    showAuthModal('Sign in to manage your profile.', 'login');
    return;
  }
  populateProfileModal(user);
  if (profileModalInstance) profileModalInstance.show();
}

function populateProfileModal(user){
  if (!user || !profileModalEl) return;
  clearProfileStatus();
  if (profileDisplayNameInput) {
    profileDisplayNameInput.value = user.displayName || '';
  }
  if (profileEmailEl) {
    profileEmailEl.textContent = user.email || 'No email linked';
  }
  const hasEmail = !!user.email;
  const verified = hasEmail && !!user.emailVerified;
  if (profileVerificationBadge) {
    if (!hasEmail) {
      profileVerificationBadge.textContent = 'No email on file';
      profileVerificationBadge.className = 'badge text-bg-secondary';
    } else {
      profileVerificationBadge.textContent = verified ? 'Email verified' : 'Verification pending';
      profileVerificationBadge.className = verified ? 'badge bg-success-subtle text-success' : 'badge bg-warning text-dark';
    }
  }
  if (profileResendBtn) {
    const shouldShow = hasEmail && !verified;
    profileResendBtn.classList.toggle('d-none', !shouldShow);
    profileResendBtn.disabled = false;
  }
  if (profileProviderList) {
    profileProviderList.innerHTML = formatProviderBadgesFromUser(user);
  }
  if (profileCreatedAtEl) {
    profileCreatedAtEl.textContent = formatDateTimeString(user.metadata && user.metadata.creationTime);
  }
  if (profileLastLoginAtEl) {
    profileLastLoginAtEl.textContent = formatDateTimeString(user.metadata && user.metadata.lastSignInTime);
  }
  if (profileSaveBtn) profileSaveBtn.disabled = false;
  if (profileRefreshBtn) profileRefreshBtn.disabled = false;
}

async function handleProfileSave(event){
  event.preventDefault();
  clearProfileStatus();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    showAuthModal('Sign in to manage your profile.', 'login');
    if (profileModalInstance) profileModalInstance.hide();
    return;
  }
  const newName = profileDisplayNameInput ? profileDisplayNameInput.value.trim() : '';
  if (newName.length > 60) {
    showProfileStatus('danger', 'Display name is too long.');
    return;
  }
  if (profileSaveBtn) profileSaveBtn.disabled = true;
  try {
    await updateDisplayName(newName || null);
    await reloadCurrentUser();
    const updated = auth.currentUser;
    await upsertUserProfile(updated);
    updateAccountUi(updated);
    populateProfileModal(updated);
    startPresenceHeartbeat(updated);
    showProfileStatus('success', 'Profile updated successfully.');
  } catch (err) {
    console.error('Profile update failed', err);
    showProfileStatus('danger', getFriendlyAuthError(err));
  } finally {
    if (profileSaveBtn) profileSaveBtn.disabled = false;
  }
}

async function handleProfileRefresh(event){
  event.preventDefault();
  clearProfileStatus();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    showAuthModal('Sign in to manage your profile.', 'login');
    if (profileModalInstance) profileModalInstance.hide();
    return;
  }
  if (profileRefreshBtn) profileRefreshBtn.disabled = true;
  try {
    await reloadCurrentUser();
    const refreshed = auth.currentUser;
    await upsertUserProfile(refreshed);
    updateAccountUi(refreshed);
    populateProfileModal(refreshed);
    startPresenceHeartbeat(refreshed);
    showProfileStatus(refreshed.emailVerified ? 'success' : 'info', refreshed.emailVerified ? 'Email verification confirmed! You are all set.' : 'Status refreshed. Please verify your email to unlock all features.');
  } catch (err) {
    console.error('Profile refresh failed', err);
    showProfileStatus('danger', getFriendlyAuthError(err));
  } finally {
    if (profileRefreshBtn) profileRefreshBtn.disabled = false;
  }
}

async function handleProfileResendVerification(event){
  event.preventDefault();
  clearProfileStatus();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    showAuthModal('Sign in to manage your profile.', 'login');
    if (profileModalInstance) profileModalInstance.hide();
    return;
  }
  if (!user.email) {
    showProfileStatus('danger', 'This account does not have an email address linked yet.');
    return;
  }
  if (user.emailVerified) {
    showProfileStatus('success', 'Your email is already verified.');
    return;
  }
  if (profileResendBtn) profileResendBtn.disabled = true;
  try {
    await sendCurrentUserVerification();
    showProfileStatus('success', `Verification email sent to ${user.email}. Please check your inbox.`);
  } catch (err) {
    console.error('Verification email resend failed', err);
    showProfileStatus('danger', getFriendlyAuthError(err));
  } finally {
    if (profileResendBtn) profileResendBtn.disabled = false;
  }
}

function formatProviderBadgesFromUser(user){
  const ids = [];
  if (user && Array.isArray(user.providerData)) {
    user.providerData.forEach((info) => {
      if (!info || !info.providerId) return;
      if (info.providerId === 'firebase') return;
      ids.push(info.providerId);
    });
  }
  const unique = [...new Set(ids)];
  if (!unique.length) {
    return '<span class="badge text-bg-secondary">Unknown</span>';
  }
  const catalog = {
    'password': { label: 'Email & password', className: 'badge text-bg-primary' },
    'google.com': { label: 'Google', className: 'badge text-bg-danger' },
    'phone': { label: 'Phone', className: 'badge text-bg-success' },
    'facebook.com': { label: 'Facebook', className: 'badge bg-primary text-white' },
    'apple.com': { label: 'Apple', className: 'badge bg-dark text-white' },
    'github.com': { label: 'GitHub', className: 'badge bg-dark text-white' },
    'anonymous': { label: 'Guest', className: 'badge text-bg-secondary' }
  };
  return unique.map((id) => {
    const meta = catalog[id] || { label: id.replace(/\.com$/, ''), className: 'badge text-bg-secondary' };
    return `<span class="${meta.className}">${escapeHtml(meta.label)}</span>`;
  }).join(' ');
}

function formatDateTimeString(value){
  if (!value) return '-';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  } catch (err) {
    return '-';
  }
}

function clearProfileStatus(){
  if (!profileStatusEl) return;
  profileStatusEl.className = 'alert d-none';
  profileStatusEl.textContent = '';
}

function showProfileStatus(type, message){
  if (!profileStatusEl) return;
  profileStatusEl.className = `alert alert-${type} small`;
  profileStatusEl.textContent = message;
}

async function handleEmailLogin(event){
  event.preventDefault();
  clearAuthMessages();
  const email = (loginEmailInput ? loginEmailInput.value : '').trim();
  const password = loginPasswordInput ? loginPasswordInput.value : '';
  if (!email || !password) {
    showAuthError('Enter your email and password to continue.');
    return;
  }
  if (loginSubmitBtn) loginSubmitBtn.disabled = true;
  try {
    const user = await signInWithEmail(email, password);
    if (user && authModalInstance) {
      authModalInstance.hide();
    }
    resetAuthForms();
    requestNotificationPermission().catch(()=>{});
  } catch (err) {
    console.error('Email sign-in failed', err);
    showAuthError(getFriendlyAuthError(err));
  } finally {
    if (loginSubmitBtn) loginSubmitBtn.disabled = false;
  }
}

async function handleEmailSignup(event){
  event.preventDefault();
  clearAuthMessages();
  const displayName = (signupNameInput ? signupNameInput.value : '').trim();
  const email = (signupEmailInput ? signupEmailInput.value : '').trim();
  const password = signupPasswordInput ? signupPasswordInput.value : '';
  const confirm = signupConfirmInput ? signupConfirmInput.value : '';
  if (!email || !password) {
    showAuthError('Email and password are required.');
    return;
  }
  if (password.length < 6) {
    showAuthError('Choose a password with at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    showAuthError('Passwords do not match. Please try again.');
    return;
  }
  if (signupSubmitBtn) signupSubmitBtn.disabled = true;
  try {
    await createAccountWithEmail(displayName, email, password);
    showAuthSuccess('Account created! Please check your inbox to verify your email address.');
    resetAuthForms();
    requestNotificationPermission().catch(()=>{});
    setTimeout(() => {
      if (authModalInstance) authModalInstance.hide();
    }, 1400);
  } catch (err) {
    console.error('Sign-up failed', err);
    showAuthError(getFriendlyAuthError(err));
  } finally {
    if (signupSubmitBtn) signupSubmitBtn.disabled = false;
  }
}

async function handlePasswordReset(event){
  event.preventDefault();
  clearAuthMessages();
  const email = (resetEmailInput ? resetEmailInput.value : '').trim();
  if (!email) {
    showAuthError('Enter the email address you used when creating your account.');
    return;
  }
  if (resetSubmitBtn) resetSubmitBtn.disabled = true;
  try {
    await sendPasswordReset(email);
    showAuthSuccess(`Password reset email sent to ${escapeHtml(email)}.`);
    if (resetForm) resetForm.reset();
    setTimeout(() => {
      setAuthView('login');
      showAuthSuccess('Check your inbox for a reset link, then sign in with your new password.');
    }, 1800);
  } catch (err) {
    console.error('Password reset failed', err);
    showAuthError(getFriendlyAuthError(err));
  } finally {
    if (resetSubmitBtn) resetSubmitBtn.disabled = false;
  }
}

function getFriendlyAuthError(err){
  if (!err) return 'Something went wrong. Please try again.';
  const { code, message } = err;
  const catalog = {
    'auth/email-already-in-use': 'An account already exists for this email address. Try signing in instead.',
    'auth/invalid-email': 'That email address looks incorrect. Check for typos and try again.',
    'auth/weak-password': 'Pick a stronger password with at least 6 characters.',
    'auth/wrong-password': 'That password is incorrect. Please try again.',
    'auth/user-not-found': 'We could not find an account with that email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/missing-password': 'Enter your password to continue.',
    'auth/invalid-credential': 'The email or password you entered is not valid.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/user-disabled': 'This account has been disabled. Please contact support for assistance.'
  };
  if (code && catalog[code]) return catalog[code];
  return message || 'Something went wrong. Please try again.';
}

function updateAccountUi(user){
  const isSignedIn = user && !user.isAnonymous;
  if (authNavItem) authNavItem.classList.toggle('d-none', isSignedIn);
  if (accountNavItem) accountNavItem.classList.toggle('d-none', !isSignedIn);
  if (notificationNavItem) notificationNavItem.classList.toggle('d-none', !isSignedIn);
  if (inboxNavItem) inboxNavItem.classList.toggle('d-none', !isSignedIn);
  if (inboxSection) inboxSection.classList.toggle('d-none', !isSignedIn && !isInboxPinned);

  if (!isSignedIn) {
    isInboxPinned = false;
    notificationItems = [];
    refreshNotificationDropdown();
    if (messageStatus) messageStatus.textContent = 'Sign in to start a live chat with our admin team.';
    updateMessageBadges(0);
    lastDeliveredAdminIds.clear();
    return;
  }

  const displayName = user.displayName || user.email || 'Account';
  if (accountNameEl) accountNameEl.textContent = displayName;
  if (accountEmailEl) accountEmailEl.textContent = user.email || '';
  if (accountAvatarEl) accountAvatarEl.src = user.photoURL || 'img/avatar.svg';
  const emailVerified = !!user.emailVerified;
  if (accountVerificationEl) {
    accountVerificationEl.textContent = emailVerified ? 'Email verified' : 'Verification pending - open your profile to resend the email.';
    accountVerificationEl.classList.toggle('text-danger', !emailVerified);
    accountVerificationEl.classList.toggle('text-warning', !emailVerified);
    accountVerificationEl.classList.toggle('text-success', emailVerified);
  }
  if (messageSubtitle) messageSubtitle.textContent = emailVerified ? 'Chat directly with our admin team.' : 'Verify your email to start chatting with our admin team.';
  if (messageStatus) {
    if (emailVerified) {
      messageStatus.innerHTML = `<span class="badge bg-success text-white">Signed in as ${escapeHtml(displayName)}</span>`;
    } else {
      messageStatus.innerHTML = '<span class="text-warning">Please verify your email address to send messages or request bookings. Open your profile to resend the verification email.</span>';
    }
  }
  if (authBadge) authBadge.classList.add('d-none');
}

function ensureInboxVisible(){
  if (!inboxSection) return;
  inboxSection.classList.remove('d-none');
  isInboxPinned = true;
  if (inboxNavItem) inboxNavItem.classList.remove('d-none');
  const rect = inboxSection.getBoundingClientRect();
  if (rect.top < 0 || rect.top > window.innerHeight) {
    inboxSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  markAdminMessagesRead();
}

function isInboxActive(){
  return inboxSection && !inboxSection.classList.contains('d-none');
}

function startMessageStream(user){
  if (!user || user.isAnonymous) return;
  stopMessageStream();
  const messagesRef = collection(db, 'liveChat');
  const q = query(messagesRef, where('threadId','==', user.uid));
  messageUnsubscribe = onSnapshot(q, (snap) => {
    const messages = [];
    snap.forEach((docSnap) => {
      messages.push({ id: docSnap.id, ...docSnap.data() });
    });
    messages.sort((a,b) => {
      const aa = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
      const bb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
      return aa - bb;
    });
    latestMessages = messages;
    renderMessageThread(messages);
    const unread = messages.filter((m) => m.fromAdmin && !m.read).length;
    updateMessageBadges(unread);
    const unseen = messages.filter((m) => m.fromAdmin && !m.read && !lastDeliveredAdminIds.has(m.id));
    const sectionActive = isInboxActive() && document.visibilityState === 'visible';
    if (!sectionActive && unseen.length) {
      requestNotificationPermission().then((granted) => {
        if (granted) {
          const latest = unseen[unseen.length - 1];
          notifyUser('New reply from Royal Event', latest.text || '');
        }
      }).catch(()=>{});
    }
    unseen.forEach((m) => lastDeliveredAdminIds.add(m.id));
    if (sectionActive) {
      markAdminMessagesRead(messages);
    }
  }, (err) => {
    console.error('Message listener failed', err);
    if (messageStatus) messageStatus.innerHTML = `<span class="text-danger">Live chat offline: ${escapeHtml(err.message || '')}</span>`;
  });
}

function stopMessageStream(){
  if (messageUnsubscribe) {
    messageUnsubscribe();
    messageUnsubscribe = null;
  }
  if (messageThreadEl) messageThreadEl.innerHTML = '';
  updateMessageBadges(0);
}

function renderMessageThread(messages){
  if (!messageThreadEl) return;
  if (!messages.length) {
    messageThreadEl.innerHTML = '';
    return;
  }
  const parts = [];
  let lastDay = '';
  messages.forEach((msg) => {
    const dayLabel = msg.createdAt && msg.createdAt.toDate ? msg.createdAt.toDate().toDateString() : '';
    if (dayLabel && dayLabel !== lastDay) {
      parts.push(`<div class="day-divider">${escapeHtml(dayLabel)}</div>`);
      lastDay = dayLabel;
    }
    const outgoing = msg.uid === (currentUser ? currentUser.uid : '');
    const metaPieces = [];
    const time = formatMessageTime(msg.createdAt);
    if (time) metaPieces.push(time);
    if (msg.fromAdmin && msg.name) metaPieces.push('Admin');
    const meta = metaPieces.length ? `<div class="meta">${escapeHtml(metaPieces.join(' • '))}</div>` : '';
    const body = `<div class="body">${escapeHtml(msg.text || '')}</div>`;
    parts.push(`<div class="message-item${outgoing ? ' outgoing' : ''}">${meta}${body}</div>`);
  });
  messageThreadEl.innerHTML = parts.join('');
  messageThreadEl.scrollTop = messageThreadEl.scrollHeight;
}

function updateMessageBadges(count){
  messageUnreadCount = count;
  const hasUnread = count > 0;
  if (messageBadge) {
    messageBadge.classList.toggle('d-none', !hasUnread);
    messageBadge.textContent = hasUnread ? String(count) : '0';
  }
  if (inboxNavBadge) {
    inboxNavBadge.classList.toggle('d-none', !hasUnread);
    inboxNavBadge.textContent = hasUnread ? String(count) : '0';
  }
  if (authBadge) {
    authBadge.classList.toggle('d-none', !hasUnread);
    if (hasUnread) authBadge.textContent = String(count);
  }
}

async function markAdminMessagesRead(messages){
  if (!messages) {
    messages = latestMessages;
  }
  if (!messages.length) return;
  const toMark = messages.filter((m) => m.fromAdmin && !m.read);
  if (!toMark.length) return;
  for (const msg of toMark) {
    try {
      await updateDoc(doc(db, 'liveChat', msg.id), { read: true });
      lastDeliveredAdminIds.delete(msg.id);
    } catch (err) {
      console.error('Failed to mark message read', msg.id, err);
    }
  }
  updateMessageBadges(0);
}

async function upsertUserProfile(user){
  if (!user) return;
  const profileRef = doc(db, 'users', user.uid);
  let createdAtValue = null;
  if (user.metadata && user.metadata.creationTime) {
    const createdDate = new Date(user.metadata.creationTime);
    if (!Number.isNaN(createdDate.getTime())) {
      createdAtValue = createdDate.toISOString();
    }
  }
  let includeCreatedAt = false;
  try {
    const existing = await getDoc(profileRef);
    includeCreatedAt = !existing.exists() || !existing.data() || !existing.data().createdAt;
  } catch (err) {
    console.warn('Failed to load profile before upsert', err);
    includeCreatedAt = true;
  }
  const payload = {
    uid: user.uid,
    displayName: user.displayName || null,
    email: user.email || null,
    photoURL: user.photoURL || null,
    emailVerified: !!user.emailVerified,
    providers: Array.isArray(user.providerData) ? user.providerData.map((p) => p && p.providerId).filter(Boolean) : [],
    phoneNumber: user.phoneNumber || null,
    lastLoginAt: serverTimestamp()
  };
  if (includeCreatedAt) {
    payload.createdAt = createdAtValue || serverTimestamp();
  }
  await setDoc(profileRef, payload, { merge: true });
}

function startPresenceHeartbeat(user){
  if (!user || user.isAnonymous || !user.emailVerified) {
    stopPresenceHeartbeat();
    return;
  }
  if (presenceTrackedUid === user.uid && presenceHeartbeatTimer) {
    return;
  }
  stopPresenceHeartbeat();
  presenceTrackedUid = user.uid;
  sendPresenceHeartbeat().catch((err) => {
    console.warn('Initial presence heartbeat failed', err);
  });
  presenceHeartbeatTimer = window.setInterval(() => {
    sendPresenceHeartbeat().catch((err) => {
      console.warn('Presence heartbeat failed', err);
    });
  }, PRESENCE_INTERVAL_MS);
  if (!presenceVisibilityAttached) {
    document.addEventListener('visibilitychange', handlePresenceVisibilityChange);
    presenceVisibilityAttached = true;
  }
}

function stopPresenceHeartbeat(){
  if (presenceHeartbeatTimer) {
    window.clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
  presenceTrackedUid = null;
  if (presenceVisibilityAttached) {
    document.removeEventListener('visibilitychange', handlePresenceVisibilityChange);
    presenceVisibilityAttached = false;
  }
}

function handlePresenceVisibilityChange(){
  if (document.visibilityState === 'visible') {
    sendPresenceHeartbeat().catch(() => {});
  }
}

async function sendPresenceHeartbeat(){
  if (!presenceTrackedUid) return;
  try {
    await setDoc(doc(db, 'users', presenceTrackedUid), {
      lastActiveAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    throw err;
  }
}

function formatMessageTime(ts){
  if (!ts) return '';
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    return '';
  }
}

async function ensureVerifiedUser(intent){
  const user = auth.currentUser;
  if (user && !user.isAnonymous) {
    if (user.emailVerified) return user;
    if (messageStatus) {
      const safeIntent = intent ? escapeHtml(intent) : 'continue';
      messageStatus.innerHTML = `<span class="text-warning">Verify your email address to ${safeIntent}. Open your profile to resend the verification email.</span>`;
    }
    return null;
  }
  const message = intent ? `Sign in or create an account to ${intent}.` : 'Sign in or create an account to continue.';
  showAuthModal(message, 'login');
  return null;
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
  if (!venuesRow) {
    stopVenueSubscription();
    return;
  }
  venuesRow.innerHTML = '<p class="text-muted">Loading...</p>';
  stopVenueSubscription();
  const venuesRef = collection(db, 'venues');
  return new Promise((resolve, reject) => {
    let resolved = false;
    venuesUnsubscribe = onSnapshot(venuesRef, (snap) => {
      const previousIds = new Set(knownVenueIds);
      const nextIds = new Set();
      const nextData = [];
      snap.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() };
        nextData.push(data);
        nextIds.add(docSnap.id);
      });
      knownVenueIds = nextIds;
      nextData.sort((a, b) => {
        const aDate = getDateFromValue(a.createdAt);
        const bDate = getDateFromValue(b.createdAt);
        const aTime = aDate ? aDate.getTime() : 0;
        const bTime = bDate ? bDate.getTime() : 0;
        if (aTime === bTime) {
          return (a.title || '').localeCompare(b.title || '');
        }
        return bTime - aTime;
      });
      venuesData = nextData;
      Promise.resolve(renderVenues(nextData))
        .catch((err) => {
          console.error('Failed to render venues', err);
        })
        .finally(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });

      if (venuesInitialLoadComplete) {
        nextData.forEach((venue) => {
          if (!previousIds.has(venue.id)) {
            handleNewVenueAdded(venue);
          }
        });
      } else {
        venuesInitialLoadComplete = true;
      }
    }, (err) => {
      console.error('Failed to subscribe to venues', err);
      stopVenueSubscription();
      if (venuesRow) {
        const permissionMessage = err && err.code === 'permission-denied'
          ? 'Public access to venues is currently restricted. Enable anonymous sign-in or update Firestore rules to allow read access.'
          : 'Failed to load venues.';
        venuesRow.innerHTML = `<p class="text-danger">${escapeHtml(permissionMessage)}</p>`;
      }
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

async function renderVenues(list){
  if (!list || !list.length) {
    venuesRow.innerHTML = '<p class="text-muted">No venues available.</p>';
    return;
  }
  const cards = list.map((item, i) => {
    const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
    const firstImage = images.length ? images[0] : '';
    const imageCount = images.length;
    const delay = (i % 6) * 60; // small stagger
    const toDisplay = (val) => {
      if (Array.isArray(val)) return val.filter(Boolean).join(', ');
      if (val && typeof val === 'object') {
        const parts = Object.values(val).filter(Boolean);
        return parts.join(' – ');
      }
      return val != null ? String(val) : '';
    };

    const rawDescription = (item.description || '').toString().trim();
    const isLong = rawDescription.length > 160;
    const descriptionSnippet = rawDescription ? escapeHtml(isLong ? rawDescription.slice(0, 160) : rawDescription) : '';
    const descriptionMarkup = descriptionSnippet ? `<p class="venue-description mb-3">${descriptionSnippet}${isLong ? '…' : ''}</p>` : '';
    const locationMarkup = item.location ? `<p class="venue-location">${escapeHtml(item.location)}</p>` : '';
    const metaItems = [];
    const capacityValue = toDisplay(item.capacity);
    if (capacityValue) metaItems.push(`<span class="venue-meta-item"><strong>Capacity:</strong> ${escapeHtml(capacityValue)}</span>`);
    const pricingValue = toDisplay(item.priceRange);
    if (pricingValue) metaItems.push(`<span class="venue-meta-item"><strong>Pricing:</strong> ${escapeHtml(pricingValue)}</span>`);
    const typeValue = toDisplay(item.type);
    if (typeValue) metaItems.push(`<span class="venue-meta-item"><strong>Type:</strong> ${escapeHtml(typeValue)}</span>`);
    const eventsValue = toDisplay(item.eventTypes);
    if (eventsValue) metaItems.push(`<span class="venue-meta-item"><strong>Events:</strong> ${escapeHtml(eventsValue)}</span>`);
    const metaMarkup = metaItems.length ? `<div class="venue-meta mb-3">${metaItems.join('')}</div>` : '';
    const overlayMarkup = imageCount ? `<span class="venue-gallery-overlay">${imageCount > 1 ? 'Browse gallery' : 'View photo'}</span>` : '';
    const photoBadge = imageCount > 1 ? `<span class="portfolio-card-count venue-photo-count">${escapeHtml(String(imageCount))} photos</span>` : '';
    const galleryTrigger = `
      <button type="button" class="venue-gallery-trigger" data-action="venue-gallery" data-id="${item.id}" data-index="0">
        ${buildImgTag(firstImage, item.title||'')}
        ${overlayMarkup}
      </button>
    `;
    return `
      <div class="col-md-4">
        <div class="card h-100 card-animate fade-in-up venue-card" style="animation-delay:${delay}ms">
          <div class="venue-card-img">
            ${galleryTrigger}
            ${photoBadge}
          </div>
          <div class="card-body d-flex flex-column">
            <h5 class="card-title mb-1">${escapeHtml(item.title||'')}</h5>
            ${locationMarkup}
            ${descriptionMarkup}
            ${metaMarkup}
            <div class="mt-auto d-grid gap-2">
              <button class="btn btn-primary btn-sm d-flex align-items-center justify-content-center gap-1" data-action="view-venue" data-id="${item.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                  <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
                </svg>
                <span>View Details</span>
              </button>
              <button class="btn btn-outline-primary btn-sm" data-action="book-venue" data-id="${item.id}">Book Now</button>
            </div>
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
  const rawQuery = (input.value || '').trim();
  const query = rawQuery.toLowerCase();
  if (query) {
    const filtered = venuesData.filter((venue) => {
      const title = (venue.title || '').toString().toLowerCase();
      const location = (venue.location || '').toString().toLowerCase();
      return title.includes(query) || location.includes(query);
    });
    if (filtered.length) {
      renderVenues(filtered);
    } else if (venuesRow) {
      venuesRow.innerHTML = `<p class="text-muted">No venues match "${escapeHtml(rawQuery)}".</p>`;
    }
  } else {
    renderVenues(venuesData);
  }

  const venuesSection = document.getElementById('venues');
  if (venuesSection) {
    window.requestAnimationFrame(() => {
      venuesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  input.blur();
  input.value = '';
}

async function loadPortfolio(){
  if (!portfolioRow) return;
  portfolioRow.innerHTML = '<p class="text-muted">Loading...</p>';
  try{
    const snap = await getDocs(collection(db,'portfolio'));
    if (snap.empty) {
      portfolioData = [];
      portfolioRow.innerHTML = '<p class="text-muted">No portfolio items.</p>';
      return;
    }
    portfolioData = [];
    const cards = [];
    snap.forEach(d => {
      const item = { id: d.id, ...d.data() };
      item.images = Array.isArray(item.images) ? item.images : [];
      portfolioData.push(item);
      const img = item.images.length ? item.images[0] : '';
      const rawDescription = (item.description || '').trim();
      const isLong = rawDescription.length > 200;
      const description = rawDescription ? escapeHtml(isLong ? rawDescription.slice(0, 200) : rawDescription) : '';
      const imageCount = item.images.length;
      const tags = [];
      if (item.category) tags.push(`<span class="portfolio-chip">${escapeHtml(item.category)}</span>`);
      if (item.client) tags.push(`<span class="portfolio-chip portfolio-chip-muted">${escapeHtml(item.client)}</span>`);
      const tagsMarkup = tags.length ? `<div class="portfolio-tags mb-2">${tags.join('')}</div>` : '';
      const metaItems = [];
      if (item.date) metaItems.push(`<span class="portfolio-meta-item"><strong>Date:</strong> ${escapeHtml(item.date)}</span>`);
      if (imageCount) metaItems.push(`<span class="portfolio-meta-item"><strong>Gallery:</strong> ${escapeHtml(String(imageCount))} photo${imageCount > 1 ? 's' : ''}</span>`);
      const metaMarkup = metaItems.length ? `<div class="portfolio-meta mt-auto">${metaItems.join('')}</div>` : '';
      const photoBadge = imageCount ? `<span class="portfolio-card-count">${escapeHtml(String(imageCount))} photo${imageCount > 1 ? 's' : ''}</span>` : '';
      const primaryImageMarkup = `
        <button type="button" class="portfolio-gallery-trigger" data-action="portfolio-gallery" data-id="${item.id}" data-index="0">
          ${buildImgTag(img, item.title||'')}
          <span class="portfolio-gallery-overlay">View full gallery</span>
        </button>
      `;

      cards.push(`
        <div class="col-md-4">
          <div class="card portfolio-card h-100">
            <div class="portfolio-card-img">
              ${primaryImageMarkup}
              ${photoBadge}
            </div>
            <div class="card-body d-flex flex-column">
              <h5 class="card-title mb-1">${escapeHtml(item.title||'')}</h5>
              ${tagsMarkup}
              ${description ? `<p class="portfolio-description">${description}${isLong ? '…' : ''}</p>` : ''}
              ${metaMarkup}
            </div>
          </div>
        </div>
      `);
    });
    portfolioRow.innerHTML = cards.join('');
    await postProcessImages(portfolioRow);
  }catch(err){
    console.error(err);
    portfolioData = [];
    const message = err && err.code === 'permission-denied'
      ? 'Public access to portfolio items is currently restricted. Enable anonymous sign-in or update Firestore rules to allow read access.'
      : 'Failed to load portfolio.';
    portfolioRow.innerHTML = `<p class="text-danger">${escapeHtml(message)}</p>`;
  }
}

function collectValues(source){
  if (!source) return [];
  const collected = [];
  const push = (value) => {
    if (value === undefined || value === null) return;
    const str = value.toString().trim();
    if (str) collected.push(str);
  };

  if (Array.isArray(source)) {
    source.forEach(push);
  } else if (typeof source === 'string') {
    source
      .split(/[\n,]/)
      .map((part) => part.trim())
      .forEach(push);
  } else if (typeof source === 'object') {
    Object.values(source).forEach(push);
  }

  return collected.filter(Boolean);
}

function renderTeamBio(text){
  if (!text) return '';
  const trimmed = text.toString().trim();
  if (!trimmed) return '';
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((block) => `<p class="team-bio">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div class="team-detail-block"><h6 class="team-detail-title">About</h6>${paragraphs}</div>`;
}

function renderTeamListBlock(title, items){
  if (!items || !items.length) return '';
  const safeTitle = escapeHtml(title);
  const listItems = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<div class="team-detail-block"><h6 class="team-detail-title">${safeTitle}</h6><ul class="team-list">${listItems}</ul></div>`;
}

function ensureAbsoluteUrl(url){
  if (!url) return '';
  const trimmed = url.toString().trim();
  if (!trimmed) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(trimmed)) return trimmed;
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildExternalLink(url){
  if (!url) return '';
  const trimmed = url.toString().trim();
  if (!trimmed) return '';
  const normalized = ensureAbsoluteUrl(trimmed);
  if (!normalized) return '';
  const display = trimmed.replace(/^(?:https?:)?\/\//i, '');
  return `<a href="${escapeHtml(normalized)}" target="_blank" rel="noopener">${escapeHtml(display)}</a>`;
}

function sanitizePhoneHref(phone){
  if (!phone) return '';
  const cleaned = phone.toString().trim().replace(/[^0-9+]/g, '');
  return cleaned || '';
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
    let index = 0;
    snap.forEach(d => {
      const item = { id: d.id, ...d.data() };
      const img = item.photoURL || (item.images && item.images[0]) || '';
      const delay = (index % 6) * 60;
      index += 1;
      const safeName = escapeHtml(item.name || '');
      const safeRole = escapeHtml(item.designation || '');
      const bioMarkup = renderTeamBio(item.bio);

      const tagPool = [
        ...collectValues(item.specialties),
        ...collectValues(item.skills),
        ...collectValues(item.focusAreas),
        ...collectValues(item.tags)
      ];
      const uniqueTags = Array.from(new Set(tagPool));
      const tagsMarkup = uniqueTags.length
        ? `<div class="team-detail-block"><h6 class="team-detail-title">Expertise</h6><div class="team-tags">${uniqueTags.map((tag) => `<span class="team-tag">${escapeHtml(tag)}</span>`).join('')}</div></div>`
        : '';

      const highlightsMarkup = renderTeamListBlock('Highlights', collectValues(item.achievements));
      const responsibilitiesMarkup = renderTeamListBlock('Responsibilities', collectValues(item.responsibilities));
      const educationMarkup = renderTeamListBlock('Education', collectValues(item.education));
      const certificationsMarkup = renderTeamListBlock('Certifications', collectValues(item.certifications));
      const languagesMarkup = renderTeamListBlock('Languages', collectValues(item.languages));

      const metaItems = [];
      const socialItems = [];
      const iconPhone = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M3.654 1.328a.678.678 0 0 1 .741-.047l2.522 1.26a.678.678 0 0 1 .291.902l-.88 1.76a.678.678 0 0 0 .145.781l2.457 2.457a.678.678 0 0 0 .78.145l1.76-.88a.678.678 0 0 1 .902.291l1.26 2.522a.678.678 0 0 1-.047.741l-.636.955c-.26.39-.702.563-1.09.47a17.538 17.538 0 0 1-7.563-4.42 17.538 17.538 0 0 1-4.42-7.563c-.093-.388.08-.83.47-1.09l.955-.636z"/></svg>';
      const iconEmail = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v.217l-8 4.8-8-4.8V4Zm0 1.383v6.617A2 2 0 0 0 2 14h12a2 2 0 0 0 2-2V5.383l-7.555 4.533a1 1 0 0 1-1.062 0L0 5.383Z"/></svg>';
      const iconLocation = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0a5.53 5.53 0 0 0-5.5 5.5c0 2.43 1.944 5.119 4.178 7.764.684.81 1.384 1.583 2.009 2.269a.5.5 0 0 0 .743 0c.625-.686 1.325-1.458 2.01-2.269C11.556 10.619 13.5 7.93 13.5 5.5A5.53 5.53 0 0 0 8 0Zm0 8a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>';
      const iconExperience = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 1 .5.5v3H11a.5.5 0 0 1 0 1H8a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1.09A7 7 0 1 1 3.41 13.5h-.91a.5.5 0 0 1 0-1h1.5a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-1 0v-.318a8 8 0 1 0 7.5-13.682V1.5a.5.5 0 0 1-1 0V1.5a.5.5 0 0 1 .5-.5Z"/></svg>';
      const iconLink = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M7.775 3.275a3.6 3.6 0 0 1 5.086 0c1.404 1.404 1.404 3.682 0 5.086l-1.414 1.414a.75.75 0 0 1-1.06-1.06l1.414-1.415a2.1 2.1 0 0 0-2.965-2.965l-1.414 1.414a.75.75 0 0 1-1.06-1.06l1.413-1.414Z"/><path d="M8.225 12.725a3.6 3.6 0 0 1-5.086 0c-1.404-1.404-1.404-3.682 0-5.086l1.414-1.414a.75.75 0 1 1 1.06 1.06L4.2 8.7a2.1 2.1 0 0 0 2.965 2.965l1.414-1.414a.75.75 0 1 1 1.06 1.06l-1.414 1.414Z"/></svg>';
      const iconLinkedIn = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M1.5 1.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM1 5h3v10H1V5Zm5 0h2.882v1.528h.041c.401-.76 1.383-1.56 2.848-1.56 3.045 0 3.607 2.005 3.607 4.615V15h-3V10.33c0-1.112-.02-2.541-1.548-2.541-1.55 0-1.787 1.21-1.787 2.457V15H6V5Z"/></svg>';
      const iconFacebook = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8.94 6.5H11V9H8.94V16H6V9H4.5V6.5H6V4.845C6 2.696 7.026 1 9.467 1 10.45 1 11.243 1.074 11.5 1.108V3.5h-1.44c-.986 0-1.12.469-1.12 1.09V6.5Z"/></svg>';
      const iconInstagram = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3Zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4Z"/><path d="M12.5 0h-9A3.5 3.5 0 0 0 0 3.5v9A3.5 3.5 0 0 0 3.5 16h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 12.5 0Zm2 12.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9Z"/><circle cx="12" cy="4" r="1"/></svg>';
      const iconTwitter = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M5.026 15c6.038 0 9.341-5 9.341-9.334q0-.213-.01-.425A6.68 6.68 0 0 0 16 3.542a6.56 6.56 0 0 1-1.889.518 3.301 3.301 0 0 0 1.447-1.817 6.533 6.533 0 0 1-2.085.793A3.286 3.286 0 0 0 7.875 6.03a9.325 9.325 0 0 1-6.767-3.431 3.289 3.289 0 0 0 1.018 4.382A3.323 3.323 0 0 1 .64 6.575v.041a3.288 3.288 0 0 0 2.632 3.218 3.203 3.203 0 0 1-.865.115c-.212 0-.417-.02-.616-.058a3.285 3.285 0 0 0 3.067 2.281A6.588 6.588 0 0 1 .78 13.58 6.32 6.32 0 0 1 0 13.523 9.286 9.286 0 0 0 5.026 15Z"/></svg>';

      if (item.phone) {
        const phoneHref = sanitizePhoneHref(item.phone);
        const phoneDisplay = escapeHtml(item.phone);
        metaItems.push({
          icon: iconPhone,
          label: 'Phone',
          value: phoneHref ? `<a href="tel:${escapeHtml(phoneHref)}">${phoneDisplay}</a>` : phoneDisplay
        });
      }
      if (item.email) {
        const safeEmail = escapeHtml(item.email);
        metaItems.push({
          icon: iconEmail,
          label: 'Email',
          value: `<a href="mailto:${safeEmail}">${safeEmail}</a>`
        });
      }
      if (item.location) {
        metaItems.push({
          icon: iconLocation,
          label: 'Location',
          value: escapeHtml(item.location)
        });
      }
      if (item.experience) {
        metaItems.push({
          icon: iconExperience,
          label: 'Experience',
          value: escapeHtml(item.experience)
        });
      }

      const pushLink = (label, url, icon, { social = false } = {}) => {
        const raw = (url || '').toString().trim();
        if (!raw) return;
        if (social) {
          const normalized = ensureAbsoluteUrl(raw);
          if (!normalized) return;
          socialItems.push(`<a class="team-social" href="${escapeHtml(normalized)}" target="_blank" rel="noopener" aria-label="${escapeHtml(label)}">${icon}</a>`);
          return;
        }
        const linkMarkup = buildExternalLink(raw);
        if (linkMarkup) {
          metaItems.push({ icon, label, value: linkMarkup });
        }
      };

      pushLink('Website', item.website, iconLink);
      pushLink('LinkedIn', item.linkedin, iconLinkedIn, { social: true });
      pushLink('Facebook', item.facebook, iconFacebook, { social: true });
      pushLink('Instagram', item.instagram, iconInstagram, { social: true });
      pushLink('Twitter / X', item.twitter || item.x, iconTwitter, { social: true });

      const contactMarkup = metaItems.length
        ? `<div class="team-detail-block"><h6 class="team-detail-title">Contact</h6><div class="team-meta">${metaItems.map(({ icon, label, value }) => `<div class="team-meta-item">${icon}<span class="team-meta-text"><strong>${escapeHtml(label)}:</strong> ${value}</span></div>`).join('')}</div>${socialItems.length ? `<div class="team-socials">${socialItems.join('')}</div>` : ''}</div>`
        : '';

      const socialOnlyMarkup = !metaItems.length && socialItems.length
        ? `<div class="team-detail-block"><h6 class="team-detail-title">Connect</h6><div class="team-socials">${socialItems.join('')}</div></div>`
        : '';

      const metaMarkup = contactMarkup || socialOnlyMarkup;

      const infoSections = [
        bioMarkup,
        tagsMarkup,
        highlightsMarkup,
        responsibilitiesMarkup,
        educationMarkup,
        certificationsMarkup,
        languagesMarkup,
        metaMarkup
      ].filter(Boolean).join('');

      cards.push(`
        <div class="col-md-6 col-lg-4">
          <div class="team-card card-animate fade-in-up" style="animation-delay:${delay}ms">
            <div class="team-photo">
              <span class="team-photo-frame">
                ${buildMemberImgTag(img, item.name || '')}
              </span>
            </div>
            <div class="team-info">
              <div>
                <h5 class="team-name">${safeName}</h5>
                ${safeRole ? `<p class="team-role">${safeRole}</p>` : ''}
              </div>
              ${infoSections || '<div class="team-detail-block"><p class="team-bio">Details coming soon.</p></div>'}
            </div>
          </div>
        </div>
      `);
    });
    membersRow.innerHTML = cards.join('');
    await postProcessImages(membersRow);
  }catch(err){
    console.error(err);
    const message = err && err.code === 'permission-denied'
      ? 'Public access to team members is currently restricted. Enable anonymous sign-in or update Firestore rules to allow read access.'
      : 'Failed to load team members.';
    membersRow.innerHTML = `<p class="text-danger">${escapeHtml(message)}</p>`;
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

function buildEventCategoryOptions(selectedValue = '') {
  const normalizedSelection = (selectedValue || '').toString().trim().toLowerCase();
  const placeholder = `<option value="" disabled${normalizedSelection ? '' : ' selected'}>Select event type</option>`;
  const optionMarkup = EVENT_CATEGORIES.map((label) => {
    const value = label;
    const isSelected = normalizedSelection === label.toLowerCase();
    return `<option value="${escapeHtml(value)}"${isSelected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  });
  return [placeholder, ...optionMarkup].join('');
}

function buildMemberImgTag(url, alt) {
  const nameRaw = (alt || '').toString();
  const safeAlt = escapeHtml(nameRaw);
  const normalized = normalizeImageUrl(url);
  const placeholder = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#e9ecef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6c757d">No image</text></svg>');
  const dataSrc = escapeHtml(normalized || '');
  if (dataSrc) {
    return `<img data-src="${dataSrc}" src="${placeholder}" class="team-photo-img lazy-img" loading="lazy" alt="${safeAlt || 'Team member portrait'}">`;
  }
  const initialsSource = nameRaw || 'Team member';
  const initials = initialsSource
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
  const ariaLabel = safeAlt || 'Team member';
  return `<span class="team-photo-fallback" role="img" aria-label="${ariaLabel}">${initials}</span>`;
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
    if (action === 'venue-gallery') {
      const index = Number(btn.getAttribute('data-index') || '0') || 0;
      await showVenueModal(id, index);
      return;
    }
    if (action === 'view-venue') {
      await showVenueModal(id);
      return;
    }
    if (action === 'book-venue') {
      await showQuickBookingModal(id);
      return;
    }
    if (action === 'portfolio-gallery') {
      const index = Number(btn.getAttribute('data-index') || '0') || 0;
      await openPortfolioGallery(id, index);
      return;
    }
  });
}

function attachPortfolioGalleryControls(){
  if (portfolioGalleryControlsAttached || !portfolioModalEl) return;
  const prevBtn = document.getElementById('portfolioGalleryPrev');
  const nextBtn = document.getElementById('portfolioGalleryNext');
  const imageEl = document.getElementById('portfolioGalleryImage');

  if (prevBtn) prevBtn.addEventListener('click', () => shiftPortfolioGallery(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => shiftPortfolioGallery(1));
  if (imageEl) imageEl.addEventListener('click', () => {
    if (portfolioGalleryState.items.length > 1) shiftPortfolioGallery(1);
  });

  const handleKey = (ev) => {
    if (!portfolioGalleryState.items.length) return;
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      shiftPortfolioGallery(-1);
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      shiftPortfolioGallery(1);
    }
  };

  portfolioModalEl.addEventListener('shown.bs.modal', () => {
    document.addEventListener('keydown', handleKey);
  });
  portfolioModalEl.addEventListener('hidden.bs.modal', () => {
    document.removeEventListener('keydown', handleKey);
  });

  portfolioGalleryControlsAttached = true;
}

async function openPortfolioGallery(id, startIndex = 0){
  let entry = portfolioData.find(p => p.id === id);
  if (!entry) {
    try {
      const snap = await getDoc(doc(db, 'portfolio', id));
      if (snap.exists()) {
        const data = snap.data();
        entry = {
          id: snap.id,
          ...data,
          images: Array.isArray(data.images) ? data.images : []
        };
        portfolioData.push(entry);
      }
    } catch (err) {
      console.error('Failed to fetch portfolio item', err);
    }
  }

  if (!entry) {
    alert('Portfolio item not found.');
    return;
  }

  const normalizedImages = (entry.images || [])
    .map((img) => normalizeImageUrl(img))
    .filter(Boolean);

  if (!normalizedImages.length) {
    normalizedImages.push(portfolioGalleryPlaceholder);
  }

  portfolioGalleryState.items = normalizedImages;
  portfolioGalleryState.title = entry.title || '';
  portfolioGalleryState.description = entry.description || '';
  portfolioGalleryState.client = entry.client || '';
  portfolioGalleryState.category = entry.category || '';
  const total = portfolioGalleryState.items.length;
  portfolioGalleryState.index = total ? ((startIndex % total) + total) % total : 0;

  renderPortfolioGallery();

  if (portfolioModalInstance) {
    portfolioModalInstance.show();
  } else if (portfolioModalEl) {
    new bootstrap.Modal(portfolioModalEl).show();
  }
}

function renderPortfolioGallery(){
  const imgEl = document.getElementById('portfolioGalleryImage');
  const titleEl = document.getElementById('portfolioGalleryTitle');
  const counterEl = document.getElementById('portfolioGalleryCounter');
  const metaEl = document.getElementById('portfolioGalleryMeta');
  const prevBtn = document.getElementById('portfolioGalleryPrev');
  const nextBtn = document.getElementById('portfolioGalleryNext');

  if (!imgEl || !titleEl || !counterEl || !metaEl) return;

  const { items, index, title, description, client, category } = portfolioGalleryState;
  const total = items.length;
  const currentSrc = total ? (items[index] || portfolioGalleryPlaceholder) : portfolioGalleryPlaceholder;

  imgEl.src = currentSrc;
  imgEl.alt = title ? `${title} — image ${index + 1}` : `Portfolio image ${index + 1}`;
  titleEl.textContent = title || 'Portfolio Gallery';
  counterEl.textContent = total > 1 ? `${index + 1} of ${total}` : 'Single image';

  const details = [];
  if (client) details.push(`<span><strong>Client:</strong> ${escapeHtml(client)}</span>`);
  if (category) details.push(`<span><strong>Category:</strong> ${escapeHtml(category)}</span>`);
  const descriptionHtml = description
    ? `<p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>`
    : '';
  const detailHtml = details.length
    ? `<div class="portfolio-gallery-details">${details.join('<span class="separator">•</span>')}</div>`
    : '';
  metaEl.innerHTML = `${descriptionHtml}${detailHtml}` || '<p class="text-muted mb-0">No additional details provided.</p>';

  if (prevBtn) prevBtn.disabled = total <= 1;
  if (nextBtn) nextBtn.disabled = total <= 1;
}

function shiftPortfolioGallery(delta){
  const total = portfolioGalleryState.items.length;
  if (!total) return;
  portfolioGalleryState.index = ((portfolioGalleryState.index + delta) % total + total) % total;
  renderPortfolioGallery();
}

async function showQuickBookingModal(id){
  if (!bookingModalInstance) {
    // fallback: open full venue modal if quick booking modal isn't available
    await showVenueModal(id);
    return;
  }

  const body = document.getElementById('bookingModalBody');
  if (!body) return;

  body.innerHTML = '<p class="text-muted">Loading...</p>';

  try {
    let venue = venuesData.find(v => v.id === id);
    if (!venue) {
      const snap = await getDoc(doc(db, 'venues', id));
      if (snap.exists()) {
        venue = { id: snap.id, ...snap.data() };
      }
    }

    if (!venue) {
      body.innerHTML = '<p class="text-danger">Venue not found.</p>';
      return;
    }

    body.innerHTML = `
      <h4 class="mb-2">Book ${escapeHtml(venue.title || 'this venue')}</h4>
      <p class="small text-muted mb-3">${escapeHtml(venue.location || '')}</p>
      <form id="quickBookingForm" novalidate>
        <div class="mb-2"><input class="form-control" name="name" placeholder="Full name" required></div>
        <div class="mb-2"><input class="form-control" name="email" placeholder="Email" required type="email"></div>
        <div class="mb-2"><input class="form-control" name="phone" placeholder="Phone" required></div>
        <div class="mb-2">
          <select class="form-select" name="eventCategory" required>
            ${buildEventCategoryOptions()}
          </select>
        </div>
        <div class="mb-2"><input class="form-control" name="date" type="date" required></div>
        <div class="mb-2"><textarea class="form-control" name="message" placeholder="Additional details (optional)" rows="3"></textarea></div>
        <div class="d-grid"><button class="btn btn-primary" type="submit">Confirm Booking</button></div>
      </form>
      <div class="mt-2 small" data-role="booking-msg"></div>
    `;

    const formEl = body.querySelector('#quickBookingForm');
    const statusEl = body.querySelector('[data-role="booking-msg"]');

    if (!formEl || !statusEl) return;

    const authed = auth.currentUser;
    if (authed && !authed.isAnonymous) {
      const nameInput = formEl.querySelector('input[name="name"]');
      const emailInput = formEl.querySelector('input[name="email"]');
      if (nameInput && !nameInput.value) nameInput.value = authed.displayName || '';
      if (emailInput && !emailInput.value) emailInput.value = authed.email || '';
    }

    const requiresVerifiedAccount = !authed || authed.isAnonymous || !authed.emailVerified;
    if (requiresVerifiedAccount) {
      statusEl.innerHTML = '<span class="text-warning">Sign in to confirm your booking. You can browse venues anytime, but bookings require a verified account.</span>';
    }

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = formEl.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      statusEl.textContent = '⏳ Submitting booking...';

      try {
        const verifiedUser = auth.currentUser;
        if (!verifiedUser || verifiedUser.isAnonymous || !verifiedUser.emailVerified) {
          const retry = await ensureVerifiedUser('submit a booking');
          if (!retry) {
            statusEl.innerHTML = '<span class="text-danger">Login required to complete booking.</span>';
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
        }
        const formData = new FormData(formEl);
        const payload = {
          venueId: id,
          venueTitle: venue.title || '',
          name: (formData.get('name') || '').toString().trim(),
          email: (formData.get('email') || '').toString().trim(),
          phone: (formData.get('phone') || '').toString().trim(),
          eventCategory: (formData.get('eventCategory') || '').toString().trim(),
          date: formData.get('date') || '',
          message: (formData.get('message') || '').toString().trim(),
          status: 'pending',
          statusUpdatedAt: serverTimestamp(),
          adminNote: '',
          createdAt: serverTimestamp(),
          userUid: auth.currentUser ? auth.currentUser.uid : null,
          userEmail: auth.currentUser ? auth.currentUser.email : null,
          userDisplayName: auth.currentUser ? (auth.currentUser.displayName || null) : null
        };

        if (!payload.name || !payload.email || !payload.phone || !payload.date || !payload.eventCategory) {
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

    bookingModalInstance.show();
  } catch (err) {
    console.error(err);
    body.innerHTML = '<p class="text-danger">Failed to prepare booking.</p>';
  }
}

async function showVenueModal(id, startIndex = 0){
  const container = document.getElementById('venueModalBody');
  container.innerHTML = '<p class="text-muted">Loading...</p>';
  try{
    let venue = venuesData.find(v => v.id === id);
    if (!venue) {
      const dref = doc(db,'venues',id);
      const snap = await getDoc(dref);
      if (!snap.exists()) { container.innerHTML = '<p class="text-muted">Venue not found.</p>'; return; }
      venue = { id: snap.id, ...snap.data() };
      venuesData.push(venue);
    }

    const data = venue;
    const toDisplay = (val) => {
      if (Array.isArray(val)) return val.filter(Boolean).join(', ');
      if (val && typeof val === 'object') {
        const parts = Object.values(val).filter(Boolean);
        return parts.join(' – ');
      }
      return val != null ? String(val) : '';
    };
    const images = Array.isArray(data.images) ? data.images : [];
    const normalizedImages = images.map((img) => normalizeImageUrl(img)).filter(Boolean);
    const hasGalleryImages = normalizedImages.length > 0;
    if (!hasGalleryImages) normalizedImages.push(portfolioGalleryPlaceholder);
    const total = normalizedImages.length;
    const safeIndex = total ? (((Number(startIndex) || 0) % total) + total) % total : 0;

    const descriptionRaw = (data.description || '').toString().trim();
    const formattedDescription = descriptionRaw ? escapeHtml(descriptionRaw).replace(/\n/g, '<br>') : '';

    const chipItems = [];
    const capacityValue = toDisplay(data.capacity);
    if (capacityValue) chipItems.push(`<span class="venue-detail-chip"><strong>Capacity:</strong> ${escapeHtml(capacityValue)}</span>`);
    const pricingValue = toDisplay(data.priceRange);
    if (pricingValue) chipItems.push(`<span class="venue-detail-chip"><strong>Pricing:</strong> ${escapeHtml(pricingValue)}</span>`);
    const typeValue = toDisplay(data.type);
    if (typeValue) chipItems.push(`<span class="venue-detail-chip"><strong>Venue Type:</strong> ${escapeHtml(typeValue)}</span>`);
    const eventsValue = toDisplay(data.eventTypes);
    if (eventsValue) chipItems.push(`<span class="venue-detail-chip"><strong>Perfect for:</strong> ${escapeHtml(eventsValue)}</span>`);
    const chipsMarkup = chipItems.length ? `<div class="venue-detail-chips">${chipItems.join('')}</div>` : '';

    let amenitiesList = [];
    if (Array.isArray(data.amenities)) {
      amenitiesList = data.amenities.filter(Boolean);
    } else if (data.amenities) {
      amenitiesList = String(data.amenities).split(/[,•]/).map((item) => item.trim()).filter(Boolean);
    }
    amenitiesList = amenitiesList.slice(0, 8);
    const amenitiesMarkup = amenitiesList.length ? `<ul class="venue-amenities">${amenitiesList.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>` : '';

    const initialImageSrc = normalizedImages[safeIndex] || portfolioGalleryPlaceholder;
    const safeTitle = escapeHtml(data.title || 'Venue photo');
    const thumbsMarkup = hasGalleryImages && total > 1
      ? normalizedImages.map((src, idx) => `<button type="button" class="venue-thumb${idx === safeIndex ? ' active' : ''}" data-role="venue-thumb" data-index="${idx}"><img src="${escapeHtml(src)}" alt="${escapeHtml((data.title || 'Venue photo') + ' thumbnail ' + (idx + 1))}"></button>`).join('')
      : '';

    container.innerHTML = `
      <div class="row g-4 align-items-start venue-modal-grid">
        <div class="col-lg-7">
          <div class="venue-modal-header mb-3">
            <h4 class="mb-1">${escapeHtml(data.title||'')}</h4>
            ${data.location ? `<p class="venue-modal-location mb-0">${escapeHtml(data.location)}</p>` : ''}
          </div>
          <div class="venue-gallery">
            <div class="venue-gallery-main">
              <button type="button" class="venue-gallery-nav prev" data-role="venue-gallery-prev" aria-label="Previous photo">
                <span aria-hidden="true">&#10094;</span>
              </button>
              <img data-role="venue-gallery-image" src="${escapeHtml(initialImageSrc)}" alt="${safeTitle}" class="img-fluid" />
              <button type="button" class="venue-gallery-nav next" data-role="venue-gallery-next" aria-label="Next photo">
                <span aria-hidden="true">&#10095;</span>
              </button>
            </div>
            <div class="venue-gallery-counter" data-role="venue-gallery-counter"></div>
            <div class="venue-gallery-thumbs${thumbsMarkup ? '' : ' d-none'}" data-role="venue-gallery-thumbs">
              ${thumbsMarkup}
            </div>
          </div>
          <div class="venue-modal-description mt-4">
            ${formattedDescription ? `<p>${formattedDescription}</p>` : '<p class="text-muted mb-0">No detailed description provided.</p>'}
            ${chipsMarkup}
            ${amenitiesMarkup}
          </div>
        </div>
        <div class="col-lg-5">
          <div class="venue-booking-panel">
            <h5 class="mb-3">Book this venue</h5>
            <form id="bookingFormModal" novalidate>
              <div class="mb-2"><input class="form-control" name="name" placeholder="Full name" required></div>
              <div class="mb-2"><input class="form-control" name="email" placeholder="Email" required type="email"></div>
              <div class="mb-2"><input class="form-control" name="phone" placeholder="Phone" required></div>
              <div class="mb-2">
                <select class="form-select" name="eventCategory" required>
                  ${buildEventCategoryOptions()}
                </select>
              </div>
              <div class="mb-2"><input class="form-control" name="date" type="date" required></div>
              <div class="mb-3"><textarea class="form-control" name="message" placeholder="Message (optional)" rows="3"></textarea></div>
              <div class="d-grid"><button class="btn btn-primary" type="submit">Submit Booking</button></div>
            </form>
            <div class="mt-3 small" data-role="booking-msg"></div>
          </div>
        </div>
      </div>
    `;

    const mainImgEl = container.querySelector('[data-role="venue-gallery-image"]');
    const counterEl = container.querySelector('[data-role="venue-gallery-counter"]');
    const prevBtn = container.querySelector('[data-role="venue-gallery-prev"]');
    const nextBtn = container.querySelector('[data-role="venue-gallery-next"]');
    const thumbsEl = container.querySelector('[data-role="venue-gallery-thumbs"]');
    const thumbButtons = thumbsEl ? Array.from(thumbsEl.querySelectorAll('[data-role="venue-thumb"]')) : [];

    const galleryState = {
      items: normalizedImages,
      index: hasGalleryImages ? safeIndex : 0,
      hasImages: hasGalleryImages
    };

    const renderGallery = () => {
      if (!mainImgEl || !counterEl) return;
      const totalItems = galleryState.items.length;
      const hasImages = galleryState.hasImages;
      const currentSrc = hasImages ? galleryState.items[galleryState.index] : portfolioGalleryPlaceholder;
      mainImgEl.src = currentSrc || portfolioGalleryPlaceholder;
      mainImgEl.alt = hasImages ? `${data.title || 'Venue photo'} — photo ${galleryState.index + 1}` : 'No venue photo available';
      counterEl.textContent = hasImages ? (totalItems > 1 ? `Photo ${galleryState.index + 1} of ${totalItems}` : 'Featured photo') : 'No photos available';
      if (prevBtn) prevBtn.style.display = hasImages && totalItems > 1 ? 'flex' : 'none';
      if (nextBtn) nextBtn.style.display = hasImages && totalItems > 1 ? 'flex' : 'none';
      if (thumbsEl) thumbsEl.classList.toggle('d-none', !hasImages || totalItems <= 1);
      thumbButtons.forEach((btn, idx) => {
        btn.classList.toggle('active', idx === galleryState.index);
      });
    };

    const shiftGallery = (delta) => {
      if (!galleryState.hasImages || galleryState.items.length <= 1) return;
      const totalItems = galleryState.items.length;
      galleryState.index = ((galleryState.index + delta) % totalItems + totalItems) % totalItems;
      renderGallery();
    };

    if (prevBtn) prevBtn.addEventListener('click', () => shiftGallery(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => shiftGallery(1));
    if (mainImgEl) {
      mainImgEl.addEventListener('click', () => {
        if (galleryState.hasImages && galleryState.items.length > 1) shiftGallery(1);
      });
    }
    if (thumbsEl && galleryState.hasImages && thumbButtons.length) {
      thumbsEl.addEventListener('click', (event) => {
        const target = event.target.closest('[data-role="venue-thumb"]');
        if (!target) return;
        const idx = Number(target.getAttribute('data-index') || '0');
        if (Number.isNaN(idx)) return;
        const totalItems = galleryState.items.length;
        galleryState.index = ((idx % totalItems) + totalItems) % totalItems;
        renderGallery();
      });
    }

    const handleKey = (ev) => {
      if (!galleryState.hasImages || galleryState.items.length <= 1) return;
      if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        shiftGallery(-1);
      }
      if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        shiftGallery(1);
      }
    };

    document.addEventListener('keydown', handleKey);
    if (venueModalEl) {
      venueModalEl.addEventListener('hidden.bs.modal', () => {
        document.removeEventListener('keydown', handleKey);
      }, { once: true });
    }

    renderGallery();

    const bookingForm = container.querySelector('#bookingFormModal');
    const bookingStatus = container.querySelector('[data-role="booking-msg"]');
    if (bookingForm && bookingStatus) {
      const authed = auth.currentUser;
      if (authed && !authed.isAnonymous) {
        const nameInput = bookingForm.querySelector('input[name="name"]');
        const emailInput = bookingForm.querySelector('input[name="email"]');
        if (nameInput && !nameInput.value) nameInput.value = authed.displayName || '';
        if (emailInput && !emailInput.value) emailInput.value = authed.email || '';
      }

      bookingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = bookingForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        bookingStatus.textContent = '⏳ Submitting booking...';
        try {
          const verifiedUser = auth.currentUser;
          if (!verifiedUser || verifiedUser.isAnonymous || !verifiedUser.emailVerified) {
            const retry = await ensureVerifiedUser('submit a booking');
            if (!retry) {
              bookingStatus.innerHTML = '<span class="text-danger">Login required to complete booking.</span>';
              if (submitBtn) submitBtn.disabled = false;
              return;
            }
          }
          const formData = new FormData(bookingForm);
          const payload = {
            venueId: id,
            venueTitle: data.title || '',
            name: (formData.get('name') || '').toString().trim(),
            email: (formData.get('email') || '').toString().trim(),
            phone: (formData.get('phone') || '').toString().trim(),
            eventCategory: (formData.get('eventCategory') || '').toString().trim(),
            date: formData.get('date') || '',
            message: (formData.get('message') || '').toString().trim(),
            status: 'pending',
            statusUpdatedAt: serverTimestamp(),
            adminNote: '',
            createdAt: serverTimestamp(),
            userUid: auth.currentUser ? auth.currentUser.uid : null,
            userEmail: auth.currentUser ? auth.currentUser.email : null,
            userDisplayName: auth.currentUser ? (auth.currentUser.displayName || null) : null
          };

          if (!payload.name || !payload.email || !payload.phone || !payload.date || !payload.eventCategory) {
            bookingStatus.innerHTML = '<span class="text-danger">Please complete all required fields.</span>';
            if (submitBtn) submitBtn.disabled = false;
            return;
          }

          await addDoc(collection(db, 'bookings'), payload);
          bookingStatus.innerHTML = '<span class="text-success">✅ Booking submitted. Admin will contact you.</span>';
          bookingForm.reset();
        } catch (err) {
          console.error(err);
          bookingStatus.innerHTML = '<span class="text-danger">Failed to submit booking: ' + escapeHtml(err.message || '') + '</span>';
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    if (venueModalInstance) venueModalInstance.show();
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
  if (venueModalInstance) venueModalInstance.show();
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

refreshNotificationDropdown();
init();

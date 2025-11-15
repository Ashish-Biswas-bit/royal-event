import { emailConfig } from './email-config.js';

const SUPPORTED_STATUSES = new Set(['accepted', 'rejected']);
let emailJsLoader = null;
let initialised = false;

function requireConfig() {
  if (!emailConfig) {
    throw new Error('Email configuration missing.');
  }
  const { serviceId, publicKey, templateIdAccepted, templateIdRejected } = emailConfig;
  if (!serviceId) {
    throw new Error('EmailJS serviceId missing.');
  }
  if (!publicKey) {
    throw new Error('EmailJS publicKey missing.');
  }
  if (!templateIdAccepted && !templateIdRejected && !emailConfig.templateId) {
    throw new Error('No EmailJS template ID configured.');
  }
}

function loadEmailJs() {
  if (emailJsLoader) {
    return emailJsLoader;
  }

  emailJsLoader = new Promise((resolve, reject) => {
    if (window.emailjs) {
      resolve(window.emailjs);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/emailjs-com@3/dist/email.min.js';
    script.async = true;
    script.onload = () => {
      if (window.emailjs) {
        resolve(window.emailjs);
      } else {
        reject(new Error('EmailJS SDK failed to load.'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load EmailJS SDK script.'));
    document.head.appendChild(script);
  });

  return emailJsLoader;
}

function ensureInitialised(emailjs) {
  if (initialised) {
    return;
  }
  emailjs.init(emailConfig.publicKey);
  initialised = true;
  if (emailConfig.debug) {
    console.info('[EmailJS] initialised');
  }
}

function buildTemplateParams({
  status,
  toEmail,
  toName,
  venueTitle,
  eventDate,
  eventCategory,
  adminMessage,
}) {
  const normalise = (value, fallback = '') => {
    const str = typeof value === 'string' ? value.trim() : '';
    return str || fallback;
  };

  const params = {
    status: normalise(status),
    to_email: normalise(toEmail),
    email: normalise(toEmail),
    reply_to: normalise(toEmail),
    to_name: normalise(toName, 'Guest'),
    venue_title: normalise(venueTitle, 'Selected venue'),
    event_date: normalise(eventDate, 'Not provided'),
    event_category: normalise(eventCategory, 'Not specified'),
    admin_message: normalise(adminMessage),
  };

  if (!params.to_email) {
    throw new Error('Recipient email missing.');
  }

  return params;
}

function resolveTemplateId(status) {
  const key = status === 'accepted' ? 'templateIdAccepted' : status === 'rejected' ? 'templateIdRejected' : null;
  if (key && emailConfig[key]) {
    return emailConfig[key];
  }
  if (emailConfig.templateId) {
    return emailConfig.templateId;
  }
  throw new Error(`No EmailJS template configured for status "${status}".`);
}

export async function sendBookingStatusEmail(params) {
  requireConfig();
  const { status } = params || {};
  if (!status) {
    throw new Error('Booking status missing.');
  }

  const normalisedStatus = String(status).toLowerCase();
  if (!SUPPORTED_STATUSES.has(normalisedStatus)) {
    throw new Error(`Unsupported booking status "${status}" supplied to email sender.`);
  }

  const templateId = resolveTemplateId(normalisedStatus);
  const templateParams = buildTemplateParams({ ...params, status: normalisedStatus });
  const emailjs = await loadEmailJs();
  ensureInitialised(emailjs);

  try {
    await emailjs.send(emailConfig.serviceId, templateId, templateParams);
    if (emailConfig.debug) {
      console.info('[EmailJS] message dispatched', { templateId, templateParams });
    }
    return true;
  } catch (err) {
    throw new Error(`EmailJS send failed: ${err && err.text ? err.text : err.message || err}`);
  }
}

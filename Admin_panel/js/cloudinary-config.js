// Admin Cloudinary configuration
// Replace the placeholder values with your Cloudinary account details.
// 1. Visit https://cloudinary.com/ and grab your cloud name from the dashboard.
// 2. Create an unsigned upload preset (Settings → Upload → Upload presets).
// 3. Assign the preset name to `uploadPreset`. Keep `folder` if you want your
//    assets grouped automatically; otherwise set it to an empty string.
export const cloudinaryConfig = {
  cloudName: "delsuetna", // e.g. "demo"
  uploadPreset: "royalevent", // e.g. "royal_event_unsigned"
  folder: "royal-/uploads" // Optional: "" means no auto-foldering
};

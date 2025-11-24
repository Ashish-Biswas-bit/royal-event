# Royal Event

A Firebase-powered event management platform with real-time chat, venue catalog, booking, and admin dashboard. Built with HTML, CSS, and modular JavaScript—no backend server required.

## Features
- Venue catalog with images and details
- Real-time messaging (admin ↔ user)
- Booking and contact forms
- Admin dashboard: analytics, venue management, recent bookings/contacts
- Firebase Auth (email/password, Google, anonymous)
- Firestore for data storage
- Cloudinary for image uploads (admin)
- Responsive design with Bootstrap and custom CSS

## Project Structure
```
Admin_panel/
  add-venue.html, dashboard.html, index.html
  js/ (admin scripts: firebase.js, add-venue.js, auth.js, dashboard.js, cloudinary.js)
  css/style.css
user_view/
  index.html (public site)
  js/ (user scripts: app.js, firebase.js, venues.js, etc.)
  css/style.css
package.json
```

## Getting Started
1. **Clone or download the project.**
2. **Open in VS Code or your editor.**
3. **Run locally:**
   - Open any HTML file in your browser (double-click or use a local server).
   - For admin features, use files in `Admin_panel/`.
   - For user view, use files in `user_view/`.
   - Internet connection required for Firebase and Cloudinary.
4. **Optional:** Serve with a local server for best compatibility:
   ```powershell
   python -m http.server 8080
   # or
   npx serve .
   ```
   Then visit `http://localhost:8080/Admin_panel/index.html` or `user_view/index.html`.
5. **Run Publicly:**
    - Visit 'https://royal-event-admin-74d4c.web.app/?t=1731771234'
## Configuration
- **Firebase:** Config is in `js/firebase.js` (both admin and user). Update with your Firebase project credentials if needed.
- **Cloudinary:** Admin image uploads require `cloudinary-config.js` (not included; add your `cloudName` and `uploadPreset`).

## Dependencies
- [Firebase JS SDK](https://firebase.google.com/docs/web/setup)
- [Bootstrap](https://getbootstrap.com/)
- [Cloudinary](https://cloudinary.com/)

## License
MIT

---
Built by Ashish Biswas and contributors.

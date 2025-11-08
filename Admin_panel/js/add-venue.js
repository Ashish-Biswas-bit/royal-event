// admin-panel/js/add-venue.js
import { auth, db, storage } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const form = document.getElementById("venueForm");
const logoutBtn = document.getElementById("logoutBtn");
const message = document.getElementById("message");

// 🔐 Auth check (protect page)
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  }
});

// 🚪 Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// 🏗️ Add Venue Form Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title").value.trim();
  const location = document.getElementById("location").value.trim();
  const budget = document.getElementById("budget").value.trim();
  const description = document.getElementById("description").value.trim();
  // Support either local file uploads or external image URLs
  const imagesInput = document.getElementById("images");
  const files = imagesInput ? imagesInput.files : [];
  const imageURLInput = document.getElementById("imageURL").value.trim();

  if (!title || !location || !budget || !description || (files.length === 0 && !imageURLInput)) {
    message.textContent = "⚠️ Please fill all fields and provide at least one image (upload files or provide URL)!";
    return;
  }

  try {
    message.textContent = "⏳ Processing images...";

    // Step 1: Determine image URLs (upload files if present, otherwise use provided URLs)
    const imageUrls = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const imgRef = ref(storage, `venues/${Date.now()}_${file.name}`);
        await uploadBytes(imgRef, file);
        const url = await getDownloadURL(imgRef);
        imageUrls.push(url);
      }
    } else {
      const urls = imageURLInput.split(",").map(u => u.trim()).filter(Boolean);
      imageUrls.push(...urls);
    }

    // Normalize Google Drive share links into direct-view links so browsers can embed them.
    function normalizeDriveUrl(u) {
      if (!u || typeof u !== 'string') return u;
      try {
        if (!/drive\.google\.com/.test(u)) return u;
        // Try to extract a file id from common patterns
        const idMatch = u.match(/[-\w]{25,}/);
        if (!idMatch) return u; // can't extract
        const fileId = idMatch[0];
        // prefer the uc?export=view form which is embeddable when file is shared
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      } catch (e) {
        return u;
      }
    }

    for (let i = 0; i < imageUrls.length; i++) {
      imageUrls[i] = normalizeDriveUrl(imageUrls[i]);
    }

  // Ensure user is authenticated (helpful when rules require auth)
    const user = auth.currentUser;
    if (!user) {
      throw new Error("User not authenticated. Firestore rules may require authentication.");
    }

    // Log current user id and token (debugging only)
    console.log("Adding venue as user:", user.uid);
    try {
      const token = await user.getIdToken();
      console.log("User ID token length:", token.length);
    } catch (tErr) {
      console.warn("Could not fetch ID token:", tErr);
    }

    // Step 2: Save venue info to Firestore (use server timestamp to avoid serialization errors)
    await addDoc(collection(db, "venues"), {
      title,
      location,
      budget: Number(budget),
      description,
      images: imageUrls,
      createdAt: serverTimestamp()
    });

    message.textContent = "✅ Venue added successfully!";
    form.reset();
  } catch (err) {
    console.error(err);
    message.textContent = "❌ Error: " + err.message;
  }
});




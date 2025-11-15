// admin-panel/js/add-venue.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadFileList } from "./cloudinary.js";

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
  const imagesInput = document.getElementById("images");
  const files = imagesInput ? imagesInput.files : [];
  const submitBtn = form.querySelector('[type="submit"]');

  if (!title || !location || !budget || !description) {
    message.textContent = "⚠️ Please fill in every field.";
    return;
  }

  if (!files || files.length === 0) {
    message.textContent = "⚠️ Select at least one image to upload.";
    return;
  }

  const budgetValue = Number(budget);
  if (Number.isNaN(budgetValue)) {
    message.textContent = "⚠️ Budget must be a valid number.";
    return;
  }

  try {
    message.textContent = "⏳ Uploading images to Cloudinary...";
    message.classList.remove("text-success");
    message.classList.remove("text-danger");
    message.classList.add("text-info");
    if (submitBtn) submitBtn.disabled = true;

    const imageUrls = await uploadFileList(files, { folder: "venues" });

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
      budget: budgetValue,
      description,
      images: imageUrls,
      createdAt: serverTimestamp()
    });

    message.textContent = "✅ Venue added successfully!";
    message.classList.remove("text-info");
    message.classList.remove("text-danger");
    message.classList.add("text-success");
    form.reset();
  } catch (err) {
    console.error(err);
    message.textContent = "❌ Error: " + err.message;
    message.classList.remove("text-info");
    message.classList.remove("text-success");
    message.classList.add("text-danger");
  }
  finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});




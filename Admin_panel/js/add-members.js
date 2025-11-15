import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadImageToCloudinary } from "./cloudinary.js";

const form = document.getElementById("memberForm");
const logoutBtn = document.getElementById("logoutBtn");
const message = document.getElementById("message");

// 🔐 Auth check
onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "index.html";
});

// 🚪 Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// 🏗️ Add Team Member
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const designation = document.getElementById("designation").value.trim();
  const bio = document.getElementById("bio").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const email = document.getElementById("email").value.trim();
  const facebook = document.getElementById("facebook").value.trim();
  const instagram = document.getElementById("instagram").value.trim();
  const photoInput = document.getElementById("photo");
  const photoFile = photoInput ? photoInput.files[0] : undefined;
  const submitBtn = form.querySelector('[type="submit"]');

  if (!name || !designation) {
    message.textContent = "⚠️ Please provide at least Name and Designation!";
    return;
  }

  if (!photoFile) {
    message.textContent = "⚠️ Please upload a profile photo.";
    return;
  }

  try {
    message.textContent = "⏳ Uploading profile photo...";
    message.classList.remove("text-success");
    message.classList.remove("text-danger");
    message.classList.add("text-info");
    if (submitBtn) submitBtn.disabled = true;

    const photoURL = await uploadImageToCloudinary(photoFile, { folder: "team" });

    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    await addDoc(collection(db, "teamMembers"), {
      name,
      designation,
      bio,
      phone: phone || null,
      email: email || null,
      facebook: facebook || null,
      instagram: instagram || null,
      photoURL,
      createdAt: serverTimestamp()
    });

    message.textContent = "✅ Team member added successfully!";
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
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

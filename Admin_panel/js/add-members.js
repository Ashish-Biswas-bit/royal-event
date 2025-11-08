import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
  const photoURL = document.getElementById("photoURL").value.trim();

  if (!name || !designation) {
    message.textContent = "⚠️ Please provide at least Name and Designation!";
    return;
  }

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    await addDoc(collection(db, "teamMembers"), {
      name,
      designation,
      bio,
      photoURL,
      createdAt: serverTimestamp()
    });

    message.textContent = "✅ Team member added successfully!";
    form.reset();
  } catch (err) {
    console.error(err);
    message.textContent = "❌ Error: " + err.message;
  }
});

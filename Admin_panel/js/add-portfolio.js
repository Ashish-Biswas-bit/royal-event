import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const form = document.getElementById("portfolioForm");
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

// 🏗️ Add Portfolio
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const imageURLs = document.getElementById("imageURL").value.trim().split(",").map(u => u.trim()).filter(Boolean);
  const client = document.getElementById("client").value.trim();
  const category = document.getElementById("category").value.trim();
  const date = document.getElementById("date").value;

  if (!title || !description || imageURLs.length === 0) {
    message.textContent = "⚠️ Fill all fields with at least one image URL!";
    return;
  }

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    await addDoc(collection(db, "portfolio"), {
      title,
      description,
      images: imageURLs,
      client,
      category,
      date,
      createdAt: serverTimestamp()
    });

    message.textContent = "✅ Portfolio added successfully!";
    form.reset();
  } catch (err) {
    console.error(err);
    message.textContent = "❌ Error: " + err.message;
  }
});

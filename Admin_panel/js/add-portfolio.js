import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadFileList } from "./cloudinary.js";

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
  const imageInput = document.getElementById("portfolioImages");
  const files = imageInput ? imageInput.files : [];
  const client = document.getElementById("client").value.trim();
  const category = document.getElementById("category").value.trim();
  const date = document.getElementById("date").value;
  const submitBtn = form.querySelector('[type="submit"]');

  if (!title || !description) {
    message.textContent = "⚠️ Please complete the required fields.";
    return;
  }

  if (!files || files.length === 0) {
    message.textContent = "⚠️ Upload at least one portfolio image.";
    return;
  }

  try {
    message.textContent = "⏳ Uploading portfolio images...";
    message.classList.remove("text-success");
    message.classList.remove("text-danger");
    message.classList.add("text-info");
    if (submitBtn) submitBtn.disabled = true;

    const imageURLs = await uploadFileList(files, { folder: "portfolio" });

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

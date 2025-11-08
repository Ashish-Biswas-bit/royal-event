// admin-panel/js/auth.js
import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const loginBtn = document.getElementById("loginBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMsg = document.getElementById("errorMsg");

loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    errorMsg.textContent = "Please fill in both fields.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // redirect
    window.location.href = "dashboard.html";
  } catch (error) {
    errorMsg.textContent = "⚠️ " + error.message;
  }
});

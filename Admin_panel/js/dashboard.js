// admin-panel/js/dashboard.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Logout Button
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// Auth Protection
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    console.log("Logged in as:", user.email);
    await loadDashboardData();
  }
});

async function loadDashboardData() {
  const venueSnap = await getDocs(collection(db, "venues"));
  const bookingSnap = await getDocs(collection(db, "bookings"));
  const portfolioSnap = await getDocs(collection(db, "portfolio"));
  const membersSnap = await getDocs(collection(db, "teamMembers"));

  document.getElementById("venueCount").innerText = venueSnap.size;
  document.getElementById("bookingCount").innerText = bookingSnap.size;
  document.getElementById("portfolioCount").innerText = portfolioSnap.size;
  document.getElementById("memberCount").innerText = membersSnap.size;
}

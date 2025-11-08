import { db } from "./firebase.js";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const venueId = params.get("id");

const container = document.getElementById("venueDetail");
const bookingForm = document.getElementById("bookingForm");
const bookingMessage = document.getElementById("bookingMessage");

async function loadVenue() {
  if (!venueId) return;
  const snap = await getDoc(doc(db, "venues", venueId));
  if (!snap.exists()) return container.innerHTML = "<p>Venue not found.</p>";
  const data = snap.data();
  const imagesHtml = (data.images || []).map(url => `<img src="${url}" class="img-fluid mb-2 me-2" style="max-height:200px;">`).join("");
  container.innerHTML = `
    <h2>${data.title}</h2>
    <p><strong>Location:</strong> ${data.location}</p>
    <p><strong>Budget:</strong> ${data.budget}</p>
    <p>${data.description}</p>
    <div class="d-flex flex-wrap">${imagesHtml}</div>
  `;
}

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const date = document.getElementById("date").value;
  const notes = document.getElementById("notes").value.trim();

  if (!name || !email || !phone || !date) return bookingMessage.textContent = "⚠️ Please fill all required fields!";
  
  await addDoc(collection(db, "bookings"), {
    venueId, name, email, phone, date, notes, createdAt: serverTimestamp()
  });
  
  bookingMessage.textContent = "✅ Booking submitted successfully!";
  bookingForm.reset();
});

loadVenue();

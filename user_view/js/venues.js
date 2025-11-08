import { db } from "./firebase.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const container = document.getElementById("venuesContainer");

async function loadVenues() {
  const q = query(collection(db, "venues"), orderBy("createdAt", "desc"));
  const snaps = await getDocs(q);
  snaps.forEach(doc => {
    const data = doc.data();
    const img = data.images?.[0] || "images/placeholder.jpg";
    container.insertAdjacentHTML("beforeend", `
      <div class="col-md-4 mb-4">
        <div class="card shadow-sm">
          <img src="${img}" class="card-img-top" alt="${data.title}">
          <div class="card-body">
            <h5 class="card-title">${data.title}</h5>
            <p class="card-text">Budget: ${data.budget} | Location: ${data.location}</p>
            <a href="venue-detail.html?id=${doc.id}" class="btn btn-outline-primary">View Details</a>
          </div>
        </div>
      </div>
    `);
  });
}

loadVenues();

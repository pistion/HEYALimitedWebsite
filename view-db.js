import { dbOps } from "./db.js";

console.log("\n=== CONTACT ENQUIRIES ===");
console.table(dbOps.getContactEnquiries());

console.log("\n=== VACANCY REQUESTS ===");
console.table(dbOps.getVacancyEnquiries());

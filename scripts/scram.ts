/**
 * Prints the SQL to give valk_app a new password as a SCRAM-SHA-256 verifier,
 * so the password itself never reaches the database or its logs.
 *
 *   npm run --silent scram -- '<nieuw wachtwoord>'
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 16) {
  console.error("Geef een wachtwoord van minstens 16 tekens.");
  process.exit(1);
}

const iterations = 4096;
const salt = randomBytes(16);
const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
const clientKey = createHmac("sha256", salted).update("Client Key").digest();
const storedKey = createHash("sha256").update(clientKey).digest();
const serverKey = createHmac("sha256", salted).update("Server Key").digest();
const verifier = `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
console.log(`alter role valk_app password '${verifier}';`);

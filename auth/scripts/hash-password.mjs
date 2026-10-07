// Makes the stored form of an editor's password for SIMPLE_USERS.
//   node auth/scripts/hash-password.mjs priya
// Asks for the password without showing it (or reads it from standard input), and prints:
//   "priya": "pbkdf2-sha256$100000$…$…"
// Add that line to the SIMPLE_USERS secret. The password itself is never printed or saved.
import { hashPassword } from "../src/crypto.js";

const user = process.argv[2];
if (!user || !/^[A-Za-z0-9._@-]{2,64}$/.test(user)) {
  console.error("usage: node auth/scripts/hash-password.mjs <username>   (letters, numbers, . _ @ -)");
  process.exit(1);
}

async function readPassword() {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let data = "";
    for await (const chunk of stdin) data += chunk;
    return data.replace(/\r?\n$/, "");
  }
  process.stderr.write("Password (not shown): ");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let pw = "";
    stdin.on("data", (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") { stdin.setRawMode(false); stdin.pause(); process.stderr.write("\n"); resolve(pw); }
      else if (ch === "\u0003") process.exit(130);
      else if (ch === "\u007f") pw = pw.slice(0, -1);
      else pw += ch;
    });
  });
}

const pw = await readPassword();
if (pw.length < 12) {
  console.error("Use a password of at least 12 characters.");
  process.exit(1);
}
console.log(`${JSON.stringify(user)}: ${JSON.stringify(await hashPassword(pw))}`);

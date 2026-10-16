
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);

export const validRoomPassword = (password) =>
  typeof password === "string" &&
  password.length >= 6 &&
  password.length <= 128 &&
  password.trim().length >= 6;

export async function hashRoomPassword(password) {
  const salt = randomBytes(16).toString("hex");

  const key = await deriveKey(password, salt, 64);

  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyRoomPassword(password, stored) {
  if (!stored) return true;

  if (!validRoomPassword(password)) return false;

  const [algorithm, salt, hash] = stored.split(":");

  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(hash)
  ) {
    return false;
  }

  const key = await deriveKey(password, salt, 64);

  return timingSafeEqual(
    key,
    Buffer.from(hash, "hex")
  );
}

// Hanya field publik yang dikirim ke frontend.
// Password hash dan hostUid tidak diekspos.
export function publicRoom(room) {
  return Object.fromEntries([
    ...[
      "id",
      "meetingId", // NEW: Meeting ID numerik
      "name",
      "mode",
      "theme",
      "status",
      "createdAt",
      "startedAt",
      "parentRoomId",
      "breakoutIds",
    ]
      .filter((key) => room[key] !== undefined)
      .map((key) => [key, room[key]]),

    [
      "passwordProtected",
      Boolean(room.passwordHash),
    ],
  ]);
}

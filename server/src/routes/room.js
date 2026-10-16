import { Router } from "express";
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { db } from "../config/firebase.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { validRoom } from "../config/roomCatalog.js";
import {
  createLiveKitToken,
  getLiveKitRoomService,
  muteParticipant,
} from "../services/livekit.service.js";
import { requireFullAccess, getAccount } from "../services/account.service.js";
import {
  createRoom,
  startRoom,
  generateMeetingId,
  getRoomByMeetingId,
  ensureMeetingId,
} from "../services/room.service.js";
import {
  hashRoomPassword,
  verifyRoomPassword,
  validRoomPassword,
  publicRoom,
} from "../services/roomPassword.service.js";

const router = Router();
router.use(optionalAuth);
const clean = (s, limit) =>
  typeof s === "string" ? s.trim().slice(0, limit) : "";
const digest = (s) => createHash("sha256").update(s).digest("hex");
const match = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const roomRef = (id) => db.collection("rooms").doc(id);
const reqRef = (id, rid) => roomRef(id).collection("joinRequests").doc(rid);
const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });
const validId = (id) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const validSecret = (secret) =>
  typeof secret === "string" && /^[0-9a-f]{64}$/.test(secret);

for (const parameter of ["roomId", "requestId"]) {
  router.param(parameter, (req, res, next, value) => {
    if (!validId(value)) return fail(res, 400, `Invalid ${parameter}`);
    next();
  });
}

// Look up a numeric Meeting ID without bypassing existing approval.
// Add rate limiting to this endpoint before deploying publicly.
router.get("/by-code/:meetingId", async (req, res) => {
  try {
    const code = req.params.meetingId.replace(/[\s-]/g, "");
    if (!/^\d{10}$/.test(code))
      return fail(res, 400, "Meeting ID harus 10 digit angka");
    const room = await getRoomByMeetingId(code);
    if (!room)
      return fail(res, 404, "Meeting tidak ditemukan atau telah berakhir");
    res.json({
      success: true,
      data: { roomId: room.id, meetingId: room.meetingId },
    });
  } catch (error) {
    console.error("Resolve meeting code:", error);
    fail(res, 500, "Gagal mencari Meeting ID");
  }
});

// Only Firebase-authenticated users can create rooms.
router.post("/", requireAuth, requireFullAccess, async (req, res) => {
  try {
    const { name, mode, theme, password } = req.body ?? {};
    const safeName = clean(name, 80);
    if (!safeName || typeof name !== "string" || name.trim().length > 80)
      return fail(res, 400, "Invalid room name (1–80 characters)");
    if (!validRoom(mode, theme))
      return fail(res, 400, "Invalid mode or mood for selected mode");
    if (
      password !== undefined &&
      password !== "" &&
      !validRoomPassword(password)
    )
      return fail(
        res,
        400,
        "Password room harus 6–128 karakter, bukan hanya spasi.",
      );
    const passwordHash = password
      ? await hashRoomPassword(password)
      : undefined;
    const data = await createRoom({
      name: safeName,
      mode,
      theme,
      hostUid: req.user.uid,
      passwordHash,
    });
    res.status(201).json({ success: true, data: publicRoom(data) });
  } catch (e) {
    console.error("Create room:", e);
    fail(res, 500, "Could not create room");
  }
});

router.get("/:roomId", async (req, res) => {
  try {
    const doc = await roomRef(req.params.roomId).get();
    if (!doc.exists || doc.data().status !== "active")
      return fail(res, 404, "Room not found");
    const room = doc.data().meetingId ? doc.data() : await ensureMeetingId(req.params.roomId);
    if (!room || room.status !== 'active') return fail(res, 404, 'Room not found');
    res.json({
      success: true,
      data: publicRoom(room),
      serverNow: Date.now(),
    });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not fetch room");
  }
});

// Public guests can request admission but receive NO LiveKit token yet.
router.post("/:roomId/join-requests", async (req, res) => {
  try {
    const name = clean(req.body?.participantName, 50);
    if (
      !name ||
      typeof req.body?.participantName !== "string" ||
      req.body.participantName.trim().length > 50
    )
      return fail(res, 400, "Participant name must be 1–50 characters");
    const room = await roomRef(req.params.roomId).get();
    if (!room.exists || room.data().status !== "active")
      return fail(res, 404, "Room not found");
    if (
      !(await verifyRoomPassword(req.body?.password, room.data().passwordHash))
    )
      return fail(
        res,
        403,
        "Password room belum cocok. Minta password yang benar kepada host.",
      );
    const requestId = randomUUID(),
      guestSecret = randomBytes(32).toString("hex");
    await reqRef(req.params.roomId, requestId).set({
      id: requestId,
      participantName: name,
      secretHash: digest(guestSecret),
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    res
      .status(201)
      .json({
        success: true,
        data: { requestId, guestSecret, status: "pending" },
      });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not request admission");
  }
});

// Polling requests must prove possession of the guest secret.
async function guestRequest(req, res, credentials = {}) {
  const { roomId } = req.params;
  const requestId = credentials.requestId || req.params.requestId;
  const secret =
    credentials.guestSecret || req.headers["x-meetspace-guest-secret"];
  if (!validId(requestId) || !validSecret(secret)) {
    fail(res, 403, "Host approval required");
    return null;
  }
  const doc = await reqRef(roomId, requestId).get();
  if (
    !doc.exists ||
    !validSecret(secret) ||
    !match(digest(secret), doc.data().secretHash)
  ) {
    fail(res, 404, "Request not found");
    return null;
  }
  if (doc.data().expiresAt <= Date.now()) {
    fail(res, 410, "Request expired");
    return null;
  }
  return doc;
}
router.get("/:roomId/join-requests/:requestId/status", async (req, res) => {
  try {
    const doc = await guestRequest(req, res);
    if (doc) res.json({ success: true, data: { status: doc.data().status } });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Unable to read request status");
  }
});

// Host can see and decide requests; ownership checked by Firebase UID.
async function hostRoom(req, res) {
  const doc = await roomRef(req.params.roomId).get();
  if (!doc.exists || doc.data().status !== "active") {
    fail(res, 404, "Room not found");
    return null;
  }
  if (doc.data().hostUid !== req.user.uid) {
    fail(res, 403, "Host permission required");
    return null;
  }
  if ((await getAccount(req.user.uid)).access !== "full") {
    fail(res, 403, "Akses host telah dicabut. Hubungi admin.");
    return null;
  }
  return doc;
}
router.get("/:roomId/join-requests", requireAuth, async (req, res) => {
  try {
    if (!(await hostRoom(req, res))) return;
    const docs = await roomRef(req.params.roomId)
      .collection("joinRequests")
      .where("status", "==", "pending")
      .get();
    const requests = docs.docs
      .filter((d) => d.data().expiresAt > Date.now())
      .sort((a, b) => a.data().createdAt - b.data().createdAt)
      .slice(0, 100);
    res.json({
      success: true,
      data: requests.map((d) => ({
        id: d.id,
        participantName: d.data().participantName,
        createdAt: d.data().createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Unable to list join requests");
  }
});
router.patch(
  "/:roomId/join-requests/:requestId",
  requireAuth,
  async (req, res) => {
    try {
      if (!(await hostRoom(req, res))) return;
      const status = req.body?.status;
      if (!["approved", "rejected"].includes(status))
        return fail(res, 400, "Invalid decision");
      const ref = reqRef(req.params.roomId, req.params.requestId);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return "missing";
        if (
          snap.data().status !== "pending" ||
          snap.data().expiresAt <= Date.now()
        )
          return "closed";
        tx.update(ref, {
          status,
          decidedAt: Date.now(),
          decidedBy: req.user.uid,
        });
        return "ok";
      });
      if (result === "missing") return fail(res, 404, "Request not found");
      if (result === "closed")
        return fail(res, 409, "Request already handled or expired");
      res.json({ success: true, data: { status } });
    } catch (e) {
      console.error(e);
      fail(res, 500, "Could not decide request");
    }
  },
);

// Only the host or a guest holding a current approval can receive a token.
router.post("/:roomId/token", async (req, res) => {
  try {
    const id = req.params.roomId;
    const doc = await roomRef(id).get();
    if (!doc.exists || doc.data().status !== "active")
      return fail(res, 404, "Room not found");
    const isHost = Boolean(req.user && req.user.uid === doc.data().hostUid);
    let credentials;
    if (isHost) {
      if ((await getAccount(req.user.uid)).access !== "full")
        return fail(
          res,
          403,
          "Akses host belum aktif. Hubungi admin untuk mengaktifkan akun.",
        );
      const participantName =
        clean(req.body?.participantName, 50) ||
        clean(req.user.name || "Host", 50);
      credentials = await createLiveKitToken({
        roomId: id,
        participantName,
        identity: `host-${req.user.uid}`,
        mode: doc.data().mode,
      });
    } else {
      const requestId = req.body?.requestId,
        guestSecret = req.body?.guestSecret;
      if (!validId(requestId) || !validSecret(guestSecret))
        return fail(res, 403, "Waiting room approval required");
      const ref = reqRef(id, requestId);
      // Serializes token issuance with approval revocation on this request.
      credentials = await db.runTransaction(async (tx) => {
        const guest = await tx.get(ref);
        if (
          !guest.exists ||
          !match(digest(guestSecret), guest.data().secretHash) ||
          guest.data().status !== "approved" ||
          guest.data().expiresAt <= Date.now()
        )
          return null;
        if (doc.data().parentRoomId && guest.data().parentRequestId) {
          const parent = await tx.get(roomRef(doc.data().parentRoomId));
          const parentGuest = await tx.get(
            reqRef(doc.data().parentRoomId, guest.data().parentRequestId),
          );
          if (
            parent.data()?.status !== "active" ||
            parentGuest.data()?.status !== "approved" ||
            parentGuest.data().expiresAt <= Date.now()
          )
            return null;
        }
        const token = await createLiveKitToken({
          roomId: id,
          participantName: guest.data().participantName,
          identity: `guest-${requestId}`,
          mode: doc.data().mode,
        });
        tx.update(ref, { lastTokenIssuedAt: Date.now() });
        return token;
      });
      if (!credentials)
        return fail(res, 403, "Host approval required or expired");
    }
    const started = await startRoom(id);
    if (!started) return fail(res, 404, "Room not found");
    const latest = started.meetingId ? started : await ensureMeetingId(id);
    if (!latest || latest.status !== 'active') return fail(res, 404, 'Room not found');
    const room = { ...publicRoom(latest), hostIdentity: `host-${latest.hostUid}` };
    res.json({
      success: true,
      data: { ...credentials, room, isHost, serverNow: Date.now() },
    });
  } catch (e) {
    console.error("Token:", e);
    fail(res, 500, "Could not create LiveKit token");
  }
});
router.get("/:roomId/my-role", async (req, res) => {
  try {
    const doc = await roomRef(req.params.roomId).get();
    if (!doc.exists || doc.data().status !== "active")
      return fail(res, 404, "Room not found");
    res.json({
      success: true,
      data: {
        isHost: Boolean(req.user?.uid && req.user.uid === doc.data().hostUid),
      },
    });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not fetch room role");
  }
});

// Host controls are authoritative server actions, never peer chat commands.
router.post(
  "/:roomId/participants/:identity/actions",
  requireAuth,
  async (req, res) => {
    let revoked = false;
    try {
      const room = await hostRoom(req, res);
      if (!room) return;
      if (room.data().mode !== "professional")
        return fail(
          res,
          400,
          "Host controls are available in Professional rooms",
        );
      const { roomId, identity } = req.params;
      const action = req.body?.action;
      if (!["mute", "lower-hand", "remove"].includes(action))
        return fail(res, 400, "Invalid host action");
      if (!identity.startsWith("guest-") || !validId(identity.slice(6)))
        return fail(res, 400, "Select a guest participant");
      const service = getLiveKitRoomService();
      if (action === "remove") {
        const ref = reqRef(roomId, identity.slice(6));
        const result = await db.runTransaction(async (tx) => {
          const guest = await tx.get(ref);
          if (!guest.exists) return "missing";
          if (!["approved", "revoked"].includes(guest.data().status))
            return "closed";
          tx.update(ref, {
            status: "revoked",
            revokedAt: Date.now(),
            revokedBy: req.user.uid,
          });
          return "ok";
        });
        if (result === "missing") return fail(res, 404, "Guest not found");
        if (result === "closed")
          return fail(res, 409, "Guest has no approval to revoke");
        revoked = true;
        try {
          await service.removeParticipant(roomId, identity, {
            revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1),
          });
        } catch (e) {
          if (e.code !== "not_found" && e.status !== 404) throw e;
        }
      } else if (action === "lower-hand") {
        await service.updateParticipant(roomId, identity, {
          attributes: { "meetspace.handRaised": "" },
        });
      } else {
        const participant = await service.getParticipant(roomId, identity);
        await muteParticipant(service, roomId, participant);
      }
      res.json({ success: true, data: { action, identity } });
    } catch (e) {
      console.error("Host control:", e);
      fail(
        res,
        502,
        revoked
          ? "Approval revoked, but disconnection failed. Retry Remove."
          : "Could not update participant. Please retry.",
      );
    }
  },
);

router.post("/:roomId/mute-all", requireAuth, async (req, res) => {
  try {
    const room = await hostRoom(req, res);
    if (!room) return;
    if (room.data().mode !== "professional")
      return fail(
        res,
        400,
        "Host controls are available in Professional rooms",
      );
    const service = getLiveKitRoomService();
    const participants = await service.listParticipants(req.params.roomId);
    const results = await Promise.allSettled(
      participants
        .filter((p) => p.identity.startsWith("guest-"))
        .map((p) => muteParticipant(service, req.params.roomId, p)),
    );
    if (results.some((r) => r.status === "rejected"))
      return fail(res, 502, "Some guests could not be muted. Please retry.");
    res.json({ success: true });
  } catch (e) {
    console.error("Mute all:", e);
    fail(res, 502, "Could not mute guests. Please retry.");
  }
});

async function admittedRoom(req, res) {
  const room = await roomRef(req.params.roomId).get();
  if (!room.exists || room.data().status !== "active") {
    fail(res, 404, "Room not found");
    return null;
  }
  if (req.user?.uid === room.data().hostUid) return { room, guest: null };
  const guest = await guestRequest(req, res, {
    requestId: req.body?.requestId || req.headers["x-meetspace-request-id"],
    guestSecret:
      req.body?.guestSecret || req.headers["x-meetspace-guest-secret"],
  });
  if (!guest) return null;
  if (guest.data().status !== "approved") {
    fail(res, 403, "Host approval required");
    return null;
  }
  return { room, guest };
}
router.get("/:roomId/breakouts", async (req, res) => {
  try {
    const membership = await admittedRoom(req, res);
    if (!membership) return;
    const children = await Promise.all(
      (membership.room.data().breakoutIds || []).map((id) => roomRef(id).get()),
    );
    res.json({
      success: true,
      data: children
        .filter((doc) => doc.exists && doc.data().status === "active")
        .map((doc) => ({ id: doc.id, name: doc.data().name })),
    });
  } catch (error) {
    console.error("Breakouts:", error);
    fail(res, 503, "Daftar breakout room belum bisa dimuat.");
  }
});
router.post("/:roomId/breakouts", requireAuth, async (req, res) => {
  try {
    const parent = await hostRoom(req, res);
    if (!parent) return;
    if (parent.data().parentRoomId || parent.data().mode !== "professional")
      return fail(res, 400, "Buat breakout dari room Professional utama.");
    const count = req.body?.count;
    if (!Number.isInteger(count) || count < 1 || count > 6)
      return fail(res, 400, "Pilih 1–6 breakout room.");
    // Fetch all index documents before any transaction write.
    let created = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const codes = Array.from({ length: count }, generateMeetingId);
      if (new Set(codes).size !== codes.length) continue;
      const result = await db.runTransaction(async (tx) => {
        const latest = await tx.get(roomRef(req.params.roomId));
        if (!latest.exists || latest.data().status !== "active")
          return { status: "closed" };
        const ids = latest.data().breakoutIds || [];
        if (ids.length + count > 6) return { status: "closed" };
        const codeDocs = await Promise.all(
          codes.map((code) => tx.get(db.collection("meetingCodes").doc(code))),
        );
        if (codeDocs.some((doc) => doc.exists)) return { status: "collision" };
        const rooms = [];
        for (let i = 0; i < count; i++) {
          rooms.push(
            await createRoom(
              {
                name: `${latest.data().name.slice(0, 55)} · Grup ${ids.length + i + 1}`,
                mode: "professional",
                theme: latest.data().theme,
                hostUid: req.user.uid,
                parentRoomId: parent.id,
                passwordHash: latest.data().passwordHash,
                meetingId: codes[i],
              },
              tx,
            ),
          );
        }
        tx.update(roomRef(parent.id), {
          breakoutIds: [...ids, ...rooms.map((room) => room.id)],
        });
        return {
          status: "ok",
          rooms: rooms.map((room) => ({
            id: room.id,
            name: room.name,
            meetingId: room.meetingId,
          })),
        };
      });
      if (result.status === "closed") break;
      if (result.status === "ok") {
        created = result.rooms;
        break;
      }
    }
    if (!created)
      return fail(
        res,
        409,
        "Room ditutup atau maksimal 6 breakout room sudah dibuat.",
      );
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("Create breakouts:", error);
    fail(res, 503, "Breakout room belum berhasil dibuat.");
  }
});
router.post("/:roomId/breakouts/:breakoutId/join", async (req, res) => {
  try {
    if (!validId(req.params.breakoutId))
      return fail(res, 400, "Invalid breakout room");
    const membership = await admittedRoom(req, res);
    if (!membership) return;
    const child = await roomRef(req.params.breakoutId).get();
    if (
      !child.exists ||
      child.data().parentRoomId !== req.params.roomId ||
      child.data().status !== "active"
    )
      return fail(res, 404, "Breakout room tidak tersedia.");
    if (!membership.guest)
      return res.json({ success: true, data: { roomId: child.id } });
    const requestId = randomUUID(),
      guestSecret = randomBytes(32).toString("hex"),
      parentGuest = membership.guest.data();
    await reqRef(child.id, requestId).set({
      id: requestId,
      participantName: parentGuest.participantName,
      secretHash: digest(guestSecret),
      status: "approved",
      createdAt: Date.now(),
      expiresAt: parentGuest.expiresAt,
      parentRequestId: membership.guest.id,
    });
    res.json({
      success: true,
      data: {
        roomId: child.id,
        requestId,
        guestSecret,
        participantName: parentGuest.participantName,
      },
    });
  } catch (error) {
    console.error("Join breakout:", error);
    fail(res, 503, "Belum bisa berpindah room. Coba lagi.");
  }
});
router.post("/:roomId/end", requireAuth, async (req, res) => {
  try {
    const doc = await roomRef(req.params.roomId).get();
    if (!doc.exists) return fail(res, 404, "Room not found");
    if (doc.data().hostUid !== req.user.uid)
      return fail(res, 403, "Host permission required");
    // Close admission first; retrying this endpoint is safe after a provider failure.
    const ids = await db.runTransaction(async (tx) => {
      const latest = await tx.get(roomRef(doc.id));
      const ids = [...(latest.data().breakoutIds || []), doc.id];
      ids.forEach((id) =>
        tx.update(roomRef(id), { status: "closed", endedAt: Date.now() }),
      );
      return ids;
    });
    const service = getLiveKitRoomService();
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        try {
          await service.deleteRoom(id);
        } catch (error) {
          if (error.code !== "not_found" && error.status !== 404) throw error;
        }
      }),
    );
    if (results.some((r) => r.status === "rejected"))
      return fail(
        res,
        502,
        "Room ditutup untuk peserta baru, tetapi sebagian koneksi belum terputus. Coba akhiri lagi.",
      );
    res.json({ success: true });
  } catch (error) {
    console.error("End room:", error);
    fail(res, 503, "Room belum berhasil diakhiri.");
  }
});
export default router;

import { Router } from "express";
import { TrackSource, DataPacket_Kind } from 'livekit-server-sdk';
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
  participantPermission,
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
import { meetingIcs, normalizeSchedule, nextScheduledAt } from '../services/meetingSchedule.service.js';

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
const roomSecurity = (room) => ({ locked: false, muteOnEntry: false, allowScreenShare: true, allowChat: true, ...(room.security || {}) });

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
    const { name, mode, theme, password, schedule: requestedSchedule } = req.body ?? {};
    const safeName = clean(name, 80);
    if (!safeName || typeof name !== "string" || name.trim().length > 80)
      return fail(res, 400, "Invalid room name (1–80 characters)");
    if (!validRoom(mode, theme))
      return fail(res, 400, "Invalid mode or mood for selected mode");
    const schedule = normalizeSchedule(requestedSchedule);
    if (requestedSchedule != null && (mode !== 'professional' || !schedule))
      return fail(res, 400, 'Jadwal hanya tersedia untuk Professional dan harus valid.');
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
      schedule,
    });
    res.status(201).json({ success: true, data: publicRoom(data) });
  } catch (e) {
    console.error("Create room:", e);
    fail(res, 500, "Could not create room");
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const snap = await db.collection('rooms').where('hostUid', '==', req.user.uid).limit(100).get();
    const rooms = snap.docs.map((doc) => doc.data()).filter((room) => room.status === 'active' && !room.parentRoomId)
      .map((room) => ({ ...publicRoom(room), nextAt: nextScheduledAt(room.schedule) }))
      .sort((a, b) => (a.nextAt ?? Infinity) - (b.nextAt ?? Infinity));
    res.json({ success: true, data: rooms });
  } catch (error) {
    console.error('My rooms:', error);
    fail(res, 503, 'Daftar room belum bisa dimuat.');
  }
});

router.get('/:roomId/calendar.ics', async (req, res) => {
  try {
    const snap = await roomRef(req.params.roomId).get();
    if (!snap.exists || snap.data().status !== 'active' || !snap.data().schedule)
      return fail(res, 404, 'Undangan kalender tidak tersedia.');
    const origin = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
    const calendar = meetingIcs(snap.data(), origin);
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="meetspace-${req.params.roomId}.ics"`);
    res.send(calendar);
  } catch (error) {
    console.error('Meeting calendar:', error);
    fail(res, 503, 'Undangan kalender belum bisa dibuat.');
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
    if (room.data().sessionClosing) return fail(res, 423, 'Sesi sedang diakhiri host. Coba lagi sebentar.');
    if (roomSecurity(room.data()).locked)
      return fail(res, 423, 'Meeting dikunci host. Peserta baru belum dapat meminta bergabung.');
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
      ...(req.user?.uid ? { userUid: req.user.uid } : {}),
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

// Co-host is a room-scoped grant tied to a current, approved admission.
async function approvedCoHost(roomId, room, uid) {
  if (!uid || !(room.coHostUids || []).includes(uid)) return false;
  const requestIds = room.coHostRequestIds || [];
  const requests = await Promise.all(requestIds.map((id) => reqRef(roomId, id).get()));
  return requests.some((request) => request.exists &&
    request.data().userUid === uid &&
    request.data().status === 'approved' &&
    request.data().expiresAt > Date.now());
}

// Host can see and decide requests; ownership checked by Firebase UID.
async function hostRoom(req, res) {
  const doc = await roomRef(req.params.roomId).get();
  if (!doc.exists || doc.data().status !== "active") {
    fail(res, 404, "Room not found");
    return null;
  }
  if (doc.data().hostUid === req.user.uid) {
    if ((await getAccount(req.user.uid)).access !== "full") {
      fail(res, 403, "Akses host telah dicabut. Hubungi admin.");
      return null;
    }
  } else if (!(await approvedCoHost(doc.id, doc.data(), req.user.uid))) {
    fail(res, 403, "Izin co-host tidak aktif atau persetujuan peserta telah berakhir.");
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
          ...(status === 'approved' ? { expiresAt: Date.now() + 12 * 60 * 60_000 } : {}),
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
    if (!doc.exists || doc.data().status !== "active" || doc.data().sessionClosing)
      return fail(res, 404, "Room not found");
    const isOwner = Boolean(req.user && req.user.uid === doc.data().hostUid);
    let credentials;
    if (isOwner) {
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
        isModerator: true,
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
        const latestRoom = await tx.get(roomRef(id));
        if (
          !guest.exists ||
          !latestRoom.exists ||
          latestRoom.data().status !== 'active' ||
          latestRoom.data().sessionClosing ||
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
        const coHostForToken = Boolean(req.user?.uid && guest.data().userUid === req.user.uid &&
          (latestRoom.data().coHostUids || []).includes(req.user.uid) &&
          (latestRoom.data().coHostRequestIds || []).includes(requestId));
        if (roomSecurity(latestRoom.data()).locked && !guest.data().lastTokenIssuedAt && !coHostForToken) return null;
        const token = await createLiveKitToken({
          roomId: id,
          participantName: guest.data().participantName,
          identity: `guest-${requestId}`,
          mode: latestRoom.data().mode,
          security: latestRoom.data().security,
          isModerator: coHostForToken,
          attributes: coHostForToken ? { 'meetspace.coHost': 'true' } : undefined,
        });
        tx.update(ref, { lastTokenIssuedAt: Date.now() });
        return { ...token, coHostForToken };
      });
      if (!credentials)
        return fail(res, 403, "Host approval required or expired");
    }
    const started = await startRoom(id);
    if (!started) return fail(res, 404, "Room not found");
    const latest = started.meetingId ? started : await ensureMeetingId(id);
    if (!latest || latest.status !== 'active') return fail(res, 404, 'Room not found');
    const room = { ...publicRoom(latest), hostIdentity: `host-${latest.hostUid}` };
    const { coHostForToken, ...safeCredentials } = credentials;
    res.json({
      success: true,
      data: { ...safeCredentials, room, isHost: isOwner || !!coHostForToken, isOwner, serverNow: Date.now() },
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
    const isOwner = Boolean(req.user?.uid && req.user.uid === doc.data().hostUid);
    res.json({
      success: true,
      data: {
        isHost: isOwner || await approvedCoHost(doc.id, doc.data(), req.user?.uid),
        isOwner,
      },
    });
  } catch (e) {
    console.error(e);
    fail(res, 500, "Could not fetch room role");
  }
});

router.get('/:roomId/security', requireAuth, async (req, res) => {
  try {
    const room = await hostRoom(req, res);
    if (!room) return;
    if (room.data().mode !== 'professional') return fail(res, 400, 'Security hanya untuk Professional Room.');
    res.json({ success: true, data: {
      ...roomSecurity(room.data()),
      isOwner: room.data().hostUid === req.user.uid,
      coHostIdentities: (room.data().coHostRequestIds || []).map((id) => `guest-${id}`),
    } });
  } catch (error) { console.error('Room security:', error); fail(res, 503, 'Pengaturan room belum dapat dimuat.'); }
});

router.patch('/:roomId/security', requireAuth, async (req, res) => {
  try {
    const room = await hostRoom(req, res);
    if (!room) return;
    if (room.data().mode !== 'professional') return fail(res, 400, 'Security hanya untuk Professional Room.');
    const keys = ['locked', 'muteOnEntry', 'allowScreenShare', 'allowChat'];
    const patch = Object.fromEntries(keys.filter((key) => Object.hasOwn(req.body || {}, key)).map((key) => [key, req.body[key]]));
    if (!Object.keys(patch).length || Object.values(patch).some((value) => typeof value !== 'boolean'))
      return fail(res, 400, 'Pilih pengaturan keamanan yang valid.');
    const next = { ...roomSecurity(room.data()), ...patch };
    await roomRef(room.id).update({ security: next, securityUpdatedAt: Date.now() });
    if (Object.hasOwn(patch, 'allowScreenShare') || Object.hasOwn(patch, 'allowChat')) {
      try {
        const service = getLiveKitRoomService();
        const people = await service.listParticipants(room.id);
        const cohosts = new Set((room.data().coHostRequestIds || []).map((id) => `guest-${id}`));
        const guests = people.filter((person) => person.identity.startsWith('guest-') && !cohosts.has(person.identity));
        const updates = await Promise.allSettled(guests.map(async (person) => {
          await service.updateParticipant(room.id, person.identity, { permission: participantPermission(next) });
          if (patch.allowScreenShare === false) {
            await Promise.all((person.tracks || []).filter((track) => [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO].includes(track.source) && !track.muted)
              .map((track) => service.mutePublishedTrack(room.id, person.identity, track.sid, true)));
          }
        }));
        if (updates.some((item) => item.status === 'rejected')) return fail(res, 502, 'Aturan tersimpan, tetapi beberapa peserta aktif belum diperbarui. Coba simpan lagi.');
      } catch (error) {
        console.error('Update live participant permissions:', error);
        return fail(res, 502, 'Aturan tersimpan, tetapi izin peserta aktif belum diperbarui. Coba simpan lagi.');
      }
    }
    res.json({ success: true, data: next });
  } catch (error) { console.error('Update room security:', error); fail(res, 503, 'Pengaturan keamanan belum tersimpan.'); }
});

router.post('/:roomId/cohosts/:identity', requireAuth, async (req, res) => {
  try {
    const room = await roomRef(req.params.roomId).get();
    if (!room.exists || room.data().status !== 'active') return fail(res, 404, 'Room tidak ditemukan.');
    if (room.data().hostUid !== req.user.uid) return fail(res, 403, 'Hanya pemilik room yang dapat mengatur co-host.');
    if ((await getAccount(req.user.uid)).access !== 'full') return fail(res, 403, 'Akses host telah dicabut. Hubungi admin.');
    if (room.data().mode !== 'professional') return fail(res, 400, 'Co-host hanya untuk Professional Room.');
    const identity = req.params.identity;
    if (!identity.startsWith('guest-') || !validId(identity.slice(6))) return fail(res, 400, 'Pilih peserta yang valid.');
    const grant = req.body?.grant;
    if (typeof grant !== 'boolean') return fail(res, 400, 'Aksi co-host tidak valid.');
    const result = await db.runTransaction(async (tx) => {
      const latest = await tx.get(roomRef(room.id));
      if (!latest.exists || latest.data().status !== 'active') return null;
      if (latest.data().hostUid !== req.user.uid) return 'forbidden';
      const guest = await tx.get(reqRef(room.id, identity.slice(6)));
      if (!guest.exists) return 'missing';
      if (!guest.data().userUid) return 'login';
      if (grant && (guest.data().status !== 'approved' || guest.data().expiresAt <= Date.now())) return 'approval';
      const uid = guest.data().userUid;
      const requestId = identity.slice(6);
      const oldUids = latest.data().coHostUids || [];
      const oldRequests = latest.data().coHostRequestIds || [];
      if (grant && !oldUids.includes(uid) && oldUids.length >= 5) return 'limit';
      const coHostUids = grant ? [...new Set([...oldUids, uid])] : oldUids.filter((item) => item !== uid);
      const coHostRequestIds = grant ? [...new Set([...oldRequests, requestId])] : oldRequests.filter((item) => item !== requestId);
      tx.update(roomRef(room.id), { coHostUids, coHostRequestIds });
      return { coHostUids, coHostRequestIds };
    });
    if (!result) return fail(res, 404, 'Room sudah ditutup.');
    if (result === 'forbidden') return fail(res, 403, 'Hanya pemilik room yang dapat mengatur co-host.');
    if (result === 'missing') return fail(res, 404, 'Peserta tidak ditemukan.');
    if (result === 'login') return fail(res, 403, 'Peserta ini bergabung tanpa login. Minta peserta login dan bergabung ulang sebelum dijadikan co-host.');
    if (result === 'approval') return fail(res, 403, 'Persetujuan peserta tidak aktif. Minta peserta bergabung ulang sebelum dijadikan co-host.');
    if (result === 'limit') return fail(res, 409, 'Maksimal lima co-host.');
    try {
      await getLiveKitRoomService().updateParticipant(room.id, identity, {
        attributes: { 'meetspace.coHost': grant ? 'true' : '' },
        permission: grant ? participantPermission({ allowChat: true, allowScreenShare: true }) : participantPermission(roomSecurity(room.data())),
      });
    } catch (error) {
      // The role is durable and polled by the client even if the participant just disconnected.
      if (error.code !== 'not_found' && error.status !== 404) console.error('Update co-host participant:', error);
    }
    res.json({ success: true, data: { identity, grant } });
  } catch (error) { console.error('Co-host:', error); fail(res, 503, 'Peran co-host belum diperbarui.'); }
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
          const latestRoom = await tx.get(roomRef(roomId));
          if (!["approved", "revoked"].includes(guest.data().status))
            return "closed";
          tx.update(ref, {
            status: "revoked",
            revokedAt: Date.now(),
            revokedBy: req.user.uid,
          });
          if (latestRoom.exists && guest.data().userUid && (latestRoom.data().coHostUids || []).includes(guest.data().userUid)) {
            tx.update(roomRef(roomId), {
              coHostUids: (latestRoom.data().coHostUids || []).filter((uid) => uid !== guest.data().userUid),
              coHostRequestIds: (latestRoom.data().coHostRequestIds || []).filter((id) => id !== identity.slice(6)),
            });
          }
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
const chatRef = (roomId, messageId) => roomRef(roomId).collection('chatMessages').doc(messageId);
router.get('/:roomId/chat', async (req, res) => {
  try {
    const membership = await admittedRoom(req, res);
    if (!membership) return;
    const after = Number(req.query?.after || 0);
    if (!Number.isSafeInteger(after) || after < 0 || after > Date.now()) return fail(res, 400, 'Cursor chat tidak valid.');
    const collection = roomRef(req.params.roomId).collection('chatMessages');
    const docs = after
      ? await collection.orderBy('createdAt', 'asc').startAfter(Math.max(after - 1, Date.now() - 24 * 60 * 60_000)).limit(100).get()
      : await collection.orderBy('createdAt', 'desc').limit(100).get();
    const messages = docs.docs.map((doc) => doc.data()).filter((message) => message.expiresAt > Date.now())
      .map(({ id, sender, text, createdAt }) => ({ id, sender, text, createdAt }));
    res.json({ success: true, data: after ? messages : messages.reverse() });
  } catch (error) { console.error('Chat history:', error); fail(res, 503, 'Chat belum bisa dimuat.'); }
});
router.post('/:roomId/chat', async (req, res) => {
  try {
    const membership = await admittedRoom(req, res);
    if (!membership) return;
    const text = clean(req.body?.text, 1000);
    if (!text || typeof req.body?.text !== 'string' || req.body.text.trim().length > 1000) return fail(res, 400, 'Pesan harus berisi 1–1000 karakter.');
    const senderId = membership.guest ? `guest-${membership.guest.id}` : `host-${req.user.uid}`;
    const sender = membership.guest?.data().participantName || clean(req.user?.name, 50) || 'Host';
    const writerRef = roomRef(req.params.roomId).collection('chatWriters').doc(digest(senderId));
    const message = { id: randomUUID(), sender, text, createdAt: Date.now(), expiresAt: Date.now() + 24 * 60 * 60_000 };
    const result = await db.runTransaction(async (tx) => {
      const latestRoom = await tx.get(roomRef(req.params.roomId));
      const latestGuest = membership.guest ? await tx.get(reqRef(req.params.roomId, membership.guest.id)) : null;
      const lastWriter = await tx.get(writerRef);
      if (!latestRoom.exists || latestRoom.data().status !== 'active' || latestRoom.data().sessionClosing) return 'closed';
      if (latestGuest && (latestGuest.data()?.status !== 'approved' || latestGuest.data().expiresAt <= Date.now())) return 'revoked';
      if (roomSecurity(latestRoom.data()).allowChat === false && !isModerator(req, latestRoom.data(), latestGuest)) return 'disabled';
      if (lastWriter.exists && Date.now() - lastWriter.data().at < 500) return 'throttled';
      tx.create(chatRef(req.params.roomId, message.id), message);
      tx.set(writerRef, { at: message.createdAt });
      return 'ok';
    });
    if (result !== 'ok') return fail(res, result === 'throttled' ? 429 : result === 'closed' ? 404 : 403,
      result === 'disabled' ? 'Host menonaktifkan chat peserta.' : result === 'throttled' ? 'Tunggu sebentar sebelum mengirim pesan lagi.' : 'Akses chat tidak tersedia.');
    try {
      await getLiveKitRoomService().sendData(req.params.roomId, new TextEncoder().encode(JSON.stringify({ type: 'chat', message: { id: message.id, sender, text, createdAt: message.createdAt } })), DataPacket_Kind.RELIABLE, { topic: 'meetspace.chat.v1' });
    } catch (error) { console.error('Chat LiveKit delivery failed; history remains available:', error); }
    res.status(201).json({ success: true, data: { id: message.id, sender, text, createdAt: message.createdAt } });
  } catch (error) { console.error('Send chat:', error); fail(res, 503, 'Pesan belum terkirim.'); }
});
const pollRef = (roomId, pollId) => roomRef(roomId).collection('polls').doc(pollId);
const isModerator = (req, room, guest) => Boolean(req.user?.uid &&
  (req.user.uid === room.hostUid || (guest?.exists &&
    (room.coHostUids || []).includes(req.user.uid) &&
    (room.coHostRequestIds || []).includes(guest.id) &&
    guest.data().userUid === req.user.uid &&
    guest.data().status === 'approved' && guest.data().expiresAt > Date.now())));
router.get('/:roomId/polls', async (req, res) => {
  try {
    const membership = await admittedRoom(req, res);
    if (!membership) return;
    if (membership.room.data().mode !== 'professional') return fail(res, 400, 'Polling hanya untuk Professional Room.');
    const moderator = isModerator(req, membership.room.data(), membership.guest);
    const docs = await roomRef(req.params.roomId).collection('polls').get();
    const visible = docs.docs.map((doc) => doc.data()).filter((poll) => poll.createdAt > (membership.room.data().lastSessionEndedAt || 0) && (moderator || poll.status !== 'draft'))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    const voter = membership.guest ? `guest-${membership.guest.id}` : `host-${req.user.uid}`;
    const polls = await Promise.all(visible.map(async (poll) => {
      const vote = await pollRef(req.params.roomId, poll.id).collection('votes').doc(voter).get();
      return { id: poll.id, question: poll.question, options: poll.options, status: poll.status, createdAt: poll.createdAt, counts: poll.counts || poll.options.map(() => 0), voted: vote.exists };
    }));
    res.json({ success: true, data: polls });
  } catch (error) { console.error('Poll list:', error); fail(res, 503, 'Polling belum bisa dimuat.'); }
});
router.post('/:roomId/polls', requireAuth, async (req, res) => {
  try {
    const room = await hostRoom(req, res);
    if (!room) return;
    if (room.data().mode !== 'professional') return fail(res, 400, 'Polling hanya untuk Professional Room.');
    const question = clean(req.body?.question, 200);
    const options = req.body?.options;
    if (!question || question.length < 5 || !Array.isArray(options) || options.length < 2 || options.length > 6 || options.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > 100))
      return fail(res, 400, 'Isi pertanyaan dan 2–6 pilihan yang valid.');
    const data = { id: randomUUID(), question, options: options.map((item) => item.trim()), counts: options.map(() => 0), status: 'draft', createdAt: Date.now(), createdBy: req.user.uid };
    await pollRef(room.id, data.id).set(data);
    res.status(201).json({ success: true, data });
  } catch (error) { console.error('Create poll:', error); fail(res, 503, 'Polling belum bisa dibuat.'); }
});
router.patch('/:roomId/polls/:pollId', requireAuth, async (req, res) => {
  try {
    if (!validId(req.params.pollId)) return fail(res, 400, 'Polling tidak valid.');
    const room = await hostRoom(req, res);
    if (!room) return;
    if (room.data().mode !== 'professional') return fail(res, 400, 'Polling hanya untuk Professional Room.');
    const next = req.body?.status;
    if (!['open', 'closed'].includes(next)) return fail(res, 400, 'Status polling tidak valid.');
    const result = await db.runTransaction(async (tx) => {
      const ref = pollRef(room.id, req.params.pollId);
      const doc = await tx.get(ref);
      if (!doc.exists) return 'missing';
      if (doc.data().createdAt <= (room.data().lastSessionEndedAt || 0)) return 'missing';
      if (!(doc.data().status === 'draft' && next === 'open') && !(doc.data().status === 'open' && next === 'closed')) return 'conflict';
      tx.update(ref, { status: next, updatedAt: Date.now() });
      return 'ok';
    });
    if (result === 'missing') return fail(res, 404, 'Polling tidak ditemukan.');
    if (result === 'conflict') return fail(res, 409, 'Status polling sudah berubah.');
    res.json({ success: true, data: { status: next } });
  } catch (error) { console.error('Poll status:', error); fail(res, 503, 'Status polling belum bisa diubah.'); }
});
router.post('/:roomId/polls/:pollId/vote', async (req, res) => {
  try {
    if (!validId(req.params.pollId)) return fail(res, 400, 'Polling tidak valid.');
    const membership = await admittedRoom(req, res);
    if (!membership) return;
    if (membership.room.data().mode !== 'professional') return fail(res, 400, 'Polling hanya untuk Professional Room.');
    const voter = membership.guest ? `guest-${membership.guest.id}` : `host-${req.user.uid}`;
    const option = req.body?.option;
    if (!Number.isInteger(option)) return fail(res, 400, 'Pilih satu jawaban.');
    const voteRef = pollRef(req.params.roomId, req.params.pollId).collection('votes').doc(voter);
    const result = await db.runTransaction(async (tx) => {
      const poll = await tx.get(pollRef(req.params.roomId, req.params.pollId));
      const previous = await tx.get(voteRef);
      if (!poll.exists) return 'missing';
      if (poll.data().createdAt <= (membership.room.data().lastSessionEndedAt || 0)) return 'missing';
      if (poll.data().status !== 'open') return 'closed';
      if (option < 0 || option >= poll.data().options.length) return 'invalid';
      if (previous.exists) return 'voted';
      const counts = [...(poll.data().counts || poll.data().options.map(() => 0))];
      counts[option] += 1;
      tx.update(pollRef(req.params.roomId, req.params.pollId), { counts });
      tx.create(voteRef, { option, at: Date.now() });
      return 'ok';
    });
    if (result !== 'ok') return fail(res, result === 'missing' ? 404 : result === 'invalid' ? 400 : 409, result === 'voted' ? 'Kamu sudah menjawab polling ini.' : 'Polling tidak tersedia.');
    res.json({ success: true });
  } catch (error) { console.error('Poll vote:', error); fail(res, 503, 'Jawaban belum tersimpan.'); }
});
router.get("/:roomId/breakouts", async (req, res) => {
  try {
    const membership = await admittedRoom(req, res);
    if (!membership) return;
    const room = membership.room.data();
    const identity = membership.guest ? `guest-${membership.guest.id}` : `host-${req.user.uid}`;
    const moderator = isModerator(req, room, membership.guest);
    const children = await Promise.all(
      (room.breakoutIds || []).map((id) => roomRef(id).get()),
    );
    const activeChildren = children.filter((doc) => doc.exists && doc.data().status === "active");
    const showPresence = moderator && req.query.include === 'participants';
    const presence = showPresence ? await Promise.all(activeChildren.map(async (child) => {
      try {
        const people = await getLiveKitRoomService().listParticipants(child.id);
        return { available: true, people: people.filter((person) =>
          person.identity?.startsWith('guest-') || person.identity?.startsWith('host-'))
          .slice(0, 100).map((person) => ({ identity: person.identity, name: clean(person.name, 50) || 'Peserta' })) };
      } catch (error) {
        if (error.code === 'not_found' || error.status === 404) return { available: true, people: [] };
        console.error('Breakout presence:', error);
        return { available: false, people: [] };
      }
    })) : [];
    res.json({
      success: true,
      data: activeChildren.map((doc, index) => ({ id: doc.id, name: doc.data().name,
        ...(showPresence ? { participants: presence[index].people, presenceAvailable: presence[index].available } : {}) })),
      meta: {
        assignedRoomId: room.breakoutAssignments?.[identity] || null,
        assignmentKey: room.breakoutAssignmentEvents?.[identity] || null,
        ...(moderator ? { assignments: room.breakoutAssignments || {} } : {}),
        deadlineAt: room.breakoutDeadlineAt || null,
        notice: room.breakoutNotice || null,
      },
    });
  } catch (error) {
    console.error("Breakouts:", error);
    fail(res, 503, "Daftar breakout room belum bisa dimuat.");
  }
});
router.get('/:roomId/breakouts/context', async (req, res) => {
  try {
    const membership = await admittedRoom(req, res);
    if (!membership) return;
    const parentId = membership.room.data().parentRoomId;
    if (!parentId) return fail(res, 400, 'Pilih breakout room.');
    const parent = await roomRef(parentId).get();
    if (!parent.exists || parent.data().status !== 'active') return fail(res, 404, 'Room utama sudah berakhir.');
    const parentRequestId = membership.guest?.data().parentRequestId;
    const parentGuest = parentRequestId ? await reqRef(parentId, parentRequestId).get() : null;
    const approvedParent = !membership.guest || (parentGuest?.exists && parentGuest.data().status === 'approved' && parentGuest.data().expiresAt > Date.now());
    const identity = approvedParent ? (membership.guest ? `guest-${parentRequestId}` : `host-${req.user.uid}`) : null;
    const assignedRoomId = identity ? parent.data().breakoutAssignments?.[identity] : null;
    const assignedRoom = assignedRoomId && assignedRoomId !== membership.room.id ? await roomRef(assignedRoomId).get() : null;
    const assignedRoomAvailable = assignedRoomId === membership.room.id || (assignedRoom?.exists && assignedRoom.data().status === 'active' && assignedRoom.data().parentRoomId === parentId);
    res.json({ success: true, data: {
      parentId, deadlineAt: parent.data().breakoutDeadlineAt || null, notice: parent.data().breakoutNotice || null,
      assignedRoomId: assignedRoomAvailable ? assignedRoomId : null,
      assignmentKey: assignedRoomAvailable && identity ? parent.data().breakoutAssignmentEvents?.[identity] || null : null,
      assignedRoomName: assignedRoomAvailable && assignedRoom ? assignedRoom.data().name : null,
    } });
  } catch (error) { console.error('Breakout context:', error); fail(res, 503, 'Informasi kelompok belum bisa dimuat.'); }
});
router.post('/:roomId/breakouts/:breakoutId/assign', requireAuth, async (req, res) => {
  try {
    if (!validId(req.params.breakoutId)) return fail(res, 400, 'Breakout room tidak valid.');
    const parent = await hostRoom(req, res);
    if (!parent) return;
    if (parent.data().mode !== 'professional' || parent.data().parentRoomId) return fail(res, 400, 'Pilih room Professional utama.');
    if (!(parent.data().breakoutIds || []).includes(req.params.breakoutId)) return fail(res, 404, 'Breakout room tidak ditemukan.');
    const identity = req.body?.identity;
    const isOwnerTarget = identity === `host-${parent.data().hostUid}`;
    if (!isOwnerTarget && (typeof identity !== 'string' || !identity.startsWith('guest-') || !validId(identity.slice(6)))) return fail(res, 400, 'Pilih peserta yang valid.');
    const result = await db.runTransaction(async (tx) => {
      const latest = await tx.get(roomRef(parent.id));
      const child = await tx.get(roomRef(req.params.breakoutId));
      const guest = isOwnerTarget ? null : await tx.get(reqRef(parent.id, identity.slice(6)));
      if (!latest.exists || latest.data().status !== 'active' ||
        !(latest.data().breakoutIds || []).includes(req.params.breakoutId) ||
        !child.exists || child.data().status !== 'active' || child.data().parentRoomId !== parent.id) return 'closed';
      if (isOwnerTarget && identity !== `host-${latest.data().hostUid}`) return 'invalid';
      if (guest && (!guest.exists || guest.data().status !== 'approved' || guest.data().expiresAt <= Date.now())) return 'unapproved';
      tx.update(roomRef(parent.id), {
        breakoutAssignments: { ...(latest.data().breakoutAssignments || {}), [identity]: req.params.breakoutId },
        breakoutAssignmentEvents: { ...(latest.data().breakoutAssignmentEvents || {}), [identity]: randomUUID() },
      });
      return 'ok';
    });
    if (result === 'closed') return fail(res, 404, 'Breakout room tidak tersedia.');
    if (result === 'invalid') return fail(res, 400, 'Pilih peserta yang valid.');
    if (result === 'unapproved') return fail(res, 403, 'Peserta belum disetujui.');
    res.json({ success: true, data: { identity, roomId: req.params.breakoutId } });
  } catch (error) { console.error('Assign breakout:', error); fail(res, 503, 'Peserta belum bisa ditugaskan.'); }
});
router.patch('/:roomId/breakouts/timer', requireAuth, async (req, res) => {
  try {
    const room = await hostRoom(req, res);
    if (!room) return;
    if (room.data().parentRoomId || room.data().mode !== 'professional') return fail(res, 400, 'Pilih room Professional utama.');
    const minutes = req.body?.minutes;
    if (minutes !== 0 && (!Number.isInteger(minutes) || minutes < 1 || minutes > 120)) return fail(res, 400, 'Pilih 0 atau 1–120 menit.');
    const deadlineAt = minutes === 0 ? null : Date.now() + minutes * 60_000;
    await roomRef(room.id).update({ breakoutDeadlineAt: deadlineAt });
    res.json({ success: true, data: { deadlineAt } });
  } catch (error) { console.error('Breakout timer:', error); fail(res, 503, 'Timer belum bisa diubah.'); }
});
router.post('/:roomId/breakouts/notice', requireAuth, async (req, res) => {
  try {
    const room = await hostRoom(req, res);
    if (!room) return;
    if (room.data().parentRoomId || room.data().mode !== 'professional') return fail(res, 400, 'Pilih room Professional utama.');
    const text = clean(req.body?.text, 240);
    if (!text) return fail(res, 400, 'Tulis pengumuman untuk kelompok.');
    const notice = { text, at: Date.now(), by: req.user.uid };
    await roomRef(room.id).update({ breakoutNotice: notice });
    res.json({ success: true, data: notice });
  } catch (error) { console.error('Breakout notice:', error); fail(res, 503, 'Pengumuman belum terkirim.'); }
});
router.get('/:roomId/breakouts/help', requireAuth, async (req, res) => {
  try {
    const room = await hostRoom(req, res);
    if (!room) return;
    res.json({ success: true, data: room.data().breakoutHelp || [] });
  } catch (error) { console.error('Breakout help:', error); fail(res, 503, 'Permintaan bantuan belum bisa dimuat.'); }
});
router.post('/:roomId/breakouts/help', async (req, res) => {
  try {
    const member = await admittedRoom(req, res);
    if (!member) return;
    const parentId = member.room.data().parentRoomId;
    if (!parentId) return fail(res, 400, 'Permintaan bantuan tersedia di breakout room.');
    const entry = { id: randomUUID(), roomId: member.room.id, roomName: member.room.data().name, participantName: member.guest?.data().participantName || 'Host', at: Date.now() };
    await db.runTransaction(async (tx) => {
      const parent = await tx.get(roomRef(parentId));
      if (!parent.exists || parent.data().status !== 'active') throw Error('Parent room closed');
      tx.update(roomRef(parentId), { breakoutHelp: [...(parent.data().breakoutHelp || []).slice(-29), entry] });
    });
    res.json({ success: true });
  } catch (error) { console.error('Breakout help request:', error); fail(res, 503, 'Permintaan bantuan belum terkirim.'); }
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
                hostUid: latest.data().hostUid,
                coHostUids: latest.data().coHostUids || [],
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
      ...(parentGuest.userUid ? { userUid: parentGuest.userUid } : {}),
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
router.post('/:roomId/end-session', requireAuth, async (req, res) => {
  try {
    const room = await roomRef(req.params.roomId).get();
    if (!room.exists || room.data().status !== 'active') return fail(res, 404, 'Room tidak ditemukan.');
    if (room.data().hostUid !== req.user.uid) return fail(res, 403, 'Hanya pemilik room yang dapat mengakhiri sesi.');
    if (room.data().schedule?.repeat !== 'weekly' || room.data().parentRoomId)
      return fail(res, 400, 'Hanya room mingguan utama yang dapat memulai sesi berikutnya.');
    const ids = await db.runTransaction(async (tx) => {
      const latest = await tx.get(roomRef(room.id));
      if (!latest.exists || latest.data().status !== 'active') return null;
      const children = (latest.data().breakoutIds || []).map((id) => roomRef(id));
      const childDocs = await Promise.all(children.map((ref) => tx.get(ref)));
      tx.update(roomRef(room.id), { sessionClosing: true });
      childDocs.filter((doc) => doc.exists && doc.data().status === 'active').forEach((doc) => tx.update(doc.ref, { status: 'closed', endedAt: Date.now() }));
      return [...children.map((ref) => ref.id), room.id];
    });
    if (!ids) return fail(res, 404, 'Room tidak ditemukan.');
    const service = getLiveKitRoomService();
    const result = await Promise.allSettled(ids.map(async (id) => {
      try { await service.deleteRoom(id); }
      catch (error) { if (error.code !== 'not_found' && error.status !== 404) throw error; }
    }));
    if (result.some((item) => item.status === 'rejected'))
      return fail(res, 502, 'Sesi sedang ditutup, tetapi sebagian koneksi belum terputus. Coba akhiri sesi lagi.');
    await roomRef(room.id).update({ startedAt: null, sessionClosing: false, breakoutIds: [], breakoutAssignments: {}, breakoutAssignmentEvents: {}, breakoutDeadlineAt: null, breakoutNotice: null, lastSessionEndedAt: Date.now() });
    res.json({ success: true });
  } catch (error) { console.error('End recurring session:', error); fail(res, 503, 'Sesi belum berhasil diakhiri.'); }
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

import { Router, json } from "express";
import { TokenVerifier } from "livekit-server-sdk";
import { db } from "../config/firebase.js";

const router = Router();
const initial = () => ({
  version: 0,
  pages: [{ id: "page-1", name: "Page 1", objects: [] }],
});
const safeId = (id) =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 128 &&
  !id.includes("/");
const boardError = (status, message) =>
  Object.assign(Error(message), { status });
const refFor = (name) => db.collection("meetingWhiteboards").doc(name);
function failure(res, error) {
  const status = error.status || 503;
  if (status === 503)
    console.error("Whiteboard storage unavailable:", error.code || "unknown");
  res.status(status).json({
    success: false,
    message: error.status
      ? error.message
      : "Whiteboard belum bisa disinkronkan. Coba lagi sebentar.",
  });
}
async function checkMembership(read, roomName, identity) {
  const room = await read(db.collection("rooms").doc(roomName));
  if (!room.exists || room.data().status !== "active")
    throw boardError(404, "Room sudah ditutup atau tidak ditemukan.");
  if (room.data().mode !== "study")
    throw boardError(403, "Whiteboard tersedia di Study Room.");
  if (identity === `host-${room.data().hostUid}`) return room.data();
  const requestId = identity?.startsWith("guest-") ? identity.slice(6) : "";
  if (!safeId(requestId))
    throw boardError(
      403,
      "Persetujuan host diperlukan untuk membuka whiteboard.",
    );
  const guest = await read(
    db
      .collection("rooms")
      .doc(roomName)
      .collection("joinRequests")
      .doc(requestId),
  );
  if (
    !guest.exists ||
    guest.data().status !== "approved" ||
    guest.data().expiresAt <= Date.now()
  )
    throw boardError(
      403,
      "Akses whiteboard berakhir. Kembali ke lobby untuk meminta persetujuan host.",
    );
  return room.data();
}
function boardDocument(source, room) {
  const hostIdentity = `host-${room.hostUid}`;
  return {
    version: source.version || 0,
    pages: structuredClone(source.pages || initial().pages),
    control: {
      hostIdentity,
      writerIdentity: source.control?.writerIdentity || hostIdentity,
      requests: source.control?.requests || [],
    },
  };
}
router.use("/:roomName", async (req, res, next) => {
  if (!safeId(req.params.roomName))
    return res
      .status(400)
      .json({ success: false, message: "Room tidak valid." });
  const token = req.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    return res.status(401).json({
      success: false,
      message: "Hubungkan ke meeting untuk membuka whiteboard.",
    });
  const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (!key || !secret)
    return res.status(503).json({
      success: false,
      message: "Layanan whiteboard belum dikonfigurasi.",
    });
  try {
    const claims = await new TokenVerifier(key, secret).verify(token);
    if (
      !claims.sub ||
      claims.video?.roomJoin !== true ||
      claims.video.room !== req.params.roomName ||
      claims.video.canPublishData === false
    )
      return res.status(403).json({
        success: false,
        message: "Token tidak memiliki akses ke whiteboard room ini.",
      });
    req.meetingIdentity = claims.sub;
    req.meetingName = String(claims.name || "Peserta").slice(0, 80);
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      code:
        error.code === "ERR_JWT_EXPIRED"
          ? "ROOM_TOKEN_EXPIRED"
          : "ROOM_TOKEN_INVALID",
      message: "Sesi whiteboard perlu diperbarui. Coba lagi.",
    });
  }
});
router.get("/:roomName", async (req, res) => {
  try {
    const room = await checkMembership(
      (ref) => ref.get(),
      req.params.roomName,
      req.meetingIdentity,
    );
    const snap = await refFor(req.params.roomName).get();
    res.json({
      success: true,
      data: boardDocument(snap.exists ? snap.data() : initial(), room),
    });
  } catch (error) {
    failure(res, error);
  }
});

// All control changes and drawing writes use the same document transaction.
router.post("/:roomName/control", json({ limit: "4kb" }), async (req, res) => {
  const { action, identity } = req.body || {};
  try {
    const result = await db.runTransaction(async (tx) => {
      const room = await checkMembership(
        (ref) => tx.get(ref),
        req.params.roomName,
        req.meetingIdentity,
      );
      const ref = refFor(req.params.roomName),
        snap = await tx.get(ref);
      const source = snap.exists ? snap.data() : initial(),
        doc = boardDocument(source, room);
      const control = doc.control,
        me = req.meetingIdentity,
        isHost = me === control.hostIdentity;
      if (action === "request") {
        if (
          me !== control.writerIdentity &&
          !control.requests.some((p) => p.identity === me)
        ) {
          if (control.requests.length >= 50)
            throw boardError(429, "Antrean izin penuh. Coba lagi sebentar.");
          control.requests.push({ identity: me, name: req.meetingName });
        }
      } else if (action === "cancel")
        control.requests = control.requests.filter((p) => p.identity !== me);
      else if (action === "release") {
        if (control.writerIdentity !== me)
          throw boardError(403, "Kamu tidak sedang memegang izin gambar.");
        control.writerIdentity = control.hostIdentity;
      } else if (["grant", "deny", "reclaim"].includes(action)) {
        if (!isHost)
          throw boardError(
            403,
            "Hanya host yang dapat mengatur izin whiteboard.",
          );
        if (action === "reclaim") control.writerIdentity = control.hostIdentity;
        else {
          if (!safeId(identity)) throw boardError(400, "Peserta tidak valid.");
          if (action === "grant") {
            if (!control.requests.some((p) => p.identity === identity))
              throw boardError(
                409,
                "Peserta belum meminta izin atau sudah membatalkan.",
              );
            await checkMembership(
              (ref) => tx.get(ref),
              req.params.roomName,
              identity,
            );
            control.writerIdentity = identity;
          }
          control.requests = control.requests.filter(
            (p) => p.identity !== identity,
          );
        }
      } else throw boardError(400, "Aksi izin tidak valid.");
      doc.version++;
      tx.set(ref, { ...source, ...doc, updatedAt: Date.now() });
      return doc;
    });
    res.json({ success: true, data: result });
  } catch (error) {
    failure(res, error);
  }
});

const str = (s, max) => typeof s === "string" && s.length <= max;
const number = (n) =>
  typeof n === "number" && Number.isFinite(n) && n >= -100000 && n <= 100000;
function validObject(o) {
  if (
    !o ||
    !safeId(o.id) ||
    ![
      "pen",
      "rectangle",
      "circle",
      "diamond",
      "line",
      "arrow",
      "text",
      "sticky",
    ].includes(o.type) ||
    !/^#[0-9a-f]{6}$/i.test(o.color) ||
    !number(o.width) ||
    o.width < 1 ||
    o.width > 32
  )
    return false;
  if (o.type === "pen")
    return (
      Array.isArray(o.points) &&
      o.points.length > 0 &&
      o.points.length <= 1000 &&
      o.points.every((p) => number(p?.x) && number(p?.y))
    );
  if (!number(o.x) || !number(o.y)) return false;
  if (["rectangle", "circle", "diamond", "line", "arrow"].includes(o.type))
    return number(o.x2) && number(o.y2);
  return str(o.text, 1000);
}
function apply(doc, op) {
  if (!op || typeof op !== "object") throw boardError(400, "Invalid operation");
  const page = doc.pages.find((p) => p.id === op.pageId);
  switch (op.type) {
    case "add":
      if (!page || !validObject(op.object))
        throw boardError(400, "Invalid shape");
      if (page.objects.length >= 500)
        throw boardError(400, "Page object limit reached");
      if (!page.objects.some((o) => o.id === op.object.id))
        page.objects.push(
          Object.fromEntries(
            Object.entries(op.object).filter(([key]) =>
              [
                "id",
                "type",
                "color",
                "width",
                "x",
                "y",
                "x2",
                "y2",
                "points",
                "text",
              ].includes(key),
            ),
          ),
        );
      break;
    case "update": {
      if (!page || !validObject(op.object))
        throw boardError(400, "Invalid shape update");
      const index = page.objects.findIndex((o) => o.id === op.object.id);
      if (index < 0) throw boardError(404, "Shape not found");
      // Type cannot be changed by a move/update request.
      if (page.objects[index].type !== op.object.type)
        throw boardError(400, "Shape type cannot be changed");
      page.objects[index] = Object.fromEntries(
        Object.entries(op.object).filter(([key]) =>
          [
            "id",
            "type",
            "color",
            "width",
            "x",
            "y",
            "x2",
            "y2",
            "points",
            "text",
          ].includes(key),
        ),
      );
      break;
    }
    case "remove":
      if (!page || !safeId(op.id)) throw boardError(400, "Invalid remove");
      page.objects = page.objects.filter((o) => o.id !== op.id);
      break;
    case "page-clear":
      if (!page) throw boardError(400, "Page missing");
      page.objects = [];
      break;
    case "page-add":
      if (
        !safeId(op.id) ||
        !str(op.name, 80) ||
        !op.name.trim() ||
        doc.pages.length >= 25
      )
        throw boardError(400, "Invalid page");
      if (!doc.pages.some((p) => p.id === op.id))
        doc.pages.push({ id: op.id, name: op.name, objects: [] });
      break;
    case "page-rename": {
      const p = doc.pages.find((p) => p.id === op.id);
      if (!p || !str(op.name, 80) || !op.name.trim())
        throw boardError(400, "Invalid rename");
      p.name = op.name;
      break;
    }
    case "page-delete":
      if (doc.pages.length <= 1 || !doc.pages.some((p) => p.id === op.id))
        throw boardError(400, "Cannot delete last page");
      doc.pages = doc.pages.filter((p) => p.id !== op.id);
      break;
    default:
      throw boardError(400, "Unsupported operation");
  }
}
router.post(
  "/:roomName/operations",
  json({ limit: "80kb" }),
  async (req, res) => {
    const { id, operation } = req.body || {};
    if (!safeId(id))
      return res
        .status(400)
        .json({ success: false, message: "Operasi whiteboard tidak valid." });
    try {
      const ref = refFor(req.params.roomName);
      const updated = await db.runTransaction(async (tx) => {
        const room = await checkMembership(
          (ref) => tx.get(ref),
          req.params.roomName,
          req.meetingIdentity,
        );
        const snap = await tx.get(ref);
        const source = snap.exists ? snap.data() : initial();
        const doc = boardDocument(source, room);
        if (doc.control.writerIdentity !== req.meetingIdentity)
          throw boardError(
            403,
            "Minta izin host untuk menggambar. Hanya satu orang dapat menggunakan papan saat ini.",
          );
        const recent = source.recentOperations || [];
        if (recent.includes(id)) return doc;
        apply(doc, operation);
        doc.version++;
        const document = {
          ...doc,
          recentOperations: [...recent.slice(-149), id],
          updatedAt: Date.now(),
        };
        if (Buffer.byteLength(JSON.stringify(document)) > 850_000)
          throw boardError(
            413,
            "Whiteboard penuh. Hapus objek atau halaman yang tidak diperlukan.",
          );
        tx.set(ref, document);
        return doc;
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      failure(res, error);
    }
  },
);
router.use((error, req, res, next) => {
  if (error.type === "entity.too.large")
    return res.status(413).json({
      success: false,
      message:
        "Goresan terlalu besar. Coba beberapa goresan yang lebih pendek.",
    });
  if (error.type === "entity.parse.failed")
    return res
      .status(400)
      .json({ success: false, message: "Data whiteboard tidak valid." });
  next(error);
});
export default router;

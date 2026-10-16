<script setup>
import {
    computed,
    onMounted,
    onUnmounted,
    reactive,
    ref,
    watch,
    nextTick,
} from "vue";

import { ConnectionState, RoomEvent } from "livekit-client";

import api from "../../services/api.js";

import { toast, notify, dismissToast } from "../../services/toast.js";

const props = defineProps({
    room: { type: Object, default: null },

    roomToken: { type: String, default: "" },

    roomId: { type: String, default: "" },

    refreshToken: { type: Function, default: null },
});

const TOPIC = "meetspace.whiteboard.v2";

// Board operations are JSON documents. Vue may wrap both an object and its
// nested points in proxies, which structuredClone cannot copy.
const cloneDocument = (value) => JSON.parse(JSON.stringify(value));

const W = 1200,
    H = 700;

const canvas = ref(null),
    viewport = ref(null);

const canvasSize = ref({ width: 1200, height: 700 });

let resizeObserver = null;

const tool = ref("pen");
const camera = reactive({ x: 0, y: 0, zoom: 1 });
const selectedId = ref(null);
const history = ref([]);
const historyIndex = ref(-1);
const toolNames = {
    hand: "Hand",
    select: "Select",
    pen: "Pen",
    eraser: "Eraser",
    rectangle: "Rectangle",
    circle: "Ellipse",
    diamond: "Diamond",
    arrow: "Arrow",
    line: "Line",
    text: "Text",
    sticky: "Sticky",
};
const shortcuts = {
    v: "select",
    h: "hand",
    p: "pen",
    e: "eraser",
    r: "rectangle",
    o: "circle",
    d: "diamond",
    a: "arrow",
    l: "line",
    t: "text",
    n: "sticky",
};

const color = ref("#4F5B2A");

const lineWidth = ref(4);

const pageId = ref("");

const state = ref({ version: 0, pages: [] });

const cursors = reactive({});

const preview = reactive({});

const loading = ref(true);

const failed = ref(false);

const editor = ref(null),
    editorInput = ref(null);

const confirmations = new Set();

// Unsaved edits remain visible in this session until confirmed or retried.
const pendingObjects = reactive({});
const outbox = reactive([]);
const failedCount = computed(
    () => outbox.filter((item) => item.status === "failed").length,
);
const waitingCount = computed(
    () => outbox.filter((item) => item.status !== "failed").length,
);
let draining = false;
const pendingForPage = (page) =>
    outbox.filter((item) => item.op.pageId === page);

function visibleObjects(page = pageId.value) {
    const byId = new Map(
        (state.value.pages.find((p) => p.id === page)?.objects || []).map(
            (o) => [o.id, o],
        ),
    );
    for (const item of pendingForPage(page)) {
        if (item.op.type === "add" || item.op.type === "update")
            byId.set(item.op.object.id, item.op.object);
        if (item.op.type === "remove") byId.delete(item.op.id);
        if (item.op.type === "page-clear") byId.clear();
    }
    return [...byId.values()];
}

const connectionState = ref(props.room?.state);

let disposed = false,
    poller = null;

const busy = ref(false);

const isConnected = computed(
    () => connectionState.value === ConnectionState.Connected,
);

const identity = computed(() => props.room?.localParticipant?.identity);

const control = computed(() => state.value.control || { requests: [] });

const isHost = computed(
    () => !!identity.value && identity.value === control.value.hostIdentity,
);

const requested = computed(() =>
    control.value.requests.some((p) => p.identity === identity.value),
);

const writerName = computed(() =>
    control.value.writerIdentity === control.value.hostIdentity
        ? "Host"
        : control.value.writerIdentity === identity.value
          ? "Kamu"
          : props.room?.remoteParticipants?.get(control.value.writerIdentity)
                ?.name || "Peserta",
);

const controlBusy = ref(false);

const canEdit = computed(
    () =>
        isConnected.value &&
        !loading.value &&
        !!currentPage.value &&
        !!identity.value &&
        control.value.writerIdentity === identity.value,
);

async function changeControl(action, target) {
    if (controlBusy.value) return;

    controlBusy.value = true;

    try {
        acceptDocument(
            await request("/control", {
                method: "POST",
                data: { action, identity: target },
            }),
        );
        await send({ type: "commit" });
    } catch (error) {
        toast.error(error);
        await refresh();
    } finally {
        controlBusy.value = false;
    }
}

function resizeCanvas() {
    if (!canvas.value || !viewport.value) return;
    const { width, height } = viewport.value.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvasSize.value = { width, height };
    canvas.value.width = Math.round(width * dpr);
    canvas.value.height = Math.round(height * dpr);
    canvas.value.style.width = `${width}px`;
    canvas.value.style.height = `${height}px`;
    render();
}
function screenPoint(e) {
    const r = canvas.value.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function worldPoint(e) {
    const p = screenPoint(e);
    return {
        x: (p.x - camera.x) / camera.zoom,
        y: (p.y - camera.y) / camera.zoom,
    };
}
function zoomAt(
    next,
    px = canvasSize.value.width / 2,
    py = canvasSize.value.height / 2,
) {
    const z = clamp(next, 0.15, 6),
        ratio = z / camera.zoom;
    camera.x = px - (px - camera.x) * ratio;
    camera.y = py - (py - camera.y) * ratio;
    camera.zoom = z;
    render();
}
function resetView() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
    render();
}
function fitDrawing() {
    const objects = visibleObjects();
    if (!objects.length) { resetView(); return; }
    const boxes = objects.map(bounds);
    const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
    const right = Math.max(...boxes.map(b => b.x + b.w)), bottom = Math.max(...boxes.map(b => b.y + b.h));
    const { width, height } = canvasSize.value;
    const availableWidth = Math.max(40, width - 80), availableHeight = Math.max(40, height - 200);
    camera.zoom = clamp(Math.min(1, availableWidth / Math.max(1, right - left), availableHeight / Math.max(1, bottom - top)), .15, 6);
    camera.x = width / 2 - (left + right) / 2 * camera.zoom;
    camera.y = Math.min(height - 40, height / 2 + 50) - (top + bottom) / 2 * camera.zoom;
    render();
}
function wheel(e) {
    e.preventDefault();
    const r = canvas.value.getBoundingClientRect();
    zoomAt(
        camera.zoom * Math.exp(-e.deltaY * 0.0015),
        e.clientX - r.left,
        e.clientY - r.top,
    );
}
function keydown(e) {
    if (
        !canvas.value?.getClientRects?.().length ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement?.tagName) ||
        document.activeElement?.isContentEditable ||
        editor.value
    )
        return;
    if (e.code === "Space") {
        e.preventDefault();
        spaceHeld = true;
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
    }
    const t = shortcuts[e.key.toLowerCase()];
    if (t) {
        tool.value = t;
        e.preventDefault();
    }
}
function keyup(e) {
    if (e.code === "Space") spaceHeld = false;
}
let spaceHeld = false,
    panStart = null,
    dragStart = null;
const currentPage = computed(() =>
    state.value.pages.find((p) => p.id === pageId.value),
);

const pages = computed(() => state.value.pages);

let gesture = null,
    lastCursorAt = 0,
    lastDrawAt = 0;

let operationChain = Promise.resolve(),
    fetching = null;

let attachedRoom = null,
    refreshTimer = null;

const enc = new TextEncoder(),
    dec = new TextDecoder();

const uid = () => crypto.randomUUID();

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const getCtx = () => canvas.value?.getContext("2d");

const pointerPosition = worldPoint;
const pointInside = (p, s, pad = 12) => {
    if (s.type === "pen")
        return (s.points || []).some(
            (q) =>
                Math.hypot(q.x - p.x, q.y - p.y) <= Math.max(pad, s.width + 8),
        );

    if (s.type === "text" || s.type === "sticky")
        return (
            p.x >= s.x - pad &&
            p.x <= s.x + (s.w || 230) + pad &&
            p.y >= s.y - pad &&
            p.y <= s.y + (s.h || 110) + pad
        );

    const x1 = Math.min(s.x, s.x2),
        x2 = Math.max(s.x, s.x2),
        y1 = Math.min(s.y, s.y2),
        y2 = Math.max(s.y, s.y2);

    return (
        p.x >= x1 - pad && p.x <= x2 + pad && p.y >= y1 - pad && p.y <= y2 + pad
    );
};

function shape(ctx, o) {
    ctx.save();

    ctx.lineWidth = o.width || 3;

    ctx.strokeStyle = o.color || "#4F5B2A";

    ctx.fillStyle = o.color || "#4F5B2A";

    ctx.lineCap = "round";

    ctx.lineJoin = "round";

    if (o.type === "pen") {
        const pts = o.points || [];

        if (pts.length === 1) {
            ctx.beginPath();

            ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, 2 * Math.PI);

            ctx.fill();
        }

        if (pts.length > 1) {
            ctx.beginPath();

            ctx.moveTo(pts[0].x, pts[0].y);

            for (let i = 1; i < pts.length - 1; i++) {
                const next = pts[i + 1],
                    p = pts[i];

                ctx.quadraticCurveTo(
                    p.x,
                    p.y,
                    (p.x + next.x) / 2,
                    (p.y + next.y) / 2,
                );
            }

            ctx.lineTo(pts.at(-1).x, pts.at(-1).y);

            ctx.stroke();
        }
    } else if (o.type === "rectangle")
        ctx.strokeRect(o.x, o.y, o.x2 - o.x, o.y2 - o.y);
    else if (o.type === "circle" || o.type === "diamond") {
        if (o.type === "diamond") {
            ctx.beginPath();
            ctx.moveTo((o.x + o.x2) / 2, o.y);
            ctx.lineTo(o.x2, (o.y + o.y2) / 2);
            ctx.lineTo((o.x + o.x2) / 2, o.y2);
            ctx.lineTo(o.x, (o.y + o.y2) / 2);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            return;
        }

        ctx.beginPath();

        ctx.ellipse(
            (o.x + o.x2) / 2,

            (o.y + o.y2) / 2,

            Math.max(1, Math.abs(o.x2 - o.x) / 2),

            Math.max(1, Math.abs(o.y2 - o.y) / 2),

            0,

            0,

            2 * Math.PI,
        );

        ctx.stroke();
    } else if (o.type === "arrow" || o.type === "line") {
        const angle = Math.atan2(o.y2 - o.y, o.x2 - o.x),
            head = 17;

        ctx.beginPath();

        ctx.moveTo(o.x, o.y);

        ctx.lineTo(o.x2, o.y2);

        if (o.type === "line") {
            ctx.stroke();
            ctx.restore();
            return;
        }
        ctx.moveTo(o.x2, o.y2);

        ctx.lineTo(
            o.x2 - head * Math.cos(angle - 0.5),

            o.y2 - head * Math.sin(angle - 0.5),
        );

        ctx.moveTo(o.x2, o.y2);

        ctx.lineTo(
            o.x2 - head * Math.cos(angle + 0.5),

            o.y2 - head * Math.sin(angle + 0.5),
        );

        ctx.stroke();
    } else if (o.type === "sticky") {
        ctx.fillStyle = "#FFF0A6";

        ctx.shadowColor = "#0002";

        ctx.shadowBlur = 12;

        ctx.fillRect(o.x, o.y, o.w || 230, o.h || 110);

        ctx.shadowBlur = 0;

        ctx.strokeStyle = "#D6BA54";

        ctx.strokeRect(o.x, o.y, o.w || 230, o.h || 110);

        ctx.fillStyle = "#3B3520";

        drawText(ctx, o.text, o.x + 14, o.y + 28, (o.w || 230) - 28, 19);
    } else if (o.type === "text") {
        ctx.font = "24px sans-serif";

        drawText(ctx, o.text, o.x, o.y + 25, o.w || 350, 28);
    }

    ctx.restore();
}

function drawText(ctx, text, x, y, maxWidth, step) {
    ctx.font = step === 19 ? "17px sans-serif" : "24px sans-serif";

    for (const paragraph of String(text || "").split("\n")) {
        let line = "";

        for (const word of paragraph.split(" ")) {
            const next = line ? `${line} ${word}` : word;

            if (ctx.measureText(next).width > maxWidth && line) {
                ctx.fillText(line, x, y);

                y += step;

                line = word;
            } else line = next;
        }

        ctx.fillText(line, x, y);

        y += step;
    }
}

function render() {
    const ctx = getCtx();
    if (!ctx) return;
    const cw = canvas.value.width,
        ch = canvas.value.height;
    const dpr = cw / Math.max(1, canvasSize.value.width);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#FFFCF7";
    ctx.fillRect(0, 0, cw, ch);
    // subtle dot grid anchored to world space
    const step = 28 * camera.zoom;
    if (step > 9) {
        ctx.fillStyle = "#E8E5DA";
        for (
            let x = ((camera.x % step) + step) % step;
            x < canvasSize.value.width;
            x += step
        )
            for (
                let y = ((camera.y % step) + step) % step;
                y < canvasSize.value.height;
                y += step
            ) {
                ctx.beginPath();
                ctx.arc(x * dpr, y * dpr, 1 * dpr, 0, Math.PI * 2);
                ctx.fill();
            }
    }
    ctx.setTransform(
        dpr * camera.zoom,
        0,
        0,
        dpr * camera.zoom,
        dpr * camera.x,
        dpr * camera.y,
    );
    for (const o of visibleObjects())
        shape(ctx, dragStart?.original?.id === o.id ? dragStart.shape : o);
    for (const p of Object.values(preview))
        if (p.pageId === pageId.value && p.shape) shape(ctx, p.shape);
    if (gesture?.pageId === pageId.value) shape(ctx, gesture.shape);
    const selected = visibleObjects().find((o) => o.id === selectedId.value);
    if (selected) {
        const b = bounds(selected);
        ctx.save();
        ctx.strokeStyle = "#6965db";
        ctx.lineWidth = 1.5 / camera.zoom;
        ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
        ctx.strokeRect(
            b.x - 7 / camera.zoom,
            b.y - 7 / camera.zoom,
            b.w + 14 / camera.zoom,
            b.h + 14 / camera.zoom,
        );
        ctx.restore();
    }
}
function bounds(o) {
    if (o.type === "pen") {
        const pts = o.points || [{ x: 0, y: 0 }];
        const xs = pts.map((p) => p.x),
            ys = pts.map((p) => p.y);
        const x = Math.min(...xs),
            y = Math.min(...ys);
        return {
            x,
            y,
            w: Math.max(1, Math.max(...xs) - x),
            h: Math.max(1, Math.max(...ys) - y),
        };
    }
    if (["text", "sticky"].includes(o.type))
        return { x: o.x, y: o.y, w: o.w || 230, h: o.h || 110 };
    return {
        x: Math.min(o.x, o.x2),
        y: Math.min(o.y, o.y2),
        w: Math.abs(o.x2 - o.x),
        h: Math.abs(o.y2 - o.y),
    };
}
function translateShape(o, dx, dy) {
    const copy = cloneDocument(o);
    if (copy.type === "pen") {
        copy.points = copy.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else {
        copy.x += dx;
        copy.y += dy;
        if (Number.isFinite(copy.x2)) {
            copy.x2 += dx;
            copy.y2 += dy;
        }
    }
    return copy;
}
function hit(p) {
    return [...visibleObjects()]
        .reverse()
        .find((o) => pointInside(p, o, 11 / camera.zoom));
}
function attach(room) {
    if (attachedRoom === room) return;

    detach();

    attachedRoom = room;

    connectionState.value = room?.state;

    if (room) {
        room.on(RoomEvent.DataReceived, onData);

        room.on(RoomEvent.Disconnected, onDisconnect);

        room.on(RoomEvent.Connected, onConnect);

        room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    }

    if (room?.state === ConnectionState.Connected) {
        void refresh();
    }
}

function detach() {
    if (!attachedRoom) return;

    attachedRoom.off(RoomEvent.DataReceived, onData);

    attachedRoom.off(RoomEvent.Disconnected, onDisconnect);

    attachedRoom.off(RoomEvent.Connected, onConnect);

    attachedRoom.off(
        RoomEvent.ConnectionStateChanged,
        onConnectionStateChanged,
    );

    attachedRoom = null;
}

function onConnect() {
    connectionState.value = props.room?.state;

    void refresh();
    void drainOutbox();
}

function onConnectionStateChanged(value) {
    connectionState.value = value;
    if (value === ConnectionState.Connected) {
        void refresh();
        void drainOutbox();
    }
    // Do not cancel an in-progress local stroke on a temporary reconnect.
    // The next new stroke is still gated by canEdit.
}

function onDisconnect() {
    connectionState.value = ConnectionState.Disconnected;

    // A completed local stroke remains queued; prevent starting new writes.
    // Preserve an in-progress stroke until pointerup if possible.

    Object.keys(cursors).forEach((k) => delete cursors[k]);

    Object.keys(preview).forEach((k) => delete preview[k]);

    render();
}

async function send(packet, reliable = true) {
    if (disposed || !isConnected.value) return;

    try {
        await props.room.localParticipant.publishData(
            enc.encode(JSON.stringify(packet)),

            { topic: TOPIC, reliable },
        );
    } catch (err) {
        // Preview packets are best-effort: never block local drawing or flood toasts.
        if (import.meta.env.DEV)
            console.debug("Whiteboard preview skipped", err?.message);
    }
}

function onData(data, participant, _kind, topic) {
    if (disposed || topic !== TOPIC || !participant || data.byteLength > 16000)
        return;

    let packet;

    try {
        packet = JSON.parse(dec.decode(data));
    } catch {
        return;
    }

    if (!packet || typeof packet !== "object") return;

    const id = participant.identity;

    const point = (p) =>
        Number.isFinite(p?.x) &&
        Number.isFinite(p?.y) &&
        Math.abs(p.x) <= 1000000 &&
        Math.abs(p.y) <= 1000000;

    if (packet.type === "cursor") {
        if (!point(packet.point) || !/^#[0-9a-f]{6}$/i.test(packet.color))
            return;

        cursors[id] = {
            ...packet.point,

            name: participant.name || id,

            color: packet.color,

            pageId: packet.pageId,

            seen: Date.now(),
        };

        return;
    }

    if (packet.type === "preview") {
        if (id !== control.value.writerIdentity) return;

        if (packet.shape) {
            const s = packet.shape;

            if (
                ![
                    "pen",
                    "rectangle",
                    "circle",
                    "diamond",
                    "line",
                    "arrow",
                ].includes(s.type) ||
                !/^#[0-9a-f]{6}$/i.test(s.color) ||
                !Number.isFinite(s.width) ||
                s.width < 1 ||
                s.width > 32
            )
                return;

            if (
                s.type === "pen"
                    ? !Array.isArray(s.points) ||
                      s.points.length > 100 ||
                      !s.points.every(point)
                    : !point({ x: s.x, y: s.y }) || !point({ x: s.x2, y: s.y2 })
            )
                return;

            preview[id] = { pageId: packet.pageId, shape: s, seen: Date.now() };
        } else delete preview[id];

        render();

        return;
    }

    if (packet.type === "commit") {
        delete preview[id];
        render();
        scheduleRefresh();
    }
}

function scheduleRefresh() {
    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(() => refresh(), 120);
}

let tokenRefreshPromise = null;
let currentAccessToken = "";
let lastRejectedToken = "";

async function renewRoomToken() {
    if (typeof props.refreshToken !== "function") {
        throw new Error("Fungsi pembaruan room token belum tersedia.");
    }

    if (!tokenRefreshPromise) {
        tokenRefreshPromise = Promise.resolve()
            .then(() => props.refreshToken())
            .finally(() => {
                tokenRefreshPromise = null;
            });
    }

    const result = await tokenRefreshPromise;

    // Callback parent sebaiknya mengembalikan token baru.
    const newToken = typeof result === "string" ? result : result?.token;

    if (newToken) return newToken;

    // Kompatibilitas jika parent memperbarui prop.
    await nextTick();

    if (props.roomToken && props.roomToken !== lastRejectedToken) {
        return props.roomToken;
    }

    throw new Error("Token LiveKit tidak berhasil diperbarui.");
}

async function request(path, options = {}) {
    let token = currentAccessToken || props.roomToken;

    if (!token) {
        throw new Error("Room token belum tersedia.");
    }

    const targetRoom = props.roomId || props.room?.name;
    if (!targetRoom) throw new Error("ID whiteboard room belum tersedia.");

    const execute = (accessToken) =>
        api.request({
            ...options,
            url: `/whiteboards/${encodeURIComponent(targetRoom)}${path}`,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${accessToken}`,
            },
        });

    try {
        const response = await execute(token);
        return response.data.data;
    } catch (error) {
        if (error.response?.status !== 401) {
            throw error;
        }

        lastRejectedToken = token;

        // Another concurrent request may have already refreshed the token.
        const newToken =
            currentAccessToken && currentAccessToken !== token
                ? currentAccessToken
                : await renewRoomToken();

        if (newToken === token) {
            throw new Error("Room token masih tidak valid.");
        }

        currentAccessToken = newToken;
        // Retry hanya satu kali.
        const response = await execute(newToken);

        return response.data.data;
    }
}

function acceptDocument(doc) {
    if (
        disposed ||
        !Array.isArray(doc?.pages) ||
        doc.version < state.value.version
    )
        return;

    // Skip unnecessary canvas redraws when Firestore version is unchanged.
    if (state.value.pages.length && doc.version === state.value.version) return;
    const firstLoad = !state.value.pages.length;
    state.value = doc;

    if (!doc.pages.some((p) => p.id === pageId.value))
        pageId.value = doc.pages[0]?.id || "";

    render();
    if (firstLoad) nextTick(() => { if (!disposed && visibleObjects().length) fitDrawing(); });
}

async function refresh() {
    if (disposed || !isConnected.value) return;

    if (!props.roomToken) {
        loading.value = false;
        failed.value = true;
        return;
    }

    if (fetching) return fetching;

    fetching = (async () => {
        try {
            acceptDocument(await request(""));
            if (!disposed) failed.value = false;
        } catch (error) {
            if (!disposed) {
                failed.value = true;
                toast.error(error);
            }
        } finally {
            loading.value = false;
            fetching = null;
        }
    })();

    return fetching;
}

function recordHistory(op, before) {
    let undoOp = null;
    if (op.type === "add")
        undoOp = { type: "remove", pageId: op.pageId, id: op.object.id };
    else if (op.type === "remove" && before)
        undoOp = { type: "add", pageId: op.pageId, object: before };
    else if (op.type === "update" && before)
        undoOp = { type: "update", pageId: op.pageId, object: before };
    if (undoOp) {
        history.value = history.value
            .slice(0, historyIndex.value + 1)
            .concat([{ doOp: op, undoOp }])
            .slice(-40);
        historyIndex.value = history.value.length - 1;
    }
}
async function undo() {
    if (!canEdit.value || historyIndex.value < 0) return;
    const entry = history.value[historyIndex.value];
    if (await commit(entry.undoOp, false)) historyIndex.value--;
}
async function redo() {
    if (!canEdit.value || historyIndex.value >= history.value.length - 1)
        return;
    const entry = history.value[historyIndex.value + 1];
    if (await commit(entry.doOp, false)) historyIndex.value++;
}
// Each operation has a stable id for backend idempotency. Rendering is immediate,
// network persistence is sequential, and a failed operation blocks later writes
// until the user explicitly retries it. Nothing is silently discarded.
async function drainOutbox() {
    if (draining || disposed || !isConnected.value) return;
    draining = true;
    try {
        while (!disposed && outbox.length) {
            const item = outbox[0];
            if (item.status === "failed") break;
            if (!canEdit.value) break;
            item.status = "saving";
            busy.value = true;
            try {
                const doc = await request("/operations", {
                    method: "POST",
                    data: { id: item.id, operation: item.op },
                });
                // Set server state before removing local overlay: no blinking.
                acceptDocument(doc);
                if (item.track) recordHistory(item.op, item.before);
                outbox.shift();
                item.resolve(true);
                // Notifications are best-effort; failed data packet isn't a failed save.
                void send({ type: "commit" });
                render();
            } catch (error) {
                item.status = "failed";
                item.error =
                    error?.response?.data?.message ||
                    error.message ||
                    "Gagal menyimpan";
                failed.value = true;
                toast.error(error);
                // Permission may have changed while a write was in flight.
                void refresh();
                render();
                break;
            }
        }
    } finally {
        busy.value = false;
        draining = false;
    }
}

function retryUnsaved() {
    if (!canEdit.value) return;
    for (const item of outbox) {
        if (item.status === "failed") item.status = "queued";
    }
    failed.value = false;
    void drainOutbox();
}

function isTemporaryReconnect() {
    return (
        props.room?.state !== ConnectionState.Disconnected &&
        !!currentPage.value &&
        !!identity.value &&
        control.value.writerIdentity === identity.value
    );
}

function queueOperation(op, track = true) {
    if (disposed) return Promise.resolve(false);
    const original =
        op.type === "remove"
            ? visibleObjects(op.pageId).find((o) => o.id === op.id)
            : op.type === "update"
              ? visibleObjects(op.pageId).find((o) => o.id === op.object.id)
              : null;
    const before = original ? cloneDocument(original) : null;
    const clonedOp = cloneDocument(op);
    const promise = new Promise((resolve) => {
        outbox.push({
            id: uid(),
            op: clonedOp,
            before,
            track,
            status: "queued",
            error: "",
            resolve,
        });
    });
    render();
    void drainOutbox();
    return promise;
}

function commit(op, track = true) {
    if (disposed || !canEdit.value) return Promise.resolve(false);
    return queueOperation(op, track);
}

function openEditor(value) {
    editor.value = value;
    nextTick(() => editorInput.value?.focus());
}

async function saveEditor() {
    const value = editor.value;

    if (!value?.text.trim()) return;

    const op =
        value.kind === "rename"
            ? {
                  type: "page-rename",
                  id: value.pageId,
                  name: value.text.trim().slice(0, 80),
              }
            : {
                  type: "add",
                  pageId: value.pageId,
                  object: {
                      id: uid(),
                      type: value.kind,
                      x: value.x,
                      y: value.y,
                      text: value.text.trim().slice(0, 1000),
                      color: color.value,
                      width: lineWidth.value,
                  },
              };

    if (await commit(op)) {
        editor.value = null;
        toast.success(
            value.kind === "rename"
                ? "Nama halaman diperbarui."
                : "Teks ditambahkan ke whiteboard.",
        );
    }
}

function confirmOperation(message, op) {
    confirmations.forEach(dismissToast);
    confirmations.clear();

    const id = notify(message, {
        title: "Ubah whiteboard bersama?",
        duration: 0,
        actions: [
            { label: "Batal" },

            {
                label: "Hapus",
                danger: true,
                run: async () => {
                    if (!disposed && (await commit(op)))
                        toast.success("Whiteboard sudah diperbarui.");
                },
            },
        ],
    });

    confirmations.add(id);
}

const setTool = (t) => (tool.value = t);

function down(e) {
    if (
        (!canEdit.value && tool.value !== "hand" && !spaceHeld) ||
        (tool.value !== "hand" && !spaceHeld && !props.roomToken) ||
        gesture ||
        (e.button !== 0 && e.button !== 1)
    )
        return;

    e.preventDefault();
    if (tool.value === "hand" || spaceHeld || e.button === 1) {
        const at = screenPoint(e);
        panStart = {
            pointerId: e.pointerId,
            x: at.x,
            y: at.y,
            camX: camera.x,
            camY: camera.y,
        };
        canvas.value.setPointerCapture(e.pointerId);
        return;
    }
    if (tool.value === "select") {
        const at = pointerPosition(e),
            found = hit(at);
        selectedId.value = found?.id || null;
        if (found) {
            dragStart = {
                pointerId: e.pointerId,
                point: at,
                original: cloneDocument(found),
                shape: cloneDocument(found),
                pageId: pageId.value,
            };
            canvas.value.setPointerCapture(e.pointerId);
        }
        render();
        return;
    }
    if (
        tool.value !== "eraser" &&
        tool.value !== "text" &&
        tool.value !== "sticky"
    ) {
        canvas.value.setPointerCapture(e.pointerId);
    }

    const p = pointerPosition(e);

    if (tool.value === "eraser") {
        const found = [...visibleObjects()]

            .reverse()

            .find((s) => pointInside(p, s));

        if (found)
            commit({ type: "remove", pageId: pageId.value, id: found.id });

        return;
    }

    if (tool.value === "text" || tool.value === "sticky") {
        openEditor({
            kind: tool.value,
            pageId: pageId.value,
            x: p.x,
            y: p.y,
            text: "",
        });

        return;
    }

    const s = {
        id: uid(),

        type: tool.value,

        color: color.value,

        width: lineWidth.value,

        x: p.x,

        y: p.y,

        x2: p.x,

        y2: p.y,

        points: [p],
    };

    gesture = { pageId: pageId.value, shape: s, pointerId: e.pointerId };

    render();
}

function move(e) {
    if (!canvas.value) return;

    if (panStart?.pointerId === e.pointerId) {
        const p = screenPoint(e);
        camera.x = panStart.camX + p.x - panStart.x;
        camera.y = panStart.camY + p.y - panStart.y;
        render();
        return;
    }
    if (dragStart?.pointerId === e.pointerId) {
        const p = pointerPosition(e);
        dragStart.shape = translateShape(
            dragStart.original,
            p.x - dragStart.point.x,
            p.y - dragStart.point.y,
        );
        render();
        return;
    }
    const p = pointerPosition(e),
        now = performance.now();

    if (now - lastCursorAt >= 45) {
        lastCursorAt = now;

        send(
            {
                type: "cursor",
                point: p,
                pageId: pageId.value,
                color: color.value,
            },

            false,
        );
    }

    if (!gesture || gesture.pointerId !== e.pointerId) return;

    const s = gesture.shape;

    if (s.type === "pen") {
        const last = s.points.at(-1);

        if (Math.hypot(p.x - last.x, p.y - last.y) > 2) s.points.push(p);

        if (s.points.length >= 1000)
            s.points = s.points.filter(
                (_, i) => i % 2 === 0 || i === s.points.length - 1,
            );
    } else {
        s.x2 = p.x;

        s.y2 = p.y;
    }

    if (now - lastDrawAt >= 35) {
        lastDrawAt = now;

        const sample =
            s.type === "pen"
                ? {
                      ...s,
                      points: s.points.filter(
                          (_, i) =>
                              i %
                                  Math.max(
                                      1,
                                      Math.ceil(s.points.length / 80),
                                  ) ===
                                  0 || i === s.points.length - 1,
                      ),
                  }
                : s;

        send({ type: "preview", pageId: gesture.pageId, shape: sample }, false);
    }

    render();
}

function up(e) {
    if (panStart?.pointerId === e.pointerId) {
        panStart = null;
        if (canvas.value?.hasPointerCapture(e.pointerId))
            canvas.value.releasePointerCapture(e.pointerId);
        return;
    }
    if (dragStart?.pointerId === e.pointerId) {
        const moved = dragStart;
        dragStart = null;
        if (canvas.value?.hasPointerCapture(e.pointerId))
            canvas.value.releasePointerCapture(e.pointerId);
        render();
        if (JSON.stringify(moved.shape) !== JSON.stringify(moved.original))
            void commit({
                type: "update",
                pageId: moved.pageId,
                object: moved.shape,
            });
        return;
    }

    if (!gesture || gesture.pointerId !== e.pointerId) return;

    const s = gesture.shape,
        p = pointerPosition(e);

    if (s.type === "pen") {
        const last = s.points.at(-1);

        if (last.x !== p.x || last.y !== p.y) s.points.push(p);
    }

    if (s.type !== "pen") {
        s.x2 = p.x;

        s.y2 = p.y;
    }

    const targetPage = gesture.pageId;

    gesture = null;

    // Queue before rendering so the stroke never disappears for a frame.
    // During a short reconnect, locally queue an already-started stroke;
    // the server still validates permission when the connection returns.
    if (canEdit.value) {
        void commit({ type: "add", pageId: targetPage, object: s });
    } else if (!disposed && isTemporaryReconnect()) {
        void queueOperation({ type: "add", pageId: targetPage, object: s });
    } else {
        // Do not bypass a revoked host permission or ended room.
        render();
    }

    void send({ type: "preview", pageId: targetPage, shape: null }, false);

    if (canvas.value?.hasPointerCapture(e.pointerId)) {
        canvas.value.releasePointerCapture(e.pointerId);
    }
}

function cancelGesture() {
    const pointerId = gesture?.pointerId ?? dragStart?.pointerId ?? panStart?.pointerId;
    const targetPage = gesture?.pageId;
    gesture = null;
    dragStart = null;
    panStart = null;

    if (pointerId !== undefined && canvas.value?.hasPointerCapture(pointerId))
        canvas.value.releasePointerCapture(pointerId);

    if (targetPage) void send({ type: "preview", pageId: targetPage, shape: null }, false);

    render();
}

function addPage() {
    const id = uid();

    commit({
        type: "page-add",
        id,
        name: `Page ${pages.value.length + 1}`,
    }).then((saved) => {
        if (saved && !disposed) {
            pageId.value = id;
            render();
        }
    });
}

function renamePage() {
    if (currentPage.value)
        openEditor({
            kind: "rename",
            pageId: pageId.value,
            text: currentPage.value.name,
        });
}

function deletePage() {
    if (pages.value.length > 1)
        confirmOperation(
            `Hapus halaman “${currentPage.value.name}” untuk semua peserta?`,
            { type: "page-delete", id: pageId.value },
        );
}

function clearPage() {
    if (currentPage.value)
        confirmOperation(
            `Hapus semua objek di “${currentPage.value.name}” untuk semua peserta?`,
            { type: "page-clear", pageId: pageId.value },
        );
}

const visibleCursors = computed(() =>
    Object.entries(cursors).filter(
        ([, p]) => p.pageId === pageId.value && Date.now() - p.seen < 10000,
    ),
);

function onWindowBlur() { spaceHeld = false; cancelGesture(); }
function beforeUnload(event) {
    if (!outbox.length) return;
    event.preventDefault();
    event.returnValue = "";
}

watch(
    () => props.room,

    (room) => {
        currentAccessToken = "";
        attach(room);
        void refresh();
    },
);

watch(
    () => props.roomToken,
    (token) => {
        currentAccessToken = token || "";
        if (token) {
            void refresh();
            void drainOutbox();
        }
    },
);

watch(pageId, () => {
    cancelGesture();
    selectedId.value = null;
    dragStart = null;
    history.value = [];
    historyIndex.value = -1;
    editor.value = null;
    render();
});

watch(
    () => control.value.writerIdentity,
    () => {
        cancelGesture();
        editor.value = null;

        Object.keys(preview).forEach((id) => delete preview[id]);

        // Do not discard unsaved drawing when another participant gets control.
        render();
        if (canEdit.value) void drainOutbox();
    },
);

onMounted(() => {
    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resizeCanvas);
        if (viewport.value) resizeObserver.observe(viewport.value);
    }

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("beforeunload", beforeUnload);
    resizeCanvas();

    attach(props.room);

    void refresh();

    poller = setInterval(() => {
        for (const [id, cursor] of Object.entries(cursors)) {
            if (Date.now() - cursor.seen >= 10000) delete cursors[id];
        }
        let expiredPreview = false;
        for (const [id, drawing] of Object.entries(preview)) {
            if (Date.now() - drawing.seen >= 10000) { delete preview[id]; expiredPreview = true; }
        }
        if (expiredPreview) render();

        if (
            isConnected.value &&
            !gesture &&
            !dragStart &&
            !panStart &&
            !fetching
        )
            void refresh();
    }, 5000);
});

onUnmounted(() => {
    disposed = true;
    outbox.forEach((item) => item.resolve(false));
    cancelGesture();
    // Pending edits are in memory only; show an unload warning while mounted.
    resizeObserver?.disconnect();
    window.removeEventListener("resize", resizeCanvas);
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("beforeunload", beforeUnload);

    confirmations.forEach(dismissToast);

    clearInterval(poller);

    detach();

    clearTimeout(refreshTimer);
});
</script>

<template>
    <section class="ms-board">
        <header class="board-header">
            <div class="board-label">
                <strong>✎ COLLABORATIVE WHITEBOARD</strong
                ><span
                    :class="['connection', isConnected ? 'online' : 'offline']"
                    >{{ isConnected ? "Live" : "Offline" }}</span
                >
            </div>

            <div class="board-pages">
                <button
                    v-for="p in pages"
                    :key="p.id"
                    :class="{ selected: p.id === pageId }"
                    @click="pageId = p.id"
                >
                    {{ p.name }}
                </button>

                <button
                    title="New page"
                    :disabled="!canEdit || pages.length >= 25"
                    @click="addPage"
                >
                    ＋ Page
                </button>

                <button
                    title="Rename page"
                    :disabled="!canEdit"
                    @click="renamePage"
                >
                    Rename
                </button>

                <button
                    title="Delete page"
                    :disabled="!canEdit || pages.length <= 1"
                    @click="deletePage"
                >
                    Delete
                </button>
            </div>
        </header>

        <div class="board-access" aria-live="polite">
            <span>✎ {{ writerName }} menggambar · satu giliran</span>

            <button
                v-if="isHost && !canEdit"
                :disabled="controlBusy"
                @click="changeControl('reclaim')"
            >
                Ambil kembali
            </button>

            <button
                v-else-if="!isHost && canEdit"
                :disabled="controlBusy"
                @click="changeControl('release')"
            >
                Selesai menggambar
            </button>

            <button
                v-else-if="!isHost"
                :disabled="controlBusy || loading || !isConnected"
                @click="changeControl(requested ? 'cancel' : 'request')"
            >
                {{ requested ? "Batalkan permintaan" : "Minta izin gambar" }}
            </button>

            <details
                v-if="isHost && control.requests.length"
                class="board-requests"
            >
                <summary>Permintaan ({{ control.requests.length }})</summary>
                <div>
                    <p
                        v-for="person in control.requests"
                        :key="person.identity"
                    >
                        <span>{{ person.name }}</span
                        ><button
                            :disabled="controlBusy"
                            @click="changeControl('grant', person.identity)"
                        >
                            Izinkan</button
                        ><button
                            :disabled="controlBusy"
                            @click="changeControl('deny', person.identity)"
                        >
                            Tolak
                        </button>
                    </p>
                </div>
            </details>
        </div>

        <div
            class="floating-toolbar"
            role="toolbar"
            aria-label="Whiteboard tools"
            @pointerdown.stop
            @mousedown.stop
            @touchstart.stop
        >
            <button
                v-for="t in [
                    'hand',
                    'select',
                    'rectangle',
                    'diamond',
                    'circle',
                    'arrow',
                    'line',
                    'pen',
                    'text',
                    'sticky',
                    'eraser',
                ]"
                :key="t"
                :title="toolNames[t]"
                :aria-label="toolNames[t]"
                :class="{ selected: tool === t }"
                :disabled="!canEdit && t !== 'hand'"
                @click="setTool(t)"
            >
                <span>{{
                    {
                        hand: "✋",
                        select: "↖",
                        rectangle: "▭",
                        diamond: "◇",
                        circle: "◯",
                        arrow: "➜",
                        line: "╱",
                        pen: "✎",
                        text: "T",
                        sticky: "▤",
                        eraser: "⌫",
                    }[t]
                }}</span>
            </button>
        </div>
        <aside
            class="floating-properties"
            v-if="!['hand'].includes(tool)"
            @pointerdown.stop
            @mousedown.stop
            @touchstart.stop
        >
            <small>Stroke</small>
            <div class="swatches">
                <button
                    v-for="c in [
                        '#303826',
                        '#4F5B2A',
                        '#d64545',
                        '#308d67',
                        '#3576c9',
                        '#f59e0b',
                    ]"
                    :key="c"
                    :style="{ background: c }"
                    :class="{ picked: color === c }"
                    @click="color = c"
                    :aria-label="c"
                ></button
                ><input v-model="color" type="color" title="Custom color" />
            </div>
            <small>Ketebalan · {{ lineWidth }}</small
            ><input v-model.number="lineWidth" type="range" min="2" max="16" />
            <button
                v-if="selectedId && canEdit"
                class="delete-object"
                @click="
                    commit({ type: 'remove', pageId, id: selectedId });
                    selectedId = null;
                "
            >
                Hapus objek
            </button>
        </aside>
        <div class="board-actions" @pointerdown.stop>
            <button :disabled="!canEdit" @click="undo">↶ Undo</button
            ><button :disabled="!canEdit" @click="redo">↷ Redo</button
            ><button class="danger" :disabled="!canEdit" @click="clearPage">
                Clear page</button
            ><span v-if="busy || waitingCount">Saving… {{ waitingCount }}</span>
            <span v-if="failedCount" class="unsaved-indicator" role="status"
                >Not saved · {{ failedCount }}</span
            >
            <button
                v-if="failedCount"
                type="button"
                :disabled="!canEdit"
                @click="retryUnsaved"
            >
                ↻ Retry
            </button>
        </div>
        <form v-if="editor" class="board-editor" @submit.prevent="saveEditor">
            <label for="board-text">{{
                editor.kind === "rename"
                    ? "Nama halaman"
                    : editor.kind === "sticky"
                      ? "Isi sticky note"
                      : "Teks di whiteboard"
            }}</label>

            <textarea
                id="board-text"
                ref="editorInput"
                v-model="editor.text"
                class="ms-input"
                :maxlength="editor.kind === 'rename' ? 80 : 1000"
                :rows="editor.kind === 'rename' ? 1 : 3"
                required
                @keydown.esc="editor = null"
            />

            <div>
                <button
                    class="ms-button ms-button-outline"
                    type="button"
                    @click="editor = null"
                >
                    Batal</button
                ><button
                    class="ms-button ms-button-primary"
                    :disabled="busy || !canEdit"
                >
                    Simpan
                </button>
            </div>
        </form>

        <p v-if="loading" role="status">Menyiapkan whiteboard bersama…</p>

        <button
            v-if="failed"
            class="ms-button ms-button-outline"
            @click="refresh"
        >
            Coba sinkronkan lagi ↻
        </button>

        <div ref="viewport" class="canvas-container">
            <div
                class="canvas-scale"
                :style="{
                    width: canvasSize.width + 'px',
                    height: canvasSize.height + 'px',
                }"
            >
                <canvas
                    ref="canvas"
                    :width="W"
                    :height="H"
                    @wheel="wheel"
                    @pointerdown="down"
                    @pointermove="move"
                    @pointerup="up"
                    aria-label="Kanvas whiteboard bersama"
                    :aria-disabled="!canEdit"
                    @pointercancel="cancelGesture"
                    @lostpointercapture="cancelGesture"
                />

                <div
                    v-for="[id, p] in visibleCursors"
                    :key="id"
                    class="peer-cursor"
                    :style="{
                        left: p.x * camera.zoom + camera.x + 'px',

                        top: p.y * camera.zoom + camera.y + 'px',

                        color: p.color,
                    }"
                >
                    <span>➤</span
                    ><b :style="{ background: p.color }">{{ p.name }}</b>
                </div>
            </div>
        </div>

        <div class="zoom-controls" @pointerdown.stop>
            <button type="button" title="Tampilkan semua gambar di layar" aria-label="Tampilkan semua gambar" @click="fitDrawing">⛶</button>
            <button @click="zoomAt(camera.zoom / 1.2)">−</button
            ><button @click="resetView">
                {{ Math.round(camera.zoom * 100) }}%</button
            ><button @click="zoomAt(camera.zoom * 1.2)">+</button>
        </div>
        <small
            >Cursor semua peserta tetap live.
            {{
                canEdit
                    ? "Giliranmu menggambar."
                    : "Papan hanya dapat diubah oleh pemegang izin."
            }}</small
        >
    </section>
</template>

<style scoped>
.ms-board {
    display: flex;

    flex-direction: column;

    gap: 12px;

    min-width: 0;

    color: var(--text-primary);
}

.board-header {
    display: flex;

    flex-direction: column;

    gap: 10px;
}

.board-label {
    display: flex;

    align-items: center;

    gap: 12px;

    font-size: 12px;

    letter-spacing: 0.6px;
}

.connection {
    border-radius: 20px;

    padding: 3px 9px;

    font-size: 11px;
}

.online {
    background: #dcfce7;

    color: #166534;
}

.offline {
    background: #fee2e2;

    color: #991b1b;
}

.board-pages,
.board-tools {
    display: flex;

    flex-wrap: wrap;

    gap: 7px;

    align-items: center;
}

.board-pages button,
.board-tools button {
    border: 1px solid var(--border-color, #d9d2c4);

    border-radius: 9px;

    background: var(--bg-surface, #fff);

    padding: 8px 11px;

    color: var(--text-primary, #202020);

    cursor: pointer;

    font-weight: 600;

    font-size: 12px;
}

.board-pages button.selected,
.board-tools button.selected {
    background: #4f5b2a;

    color: #fff;
}

.board-tools .danger {
    margin-left: auto;

    border-color: #dca4a4;

    color: #a22929;
}

.board-tools input[type="color"] {
    width: 35px;

    height: 35px;

    border: none;

    cursor: pointer;

    background: transparent;
}

.brush {
    display: flex;

    align-items: center;

    gap: 7px;

    font-size: 12px;
}

.saving {
    font-size: 11px;

    opacity: 0.7;
}

.canvas-container {
    width: 100%;

    overflow: hidden;

    border: 2px solid #4f5b2a;

    border-radius: 14px;

    background: #fffcf7;
}

.canvas-scale {
    position: relative;

    width: 100%;

    aspect-ratio: 12/7;
}

.canvas-scale canvas {
    display: block;

    width: 100%;

    height: 100%;

    touch-action: none;

    cursor: crosshair;
}

.peer-cursor {
    position: absolute;

    pointer-events: none;

    transform: translate(0, -5px);

    font-size: 21px;

    z-index: 2;

    filter: drop-shadow(0 1px 1px #fff);
}

.peer-cursor b {
    display: block;

    position: absolute;

    top: 18px;

    left: 12px;

    max-width: 120px;

    white-space: nowrap;

    text-overflow: ellipsis;

    overflow: hidden;

    color: white;

    font-size: 10px;

    font-weight: 600;

    border-radius: 5px;

    padding: 3px 6px;
}

.error {
    color: #c0392b;
}

.ms-board small {
    font-size: 11px;
}

.board-editor {
    display: grid;
    gap: 10px;
    padding: 16px;
    border: 2px solid var(--border-color);
    border-radius: 14px;
    background: var(--bg-elevated);
}
.board-editor label {
    font-size: 13px;
    font-weight: 900;
}
.board-editor > div {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
.board-editor textarea {
    width: 100%;
    resize: vertical;
}
.ms-board {
    flex-shrink: 0;
}
.unsaved-indicator {
    color: #a32929;
    font-size: 11px;
    font-weight: 800;
    padding: 5px;
    background: #fff1f0;
    border-radius: 6px;
}
</style>

<style scoped>
.ms-board {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    gap: 5px;
}

.board-header {
    gap: 5px;
    flex: none;
}
.board-label {
    font-size: 10px;
    gap: 7px;
}

.board-pages,
.board-tools {
    flex-wrap: nowrap;
    overflow-x: auto;
    flex: none;
    gap: 4px;
    padding-bottom: 3px;
}

.board-pages button,
.board-tools button,
.board-access button {
    flex: none;
    white-space: nowrap;
    padding: 5px 7px;
    font-size: 11px;
    border: 1px solid var(--border-color);
    border-radius: 7px;
    background: var(--bg-surface);
    color: var(--text-primary);
}

.board-tools label {
    flex: none;
}
.board-tools input[type="color"] {
    width: 26px;
    height: 26px;
}
.brush input {
    width: 65px;
}

.canvas-container {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 0;
    background: transparent;
}

.canvas-scale {
    flex: none;
    overflow: hidden;
    outline: 1px solid #4f5b2a;
    border-radius: 8px;
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: unset;
}

.board-access {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: none;
    font-size: 11px;
    min-height: 25px;
    flex-wrap: wrap;
}

.board-access > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.board-access button {
    font-weight: 800;
    cursor: pointer;
}

.board-requests > div {
    position: absolute;
    right: 5px;
    top: 80px;
    z-index: 6;
    max-height: 180px;
    overflow: auto;
    width: min(340px, 95%);
    padding: 10px;
    border: 2px solid var(--ms-line);
    border-radius: 9px;
    background: var(--bg-surface);
    box-shadow: 3px 3px 0 var(--ms-line);
}

.board-requests summary {
    cursor: pointer;
    font-weight: 900;
}
.board-requests p {
    display: flex;
    gap: 5px;
    align-items: center;
    margin: 6px 0;
}
.board-requests p span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.board-editor {
    position: absolute;
    z-index: 5;
    left: 10px;
    right: 10px;
    top: 60px;
    max-height: calc(100% - 65px);
    overflow: auto;
    box-shadow: 3px 3px 0 var(--ms-line);
}

.ms-board small {
    font-size: 10px;
    flex: none;
}
.ms-board button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

@media (max-height: 550px) {
    .board-label,
    .ms-board > small {
        display: none;
    }
    .board-access {
        font-size: 10px;
    }
}
</style>

<style scoped>
.ms-board {
    position: relative;
    isolation: isolate;
    min-height: 420px;
    flex: 1;
    overflow: hidden;
    gap: 0 !important;
}
.board-header {
    position: absolute;
    z-index: 12;
    top: 8px;
    left: 10px;
    right: 10px;
    pointer-events: none;
}
.board-label,
.board-pages {
    pointer-events: auto;
}
.board-pages {
    max-width: calc(100% - 10px);
    gap: 4px;
}
.board-access {
    position: absolute;
    z-index: 12;
    top: 84px;
    right: 10px;
    max-width: 55%;
    background: var(--bg-surface, #fff);
    padding: 6px 9px;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 9px;
    box-shadow: 0 2px 8px #0001;
}
.canvas-container {
    position: absolute !important;
    inset: 0;
    z-index: 0;
    background: #fffcf7 !important;
    overflow: hidden;
    display: block !important;
}
.canvas-scale {
    position: absolute;
    left: 0;
    top: 0;
    max-width: none !important;
    max-height: none !important;
    outline: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
}
.canvas-scale canvas {
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
}
.floating-toolbar {
    position: absolute;
    top: 120px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    gap: 3px;
    padding: 6px;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 12px;
    box-shadow: 0 4px 20px #0002;
    max-width: calc(100% - 30px);
    overflow: auto;
}
.floating-toolbar button {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    background: transparent;
    border: 0;
    border-radius: 7px;
    font-size: 19px;
    color: var(--text-primary, #303826);
    cursor: pointer;
}
.floating-toolbar button.selected {
    background: #e5e2ff;
    color: #5149c9;
}
.floating-toolbar button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}
.floating-properties {
    position: absolute;
    z-index: 10;
    top: 170px;
    left: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 10px;
    padding: 12px;
    width: 152px;
    box-shadow: 0 4px 15px #0001;
}
.floating-properties small {
    font-size: 11px;
    font-weight: 700;
}
.swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}
.swatches button {
    width: 19px;
    height: 19px;
    border-radius: 5px;
    border: 1px solid #0002;
    padding: 0;
    cursor: pointer;
}
.swatches button.picked {
    outline: 2px solid #6d64dc;
    outline-offset: 2px;
}
.swatches input {
    width: 25px;
    height: 25px;
    border: 0;
    padding: 0;
}
.floating-properties input[type="range"] {
    width: 100%;
}
.delete-object {
    border: 1px solid #db8585;
    background: #fff3f3;
    border-radius: 6px;
    padding: 6px;
    cursor: pointer;
}
.board-actions {
    position: absolute;
    z-index: 10;
    right: 12px;
    bottom: 14px;
    display: flex;
    gap: 4px;
    align-items: center;
}
.board-actions button,
.zoom-controls button {
    padding: 7px 10px;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 7px;
    cursor: pointer;
    color: var(--text-primary, #303826);
}
.board-actions button:disabled {
    opacity: 0.35;
}
.board-actions .danger {
    color: #b64d4d;
}
.zoom-controls {
    position: absolute;
    z-index: 10;
    left: 12px;
    bottom: 14px;
    display: flex;
    gap: 3px;
}
.ms-board > small {
    display: none;
}
.board-editor {
    z-index: 20;
    left: 50% !important;
    transform: translateX(-50%);
    max-width: 400px;
    top: 200px !important;
}
@media (max-width: 750px) {
    .floating-toolbar {
        top: 122px;
        left: 10px;
        transform: none;
    }
    .floating-properties {
        top: auto;
        bottom: 55px;
        width: 132px;
    }
    .board-access {
        max-width: 75%;
        top: 78px;
    }
    .floating-toolbar button {
        width: 29px;
        height: 30px;
    }
    .board-actions {
        bottom: 55px;
    }
}

/* MeetSpace responsive interaction patch */
.ms-board {
    min-height: 0 !important;
    width: 100%;
    container-type: size;
}
.board-header {
    top: 8px;
    left: 12px;
    right: 12px;
}
.board-pages {
    max-width: min(55%, 530px);
}
.board-access {
    top: 12px;
    right: 12px;
    max-width: 37%;
    min-height: 30px;
}
.floating-toolbar {
    top: 62px;
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    max-width: min(calc(100% - 24px), 510px);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    touch-action: pan-x;
    pointer-events: auto;
    z-index: 30;
    -webkit-overflow-scrolling: touch;
}
.floating-properties {
    top: 122px;
    bottom: auto;
    left: 12px;
    z-index: 29;
    max-height: calc(100% - 195px);
    overflow-y: auto;
    pointer-events: auto;
}
.board-actions,
.zoom-controls {
    z-index: 29;
    pointer-events: auto;
}
.board-header {
    z-index: 31;
}
.board-access {
    z-index: 28;
}
.canvas-container {
    z-index: 0;
}
.board-editor {
    z-index: 40;
}
.floating-toolbar button,
.floating-properties button,
.board-actions button,
.zoom-controls button {
    touch-action: manipulation;
}
@container (max-width: 740px) {
    .board-header {
        top: 6px;
        left: 8px;
        right: 8px;
    }
    .board-pages {
        max-width: 100%;
    }
    .board-access {
        top: 89px;
        left: 8px;
        right: auto;
        max-width: calc(100% - 16px);
    }
    .floating-toolbar {
        top: 126px;
        left: 8px;
        transform: none;
        max-width: calc(100% - 16px);
    }
    .floating-properties {
        top: 182px;
        left: 8px;
        width: 132px;
        max-height: calc(100% - 248px);
    }
    .board-actions {
        right: 8px;
        bottom: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
        max-width: 65%;
    }
    .zoom-controls {
        left: 8px;
        bottom: 8px;
    }
}
@container (max-height: 390px) {
    .board-label {
        display: none;
    }
    .floating-toolbar {
        top: 48px;
    }
    .floating-properties {
        top: 96px;
    }
    .board-access {
        top: 6px;
    }
}
</style>

import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
} from "livekit-client";
import { mountDeviceSettings } from "./device-settings.js";
import "./style.css";

const app = document.getElementById("app");
const ROOM_KEY = "view-ijaz-from-everywhere";

function getRoomFromUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get("room");
  if (fromQuery) return fromQuery;

  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  if (!path || path === "index.html") return null;
  return decodeURIComponent(path);
}

function roomUrl(roomId) {
  return `${window.location.origin}/${encodeURIComponent(roomId)}`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

function mediaErrorMessage(e) {
  if (!window.isSecureContext) {
    return "Camera/mic require HTTPS — use https:// address and accept the certificate warning";
  }
  if (e?.name === "NotAllowedError") {
    return "Permission denied — allow camera/mic access in your browser";
  }
  return e?.message || "Could not access camera/mic";
}

function apiHostParams() {
  const secure = window.location.protocol === "https:" ? 1 : 0;
  return `host=${encodeURIComponent(window.location.hostname)}&secure=${secure}`;
}

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

// --- Screens ---

function renderLanding() {
  app.innerHTML = `
    <div class="screen">
      <div class="card">
        <div class="icon">📹</div>
        <h1>Join a call</h1>
        <p>Enter your invite code to continue.</p>
        <form id="access-form">
          <input
            type="password"
            id="room-key-input"
            placeholder="Invite code"
            required
            autofocus
            autocomplete="off"
          />
          <button class="btn-primary" type="submit">Continue</button>
        </form>
        <p class="error" id="error" hidden></p>
      </div>
    </div>
  `;

  document.getElementById("access-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const key = document.getElementById("room-key-input").value.trim();
    const errEl = document.getElementById("error");

    if (key === ROOM_KEY) {
      window.location.href = roomUrl(ROOM_KEY);
      return;
    }

    errEl.textContent = "Invalid invite code";
    errEl.hidden = false;
  });
}

function renderJoin(roomId) {
  app.innerHTML = `
    <div class="screen">
      <div class="card">
        <div class="icon">👋</div>
        <h1>Join the call</h1>
        <p>Enter your name to join. You'll appear as a thumbnail — enable video anytime.</p>
        <form id="join-form">
          <input type="text" id="name-input" placeholder="Your name" maxlength="50" required autofocus />
          <button class="btn-primary" type="submit">Join call</button>
        </form>
        <p class="error" id="error" hidden></p>
      </div>
    </div>
  `;

  document.getElementById("join-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("name-input").value.trim();
    const errEl = document.getElementById("error");
    if (!name) return;

    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Joining…";
    errEl.hidden = true;

    try {
      const res = await fetch(
        `/api/token?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}&${apiHostParams()}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join");
      }
      const creds = await res.json();
      await enterRoom(roomId, creds);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = "Join call";
    }
  });
}

// --- Room logic ---

const tiles = new Map();
let room = null;
let localName = "";
let deviceSettings = null;

function createTile(participantId, name) {
  const tile = document.createElement("div");
  tile.className = "participant-tile";
  tile.dataset.participantId = participantId;

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = participantId === "local";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = initials(name);
  avatar.style.background = avatarColor(name);

  const badge = document.createElement("div");
  badge.className = "name-badge";
  badge.textContent = name;

  const mutedIcon = document.createElement("div");
  mutedIcon.className = "muted-icon";
  mutedIcon.textContent = "🔇";

  tile.append(video, avatar, badge, mutedIcon);
  return tile;
}

function updateGridCount() {
  const grid = document.getElementById("video-grid");
  if (grid) {
    grid.dataset.count = String(tiles.size);
  }
  const countEl = document.getElementById("participant-count");
  if (countEl) {
    countEl.textContent = `${tiles.size} participant${tiles.size !== 1 ? "s" : ""}`;
  }
}

function attachTrack(participantId, track) {
  const tile = tiles.get(participantId);
  if (!tile) return;

  const video = tile.querySelector("video");
  const avatar = tile.querySelector(".avatar");

  if (track.kind === Track.Kind.Video) {
    track.attach(video);
    avatar.classList.add("hidden");
  }

  if (track.kind === Track.Kind.Audio) {
    track.attach(video);
  }
}

function detachTrack(participantId, track) {
  const tile = tiles.get(participantId);
  if (!tile) return;

  track.detach();

  if (track.kind === Track.Kind.Video) {
    const avatar = tile.querySelector(".avatar");
    avatar.classList.remove("hidden");
  }
}

function addParticipant(participantId, name, isLocal = false) {
  if (tiles.has(participantId)) return;

  const tile = createTile(participantId, name);
  tiles.set(participantId, tile);

  const grid = document.getElementById("video-grid");
  grid.appendChild(tile);
  updateGridCount();

  if (isLocal && room) {
    const lp = room.localParticipant;
    for (const pub of lp.videoTrackPublications.values()) {
      if (pub.track) attachTrack(participantId, pub.track);
    }
    for (const pub of lp.audioTrackPublications.values()) {
      if (pub.track) attachTrack(participantId, pub.track);
      updateMutedState(participantId, pub.isMuted);
    }
  }
}

function removeParticipant(participantId) {
  const tile = tiles.get(participantId);
  if (!tile) return;
  tile.remove();
  tiles.delete(participantId);
  updateGridCount();
}

function updateMutedState(participantId, isMuted) {
  const tile = tiles.get(participantId);
  if (!tile) return;
  tile.querySelector(".muted-icon").classList.toggle("visible", isMuted);
}

function setupParticipantEvents(participant, participantId) {
  participant.on("trackSubscribed", (track) => {
    attachTrack(participantId, track);
  });

  participant.on("trackUnsubscribed", (track) => {
    detachTrack(participantId, track);
  });

  participant.on("trackMuted", (pub) => {
    if (pub.kind === Track.Kind.Audio) {
      updateMutedState(participantId, true);
    }
    if (pub.kind === Track.Kind.Video && pub.track) {
      detachTrack(participantId, pub.track);
    }
  });

  participant.on("trackUnmuted", (pub) => {
    if (pub.kind === Track.Kind.Audio) {
      updateMutedState(participantId, false);
    }
    if (pub.kind === Track.Kind.Video && pub.track) {
      attachTrack(participantId, pub.track);
    }
  });

  participant.on("isSpeakingChanged", (speaking) => {
    const tile = tiles.get(participantId);
    if (tile) tile.classList.toggle("speaking", speaking);
  });

  for (const pub of participant.trackPublications.values()) {
    if (pub.track && pub.isSubscribed) {
      attachTrack(participantId, pub.track);
    }
    if (pub.kind === Track.Kind.Audio) {
      updateMutedState(participantId, pub.isMuted);
    }
  }
}

async function enterRoom(roomId, creds) {
  localName = creds.name;

  app.innerHTML = `
    <div class="room">
      <div class="room-header">
        <h2>Video Room</h2>
        <div style="display:flex;align-items:center;gap:1rem;">
          <span class="participant-count" id="participant-count">1 participant</span>
          <button class="copy-link-btn" id="copy-link">Copy invite link</button>
        </div>
      </div>
      <div class="video-grid" id="video-grid" data-count="1"></div>
      <div class="controls">
        <button class="control-btn" id="toggle-mic" title="Toggle microphone">🎤</button>
        <button class="control-btn" id="toggle-cam" title="Toggle camera">📷</button>
        <button class="control-btn" id="device-settings-btn" title="Camera &amp; mic settings">⚙️</button>
        <button class="control-btn leave" id="leave">Leave</button>
      </div>
      <div class="device-settings" id="device-settings" hidden>
        <div class="device-settings-backdrop"></div>
        <div class="device-settings-panel">
          <div class="device-settings-header">
            <h3>Device settings</h3>
            <button type="button" class="device-settings-close" aria-label="Close">✕</button>
          </div>
          <div class="device-settings-body">
            <div class="device-field">
              <label for="camera-select">Camera</label>
              <select id="camera-select"></select>
            </div>
            <div class="device-field" id="facing-row" hidden>
              <span class="device-field-label">Facing</span>
              <div class="device-facing-btns">
                <button type="button" id="facing-front">Front</button>
                <button type="button" id="facing-back">Back</button>
              </div>
            </div>
            <div class="device-field">
              <label for="mic-select">Microphone</label>
              <select id="mic-select"></select>
            </div>
            <div class="device-field" id="speaker-row" hidden>
              <label for="speaker-select">Speaker</label>
              <select id="speaker-select"></select>
            </div>
            <section id="camera-controls">
              <h4>Camera controls</h4>
              <p class="device-settings-hint" id="camera-controls-hint"></p>
              <div id="camera-controls-list"></div>
            </section>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("copy-link").addEventListener("click", () => {
    const url = roomUrl(roomId);
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById("copy-link");
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy invite link"), 2000);
    });
  });

  room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    addParticipant(participant.identity, participant.name || participant.identity);
    setupParticipantEvents(participant, participant.identity);
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    removeParticipant(participant.identity);
  });

  room.on(RoomEvent.LocalTrackPublished, (pub) => {
    if (pub.track) attachTrack("local", pub.track);
    syncControlButtons();
    deviceSettings?.refresh();
  });

  room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
    if (pub.track) detachTrack("local", pub.track);
    syncControlButtons();
    deviceSettings?.refresh();
  });

  room.on(RoomEvent.Disconnected, () => {
    window.location.href = "/";
  });

  await room.connect(creds.url, creds.token);

  addParticipant("local", localName, true);
  setupParticipantEvents(room.localParticipant, "local");

  for (const participant of room.remoteParticipants.values()) {
    addParticipant(participant.identity, participant.name || participant.identity);
    setupParticipantEvents(participant, participant.identity);
  }

  await room.localParticipant.setMicrophoneEnabled(false);
  await room.localParticipant.setCameraEnabled(false);

  document.getElementById("toggle-mic").addEventListener("click", toggleMic);
  document.getElementById("toggle-cam").addEventListener("click", toggleCam);
  document.getElementById("leave").addEventListener("click", leaveRoom);

  deviceSettings = mountDeviceSettings(room, {
    onError: (e) => alert(e?.message || "Could not change device settings"),
  });

  syncControlButtons();
}

function syncControlButtons() {
  if (!room) return;
  const micBtn = document.getElementById("toggle-mic");
  const camBtn = document.getElementById("toggle-cam");
  const micOn = room.localParticipant.isMicrophoneEnabled;
  const camOn = room.localParticipant.isCameraEnabled;

  micBtn.classList.toggle("off", !micOn);
  micBtn.classList.toggle("active", micOn);
  camBtn.classList.toggle("off", !camOn);
  camBtn.classList.toggle("active", camOn);

  updateMutedState("local", !micOn);
}

async function toggleMic() {
  if (!room) return;
  try {
    const enabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    syncControlButtons();
  } catch (e) {
    alert(mediaErrorMessage(e));
  }
}

async function toggleCam() {
  if (!room) return;
  try {
    const enabled = room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(!enabled);
    syncControlButtons();
  } catch (e) {
    alert(mediaErrorMessage(e));
  }
}

async function leaveRoom() {
  deviceSettings?.destroy();
  deviceSettings = null;
  if (room) {
    await room.disconnect();
    room = null;
  }
  window.location.href = "/";
}

// --- Boot ---

const roomId = getRoomFromUrl();
if (roomId === ROOM_KEY) {
  renderJoin(roomId);
} else if (roomId) {
  app.innerHTML = `
    <div class="screen">
      <div class="card">
        <div class="icon">🚫</div>
        <h1>Room not found</h1>
        <p>This link is not valid.</p>
        <a class="btn-primary" href="/">Back to home</a>
      </div>
    </div>
  `;
} else {
  renderLanding();
}

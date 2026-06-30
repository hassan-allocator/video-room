import { Room, Track } from "livekit-client";

const CAPABILITY_LABELS = {
  zoom: "Zoom",
  focusMode: "Focus mode",
  focusDistance: "Focus distance",
  exposureMode: "Exposure mode",
  exposureCompensation: "Exposure compensation",
  exposureTime: "Exposure time",
  whiteBalanceMode: "White balance",
  colorTemperature: "Color temperature",
  brightness: "Brightness",
  contrast: "Contrast",
  saturation: "Saturation",
  sharpness: "Sharpness",
  pan: "Pan",
  tilt: "Tilt",
  roll: "Roll",
  torch: "Torch",
  iso: "ISO",
};

const SKIP_CAPABILITIES = new Set([
  "deviceId",
  "groupId",
  "width",
  "height",
  "frameRate",
  "aspectRatio",
  "resizeMode",
  "facingMode",
  "sampleRate",
  "sampleSize",
  "channelCount",
  "latency",
  "echoCancellation",
  "autoGainControl",
  "noiseSuppression",
  "voiceIsolation",
]);

function labelFor(key) {
  return (
    CAPABILITY_LABELS[key] ||
    key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())
  );
}

function getLocalVideoTrack(room) {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
  return pub?.track ?? null;
}

function getCameraMediaTrack(room) {
  return getLocalVideoTrack(room)?.mediaStreamTrack ?? null;
}

function setCaptureDefault(room, kind, deviceId) {
  if (kind === "videoinput") {
    room.options.videoCaptureDefaults = {
      ...room.options.videoCaptureDefaults,
      deviceId,
    };
  } else if (kind === "audioinput") {
    room.options.audioCaptureDefaults = {
      ...room.options.audioCaptureDefaults,
      deviceId,
    };
  }
}

function normalizeDeviceId(deviceId) {
  if (typeof deviceId === "string") return deviceId;
  if (deviceId && typeof deviceId === "object") {
    return deviceId.exact ?? deviceId.ideal;
  }
  return undefined;
}

function preferredDeviceId(room, kind) {
  const active = room.getActiveDevice(kind);
  if (active) return active;
  if (kind === "videoinput") {
    return normalizeDeviceId(room.options.videoCaptureDefaults?.deviceId);
  }
  if (kind === "audioinput") {
    return normalizeDeviceId(room.options.audioCaptureDefaults?.deviceId);
  }
  return undefined;
}

function isDeviceKindActive(room, kind) {
  if (kind === "videoinput") return room.localParticipant.isCameraEnabled;
  if (kind === "audioinput") return room.localParticipant.isMicrophoneEnabled;
  return true;
}

async function applyConstraint(mediaTrack, key, value) {
  const patch = { [key]: value };
  try {
    await mediaTrack.applyConstraints(patch);
  } catch {
    await mediaTrack.applyConstraints({ advanced: [patch] });
  }
}

function controlSpec(key, cap) {
  if (cap == null || cap === true) return null;

  if (Array.isArray(cap)) {
    if (cap.length === 0) return null;
    if (cap.length === 2 && cap.includes(false) && cap.includes(true)) {
      return { type: "toggle", value: false };
    }
    return { type: "select", options: cap };
  }

  if (typeof cap === "object" && "min" in cap && "max" in cap) {
    const step =
      cap.step ?? (cap.max - cap.min <= 10 ? 0.1 : (cap.max - cap.min) / 100);
    return {
      type: "range",
      min: cap.min,
      max: cap.max,
      step,
    };
  }

  return null;
}

function deviceLabel(device, index) {
  if (device.label) return device.label;
  const kind =
    device.kind === "videoinput"
      ? "Camera"
      : device.kind === "audioinput"
        ? "Microphone"
        : "Speaker";
  return `${kind} ${index + 1}`;
}

function supportsSpeakerSelection() {
  return typeof HTMLMediaElement.prototype.setSinkId === "function";
}

export function mountDeviceSettings(room, { onError } = {}) {
  const panel = document.getElementById("device-settings");
  const openBtn = document.getElementById("device-settings-btn");
  if (!panel || !openBtn) return;

  const closeBtn = panel.querySelector(".device-settings-close");
  const backdrop = panel.querySelector(".device-settings-backdrop");
  const cameraSelect = panel.querySelector("#camera-select");
  const micSelect = panel.querySelector("#mic-select");
  const speakerSelect = panel.querySelector("#speaker-select");
  const speakerRow = panel.querySelector("#speaker-row");
  const facingRow = panel.querySelector("#facing-row");
  const facingFront = panel.querySelector("#facing-front");
  const facingBack = panel.querySelector("#facing-back");
  const controlsSection = panel.querySelector("#camera-controls");
  const controlsList = panel.querySelector("#camera-controls-list");
  const controlsHint = panel.querySelector("#camera-controls-hint");

  let deviceChangeHandler = null;

  function reportError(err) {
    if (onError) onError(err);
    else console.warn(err);
  }

  function openPanel() {
    panel.hidden = false;
    refreshDevices();
    refreshCameraControls();
  }

  function closePanel() {
    panel.hidden = true;
  }

  async function refreshDevices() {
    try {
      const [cameras, mics, speakers] = await Promise.all([
        Room.getLocalDevices("videoinput"),
        Room.getLocalDevices("audioinput"),
        supportsSpeakerSelection()
          ? Room.getLocalDevices("audiooutput")
          : Promise.resolve([]),
      ]);

      fillSelect(cameraSelect, cameras, preferredDeviceId(room, "videoinput"));
      fillSelect(micSelect, mics, preferredDeviceId(room, "audioinput"));

      if (supportsSpeakerSelection() && speakers.length) {
        speakerRow.hidden = false;
        fillSelect(
          speakerSelect,
          speakers,
          preferredDeviceId(room, "audiooutput")
        );
      } else {
        speakerRow.hidden = true;
      }

      const mediaTrack = getCameraMediaTrack(room);
      const caps = mediaTrack?.getCapabilities?.() ?? {};
      const hasFacing =
        (Array.isArray(caps.facingMode) && caps.facingMode.length > 0) ||
        cameras.length >= 2;
      facingRow.hidden = !hasFacing;
    } catch (err) {
      reportError(err);
    }
  }

  function fillSelect(select, devices, activeId) {
    select.innerHTML = "";
    if (!devices.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No devices found";
      select.appendChild(opt);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    for (const [index, device] of devices.entries()) {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = deviceLabel(device, index);
      if (device.deviceId === activeId) opt.selected = true;
      select.appendChild(opt);
    }
  }

  async function switchDevice(kind, deviceId, selectEl) {
    if (!deviceId) return;
    selectEl.disabled = true;
    try {
      setCaptureDefault(room, kind, deviceId);
      if (isDeviceKindActive(room, kind)) {
        await room.switchActiveDevice(kind, deviceId);
      }
      refreshCameraControls();
    } catch (err) {
      reportError(err);
    } finally {
      selectEl.disabled = false;
    }
  }

  function refreshCameraControls() {
    controlsList.innerHTML = "";
    const mediaTrack = getCameraMediaTrack(room);
    const camOn = room.localParticipant.isCameraEnabled;

    if (!camOn || !mediaTrack?.getCapabilities) {
      controlsSection.hidden = false;
      controlsHint.textContent = camOn
        ? "This camera does not expose extra controls in your browser."
        : "Turn on your camera to adjust zoom, focus, and other device controls.";
      return;
    }

    const caps = mediaTrack.getCapabilities();
    const settings = mediaTrack.getSettings();
    let count = 0;

    for (const [key, cap] of Object.entries(caps)) {
      if (SKIP_CAPABILITIES.has(key)) continue;
      const spec = controlSpec(key, cap);
      if (!spec) continue;

      count += 1;
      const row = document.createElement("div");
      row.className = "device-control-row";

      const label = document.createElement("label");
      label.textContent = labelFor(key);
      row.appendChild(label);

      const current = settings[key];

      if (spec.type === "range") {
        const wrap = document.createElement("div");
        wrap.className = "device-control-range";

        const input = document.createElement("input");
        input.type = "range";
        input.min = String(spec.min);
        input.max = String(spec.max);
        input.step = String(spec.step);
        input.value = String(current ?? spec.min);

        const valueEl = document.createElement("span");
        valueEl.className = "device-control-value";
        valueEl.textContent = input.value;

        input.addEventListener("input", () => {
          valueEl.textContent = input.value;
        });

        input.addEventListener("change", async () => {
          try {
            await applyConstraint(mediaTrack, key, Number(input.value));
            valueEl.textContent = String(
              mediaTrack.getSettings()[key] ?? input.value
            );
          } catch (err) {
            reportError(err);
          }
        });

        wrap.append(input, valueEl);
        row.appendChild(wrap);
      } else if (spec.type === "select") {
        const select = document.createElement("select");
        for (const option of spec.options) {
          const opt = document.createElement("option");
          opt.value = String(option);
          opt.textContent = String(option);
          if (option === current) opt.selected = true;
          select.appendChild(opt);
        }
        select.addEventListener("change", async () => {
          try {
            await applyConstraint(mediaTrack, key, select.value);
          } catch (err) {
            reportError(err);
          }
        });
        row.appendChild(select);
      } else if (spec.type === "toggle") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "device-toggle-btn";
        btn.textContent = current ? "On" : "Off";
        btn.classList.toggle("active", Boolean(current));
        btn.addEventListener("click", async () => {
          try {
            const next = !mediaTrack.getSettings()[key];
            await applyConstraint(mediaTrack, key, next);
            btn.textContent = next ? "On" : "Off";
            btn.classList.toggle("active", next);
          } catch (err) {
            reportError(err);
          }
        });
        row.appendChild(btn);
      }

      controlsList.appendChild(row);
    }

    controlsSection.hidden = false;
    controlsHint.textContent = count
      ? "Controls depend on your camera and browser — not all devices support zoom or focus."
      : "This camera does not expose extra controls in your browser.";
  }

  async function switchFacing(facingMode) {
    const videoTrack = getLocalVideoTrack(room);
    if (!videoTrack) {
      room.options.videoCaptureDefaults = {
        ...room.options.videoCaptureDefaults,
        facingMode,
      };
      return;
    }
    try {
      await videoTrack.restartTrack({ facingMode });
      refreshCameraControls();
    } catch (err) {
      reportError(err);
    }
  }

  openBtn.addEventListener("click", openPanel);
  closeBtn?.addEventListener("click", closePanel);
  backdrop?.addEventListener("click", closePanel);

  cameraSelect.addEventListener("change", () => {
    switchDevice("videoinput", cameraSelect.value, cameraSelect);
  });
  micSelect.addEventListener("change", () => {
    switchDevice("audioinput", micSelect.value, micSelect);
  });
  speakerSelect?.addEventListener("change", () => {
    switchDevice("audiooutput", speakerSelect.value, speakerSelect);
  });
  facingFront?.addEventListener("click", () => switchFacing("user"));
  facingBack?.addEventListener("click", () => switchFacing("environment"));

  deviceChangeHandler = () => refreshDevices();
  navigator.mediaDevices?.addEventListener("devicechange", deviceChangeHandler);

  return {
    refresh: () => {
      refreshDevices();
      refreshCameraControls();
    },
    destroy: () => {
      navigator.mediaDevices?.removeEventListener("devicechange", deviceChangeHandler);
    },
  };
}

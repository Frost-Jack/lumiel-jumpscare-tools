export const isVideoPath = path => /\.(?:webm|mp4|m4v|ogv|ogg|mov)$/i.test(String(path).split(/[?#]/)[0]);
const isGIF = path => /\.gif$/i.test(String(path).split(/[?#]/)[0]);

function videoElement() {
  const video = document.createElement("video");
  video.controls = false;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback noplaybackrate");
  video.setAttribute("disablepictureinpicture", "");
  video.tabIndex = -1;
  return video;
}

function videoReady(video) {
  return new Promise((resolve, reject) => {
    const clean = () => {
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("error", failed);
    };
    const loaded = () => { clean(); resolve(); };
    const failed = () => { clean(); reject(new Error("Не удалось открыть видео.")); };
    video.addEventListener("loadeddata", loaded, {once: true});
    video.addEventListener("error", failed, {once: true});
    video.load();
  });
}

export async function loadMedia(path) {
  const kind = isVideoPath(path) ? "video" : "image";
  let blob, url = path;
  if (kind === "video" || isGIF(path)) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Файл не найден.");
    blob = await response.blob();
    url = URL.createObjectURL(blob);
  }
  const element = kind === "video" ? videoElement() : new Image();
  element.src = url;
  if (kind === "video") { element.muted = true; element.preload = "auto"; }
  try {
    if (kind === "video") await videoReady(element);
    else await element.decode();
    return {kind, src: path, blob, width: element.videoWidth || element.naturalWidth, height: element.videoHeight || element.naturalHeight};
  } finally {
    if (kind === "video") element.pause();
    element.removeAttribute("src");
    if (blob) URL.revokeObjectURL(url);
  }
}

export async function displayMedia(media, scare) {
  const url = media.blob ? URL.createObjectURL(media.blob) : media.src;
  const element = media.kind === "video" ? videoElement() : new Image();
  const dispose = () => {
    if (media.kind === "video") element.pause();
    element.removeAttribute("src");
    if (media.kind === "video") element.load();
    if (media.blob) URL.revokeObjectURL(url);
  };
  element.setAttribute("aria-label", scare.name);
  element.addEventListener("contextmenu", event => event.preventDefault());
  if (media.kind === "video") {
    element.preload = "auto";
    element.muted = !!scare.sound;
    element.volume = scare.volume * (game.settings.get("core", "globalInterfaceVolume") ?? 1);
    element.loop = scare.mode === "image";
  } else element.alt = scare.name;
  element.src = url;
  try {
    if (media.kind === "video") await videoReady(element);
    else await element.decode();
    return {element, dispose, play: () => media.kind === "video" ? element.play() : Promise.resolve()};
  } catch (error) { dispose(); throw error; }
}

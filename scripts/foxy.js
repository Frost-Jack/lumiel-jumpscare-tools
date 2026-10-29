import {FOXY_CLIPS} from "./foxy-data.js";

export function frameAtTime(durations, elapsed) {
  let end = 0;
  for (let index = 0; index < durations.length; index++) {
    end += durations[index];
    if (elapsed < end) return index;
  }
  return durations.length - 1;
}

export async function prepareFoxy(animation) {
  const clip = FOXY_CLIPS[animation];
  if (!clip) throw new Error("Неизвестная игровая анимация Фокси.");
  const atlas = new Image();
  atlas.src = clip.atlas;
  const [, masks] = await Promise.all([atlas.decode(), clip.masks ? fetch(clip.masks).then(async response => {
    if (!response.ok) throw new Error("Не найдены контуры Фокси.");
    return response.json();
  }) : null]);
  const {width, height, columns, durations} = clip;
  if (masks && masks.length !== durations.length) throw new Error("Повреждены контуры Фокси.");
  const paths = masks?.map(mask => new Path2D(mask));
  const repairs = (clip.repairs ?? []).map(repair => ({...repair,
    sourcePath: new Path2D(repair.sourcePath), targetPath: new Path2D(repair.targetPath)}));
  if (atlas.naturalWidth !== width * columns || atlas.naturalHeight !== height * Math.ceil(durations.length / columns)) {
    throw new Error("Повреждён атлас кадров Фокси.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  if (clip.align) canvas.style.objectPosition = clip.align;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не поддерживает Canvas 2D.");
  const duration = durations.reduce((sum, ms) => sum + ms, 0);
  const draw = index => {
    context.clearRect(0, 0, width, height);
    context.save();
    if (paths) context.clip(paths[index], "evenodd");
    context.drawImage(atlas, (index % columns) * width, Math.floor(index / columns) * height,
      width, height, 0, 0, width, height);
    for (const repair of repairs) {
      if (repair.frame !== index) continue;
      context.save();
      context.clip(repair.targetPath);
      context.transform(...repair.transform);
      context.clip(repair.sourcePath);
      context.drawImage(atlas, (repair.sourceFrame % columns) * width, Math.floor(repair.sourceFrame / columns) * height,
        width, height, 0, 0, width, height);
      context.restore();
    }
    context.restore();
  };
  draw(0);
  let frame;
  return {
    canvas,
    start() {
      cancelAnimationFrame(frame);
      const started = performance.now();
      let displayed = -1;
      const animate = () => {
        const elapsed = performance.now() - started;
        const index = frameAtTime(durations, elapsed);
        if (index !== displayed) { draw(index); displayed = index; }
        if (elapsed < duration) frame = requestAnimationFrame(animate);
      };
      animate();
      return () => cancelAnimationFrame(frame);
    }
  };
}

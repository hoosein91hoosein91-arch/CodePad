// کوچک و فشرده کردن عکس انتخابی (برای پس‌زمینه و آیکن لانچر)
/** تصویر را کوچک و فشرده می‌کند (JPEG) تا در حافظهٔ محلی جا شود */
export async function imageData(file: File, size: number): Promise<string> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, size / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("پردازش تصویر ممکن نشد");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

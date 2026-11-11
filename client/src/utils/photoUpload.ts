const readDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Could not read this photo.'));
  reader.readAsDataURL(file);
});

// Keep avatar JSON comfortably below serverless request limits and repeated photo delivery small.
export async function photoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
  if (file.size <= 512 * 1024) return readDataUrl(file);
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not resize this photo. Choose JPEG or PNG.')); img.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not resize this photo.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.8);
    if (result.length > 1024 * 1024) throw new Error('Photo is still too large. Choose a smaller image.');
    return result;
  } finally { URL.revokeObjectURL(url); }
}

export const A2_PHOTO_REF_PREFIX = 'a2photo://';

export function parseA2DataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), base64: match[2].replace(/\s/g, '') };
}

export function a2PhotoHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0') + '-' + value.length.toString(36);
}

export function makeA2PhotoReference(path, mimeType) {
  return A2_PHOTO_REF_PREFIX + encodeURIComponent(path) + '?mime=' + encodeURIComponent(mimeType);
}

export function parseA2PhotoReference(value) {
  if (typeof value !== 'string' || !value.startsWith(A2_PHOTO_REF_PREFIX)) return null;
  const raw = value.slice(A2_PHOTO_REF_PREFIX.length);
  const [encodedPath, encodedMime = ''] = raw.split('?mime=');
  try {
    const path = decodeURIComponent(encodedPath);
    const mimeType = decodeURIComponent(encodedMime);
    if (!path.startsWith('a2-photos/') || path.includes('..') || !mimeType.startsWith('image/')) return null;
    return { path, mimeType };
  } catch {
    return null;
  }
}

export function mapA2OrderPhotos(snapshot, mapper) {
  const data = snapshot?.data;
  if (!data || !Array.isArray(data.a2orders)) return snapshot;
  const orders = data.a2orders.map(order => {
    if (!order || typeof order !== 'object') return order;
    const next = { ...order };
    for (const stageName of ['inspectionStart', 'inspectionEnd']) {
      const stage = order[stageName];
      if (!stage || typeof stage !== 'object') continue;
      const nextStage = { ...stage };
      if (Array.isArray(stage.photos)) nextStage.photos = stage.photos.map((photo, index) => mapper(photo, order, stageName, index));
      if (Array.isArray(stage.items)) {
        nextStage.items = stage.items.map((item, itemIndex) => {
          if (!item || typeof item !== 'object' || !Array.isArray(item.photos)) return item;
          return {
            ...item,
            photos: item.photos.map((photo, photoIndex) => mapper(photo, order, stageName + '-item-' + itemIndex, photoIndex))
          };
        });
      }
      next[stageName] = nextStage;
    }
    return next;
  });
  return { ...snapshot, data: { ...data, a2orders: orders } };
}

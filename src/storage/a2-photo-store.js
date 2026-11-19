import { Directory, Filesystem } from '@capacitor/filesystem';
import {
  makeA2PhotoReference,
  parseA2DataUrl,
  parseA2PhotoReference
} from './a2-photo-codec.js';

const PHOTO_DIRECTORY = 'a2-photos';

const filesystemAdapter = {
  async write(path, base64) {
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Library,
      recursive: true
    });
  },
  async read(path) {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Library
    });
    return typeof result.data === 'string' ? result.data : '';
  }
};

function asDataUrl(mimeType, base64) {
  return 'data:' + mimeType + ';base64,' + base64;
}

/**
 * Replaces base64 data URLs with app-private file references before SQLite
 * persistence. Existing references remain unchanged. The adapter parameter
 * allows deterministic tests without touching the device filesystem.
 */
export async function externalizeA2OrderPhotos(snapshot, adapter = filesystemAdapter) {
  const written = new Set();
  let converted = 0;
  const mapped = await mapA2OrderPhotosAsync(snapshot, async (photo, order, stageName, index) => {
    const parsed = parseA2DataUrl(photo);
    if (!parsed) return photo;
    const extension = parsed.mimeType === 'image/png' ? 'png' : parsed.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const orderId = encodeURIComponent(String(order?.id || 'sem-id'));
    const path = PHOTO_DIRECTORY + '/' + orderId + '/' + stageName + '-' + index + '.' + extension;
    if (!written.has(path)) {
      await adapter.write(path, parsed.base64);
      written.add(path);
    }
    converted += 1;
    return makeA2PhotoReference(path, parsed.mimeType);
  });
  return { snapshot: mapped, converted, filesWritten: written.size };
}

async function mapA2OrderPhotosAsync(snapshot, mapper) {
  const data = snapshot?.data;
  if (!data || !Array.isArray(data.a2orders)) return snapshot;
  const orders = [];
  for (const order of data.a2orders) {
    if (!order || typeof order !== 'object') { orders.push(order); continue; }
    const next = { ...order };
    for (const stageName of ['inspectionStart', 'inspectionEnd']) {
      const stage = order[stageName];
      if (!stage || typeof stage !== 'object') continue;
      const nextStage = { ...stage };
      if (Array.isArray(stage.photos)) {
        nextStage.photos = [];
        for (let index = 0; index < stage.photos.length; index += 1) nextStage.photos.push(await mapper(stage.photos[index], order, stageName, index));
      }
      if (Array.isArray(stage.items)) {
        nextStage.items = [];
        for (const item of stage.items) {
          if (!item || typeof item !== 'object' || !Array.isArray(item.photos)) {
            nextStage.items.push(item);
            continue;
          }
          const nextItem = { ...item, photos: [] };
          for (let photoIndex = 0; photoIndex < item.photos.length; photoIndex += 1) nextItem.photos.push(await mapper(item.photos[photoIndex], order, stageName + '-item-' + itemIndex, photoIndex));
          nextStage.items.push(nextItem);
        }
      }
      next[stageName] = nextStage;
    }
    orders.push(next);
  }
  return { ...snapshot, data: { ...data, a2orders: orders } };
}

/**
 * Resolves private file references to data URLs for the existing UI, previews
 * and portable JSON backup. Missing files fail loudly; they are never silently
 * replaced by empty images.
 */
export async function hydrateA2OrderPhotos(snapshot, adapter = filesystemAdapter) {
  let resolved = 0;
  const mapped = await mapA2OrderPhotosAsync(snapshot, async (photo) => {
    const reference = parseA2PhotoReference(photo);
    if (!reference) return photo;
    const base64 = await adapter.read(reference.path);
    if (!base64) throw new Error('Arquivo de foto ausente: ' + reference.path);
    resolved += 1;
    return asDataUrl(reference.mimeType, base64);
  });
  return { snapshot: mapped, resolved };
}

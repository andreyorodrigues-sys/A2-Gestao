import { Directory, Filesystem } from '@capacitor/filesystem';
import {
  makeA2PhotoReference,
  mapA2OrderPhotos,
  parseA2DataUrl,
  parseA2PhotoReference,
  a2PhotoHash
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
  const next = mapA2OrderPhotos(snapshot, (photo) => {
    if (typeof photo !== 'string' || !parseA2DataUrl(photo)) return photo;
    return photo;
  });
  const mapped = await mapA2OrderPhotosAsync(next, async (photo) => {
    const parsed = parseA2DataUrl(photo);
    if (!parsed) return photo;
    const hash = a2PhotoHash(parsed.base64);
    const extension = parsed.mimeType === 'image/png' ? 'png' : 'jpg';
    const path = PHOTO_DIRECTORY + '/' + hash + '.' + extension;
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
        for (const photo of stage.photos) nextStage.photos.push(await mapper(photo));
      }
      if (Array.isArray(stage.items)) {
        nextStage.items = [];
        for (const item of stage.items) {
          if (!item || typeof item !== 'object' || !Array.isArray(item.photos)) {
            nextStage.items.push(item);
            continue;
          }
          const nextItem = { ...item, photos: [] };
          for (const photo of item.photos) nextItem.photos.push(await mapper(photo));
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

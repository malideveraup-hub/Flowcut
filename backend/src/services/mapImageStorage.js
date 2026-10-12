import mongoose from 'mongoose';

const BUCKET_NAME = 'map_images';

function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Map image storage is unavailable until the database connects.');
  const { GridFSBucket } = mongoose.mongo;
  return new GridFSBucket(db, { bucketName: BUCKET_NAME });
}

export function storeMapImage(buffer, filename, contentType, metadata) {
  const stream = getBucket().openUploadStream(filename, { contentType, metadata });
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.once('finish', () => resolve(stream.id));
    stream.end(buffer);
  });
}

export async function deleteMapImageFile(fileId) {
  if (!fileId) return;
  try {
    await getBucket().delete(fileId);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export function findMapImageFile(fileId) {
  if (!fileId) return Promise.resolve(null);
  return getBucket().find({ _id: fileId }).next();
}

export function openMapImageDownload(fileId) {
  return getBucket().openDownloadStream(fileId);
}

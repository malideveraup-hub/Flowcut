import mongoose from 'mongoose';

const BUCKET_NAME = 'shop_registration_files';

function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Document storage is unavailable until the database connects.');
  const { GridFSBucket } = mongoose.mongo;
  return new GridFSBucket(db, { bucketName: BUCKET_NAME });
}

export function storeShopDocument(buffer, filename, contentType, metadata) {
  const stream = getBucket().openUploadStream(filename, { contentType, metadata });
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.once('finish', () => resolve(stream.id));
    stream.end(buffer);
  });
}

export async function deleteShopDocument(fileId) {
  if (!fileId) return;
  try {
    await getBucket().delete(fileId);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function findShopDocument(fileId) {
  if (!fileId) return null;
  return getBucket().find({ _id: fileId }).next();
}

export function openShopDocumentDownload(fileId) {
  return getBucket().openDownloadStream(fileId);
}

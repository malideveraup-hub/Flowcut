import mongoose from 'mongoose';
import MapImage from '../models/MapImage.js';
import Shop from '../models/Shop.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  deleteMapImageFile,
  findMapImageFile,
  openMapImageDownload,
  storeMapImage,
} from '../services/mapImageStorage.js';
import {
  sanitizeMapImageFilename,
  validateMapImageFile,
  validateMapImageMetadata,
} from '../validation/mapImageValidation.js';

function serializeMapImage(image, { admin = false } = {}) {
  const relatedShopId = image.shopId?._id || image.shopId;
  const shopId = relatedShopId?.toString?.() || image.uploaderId?.shopId?.toString?.() || null;
  return {
    id: image._id.toString(),
    title: image.title,
    locationName: image.locationName || image.description || '',
    imageUrl: image.fileId
      ? admin
        ? `/api/shop-admin/map-images/${image._id}/image`
        : image.imageUrl || null
      : null,
    status: image.status,
    shopId,
    location: image.location?.x == null || image.location?.y == null
      ? null
      : { x: image.location.x, y: image.location.y },
    uploadedAt: image.uploadedAt,
    publishedAt: image.publishedAt,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    ...(admin ? { uploaderId: image.uploaderId.toString() } : {}),
  };
}

async function sendImage(res, next, image, { publicImage = false } = {}) {
if (!image?.fileId) {
  return res.status(404).json({ success: false, message: 'Map image file not found.', errors: [] });
}
try {
  const file = await findMapImageFile(image.fileId);
  if (!file) {
    return res.status(404).json({ success: false, message: 'Map image file not found.', errors: [] });
  }
  const stream = openMapImageDownload(image.fileId);
  res.set({
    'Content-Type': image.mimeType,
    'Content-Length': String(file.length),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(image.fileName || file.filename)}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(publicImage ? { 'Cross-Origin-Resource-Policy': 'cross-origin' } : {}),
  });
  stream.on('error', next);
  stream.pipe(res);
} catch (error) {
  next(error);
}
}

export async function listPublishedMapImages(_req, res, next) {
  try {
    const images = await MapImage.find({ status: 'PUBLISHED', fileId: { $ne: null } })
      .populate({ path: 'uploaderId', select: 'shopId' })
      .populate({ path: 'shopId', select: 'name' })
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();
    res.json({ success: true, data: { images: images.map((image) => serializeMapImage(image)) } });
  } catch (error) {
    next(error);
  }
}

export async function getPublishedMapImage(req, res, next) {
  try {
    const image = await MapImage.findOne({ _id: req.params.imageId, status: 'PUBLISHED' });
    if (!image) return res.status(404).json({ success: false, message: 'Map image not found.', errors: [] });
    await sendImage(res, next, image, { publicImage: true });
  } catch (error) {
    next(error);
  }
}

function requireShopId(req) {
  if (!req.user?.shopId || !mongoose.Types.ObjectId.isValid(req.user.shopId)) {
    throw new AppError(403, 'This account is not linked to a shop.');
  }
  return new mongoose.Types.ObjectId(req.user.shopId);
}

async function findOwnedMapImage(req, imageId) {
  const shopId = requireShopId(req);
  const image = await MapImage.findOne({
    _id: imageId,
    $or: [{ shopId }, { shopId: null, uploaderId: req.user.id }],
  });
  if (image && !image.shopId) {
    image.shopId = shopId;
    await image.save();
  }
  return image;
}

export async function listAdminMapImages(req, res, next) {
  try {
    const shopId = requireShopId(req);
    const images = await MapImage.find({
      $or: [{ shopId }, { shopId: null, uploaderId: req.user.id }],
    }).populate({ path: 'shopId', select: 'name' }).sort({ updatedAt: -1 });
    for (const image of images) {
      if (!image.shopId) {
        image.shopId = shopId;
        await image.save();
      }
    }
    res.json({ success: true, data: { images: images.map((image) => serializeMapImage(image, { admin: true })) } });
  } catch (error) {
    next(error);
  }
}

export async function createMapImageDraft(req, res, next) {
  try {
    const details = validateMapImageMetadata(req.body);
    const shopId = requireShopId(req);
    const shop = await Shop.findById(shopId).select('_id');
    if (!shop) throw new AppError(404, 'Shop not found.');
    const image = await MapImage.create({
      ...details,
      uploaderId: req.user.id,
      shopId,
      status: 'DRAFT',
    });
    res.status(201).json({ success: true, data: { image: serializeMapImage(image, { admin: true }) } });
  } catch (error) {
    next(error);
  }
}

export async function updateMapImage(req, res, next) {
  try {
    const image = await findOwnedMapImage(req, req.params.imageId);
    if (!image) return res.status(404).json({ success: false, message: 'Map image not found.', errors: [] });
    const details = validateMapImageMetadata(req.body);
    const shop = await Shop.findById(requireShopId(req)).select('_id');
    if (!shop) throw new AppError(404, 'Shop not found.');
    image.title = details.title;
    image.locationName = '';
    image.description = '';
    image.location = details.location || {};
    await image.save();
    res.json({ success: true, data: { image: serializeMapImage(image, { admin: true }) } });
  } catch (error) {
    next(error);
  }
}

export async function replaceMapImageFile(req, res, next) {
  let newFileId;
  try {
    const image = await findOwnedMapImage(req, req.params.imageId);
    if (!image) return res.status(404).json({ success: false, message: 'Map image not found.', errors: [] });

    const detected = validateMapImageFile(req.body, req.get('Content-Type'));
    let requestedFilename = req.get('X-File-Name') || '';
    try {
      requestedFilename = decodeURIComponent(requestedFilename);
    } catch (error) {
      if (error instanceof URIError) throw new AppError(400, 'Invalid image filename.');
      throw error;
    }
    const filename = sanitizeMapImageFilename(requestedFilename, detected.extension);
    newFileId = await storeMapImage(req.body, filename, detected.mimeType, { uploaderId: req.user.id });
    const previousFileId = image.fileId;
    image.fileId = newFileId;
    image.imageUrl = `/api/map-images/${image._id}/image`;
    image.fileName = filename;
    image.mimeType = detected.mimeType;
    image.size = req.body.length;
    image.uploaderId = req.user.id;
    image.uploadedAt = new Date();
    await image.save();
    newFileId = null;
    if (previousFileId) await deleteMapImageFile(previousFileId);
    res.json({ success: true, data: { image: serializeMapImage(image, { admin: true }) } });
  } catch (error) {
    if (newFileId) await deleteMapImageFile(newFileId);
    next(error);
  }
}

export async function setMapImagePublication(req, res, next) {
  try {
    if (typeof req.body?.published !== 'boolean') {
      throw new AppError(400, 'Choose whether to publish this map image.');
    }
    const image = await findOwnedMapImage(req, req.params.imageId);
    if (!image) return res.status(404).json({ success: false, message: 'Map image not found.', errors: [] });
    if (req.body.published && !image.fileId) {
      throw new AppError(400, 'Upload an image before publishing it.');
    }
    image.status = req.body.published ? 'PUBLISHED' : 'DRAFT';
    image.publishedAt = req.body.published ? new Date() : null;
    await image.save();
    res.json({ success: true, data: { image: serializeMapImage(image, { admin: true }) } });
  } catch (error) {
    next(error);
  }
}

export async function deleteMapImage(req, res, next) {
  try {
    const image = await findOwnedMapImage(req, req.params.imageId);
    if (!image) return res.status(404).json({ success: false, message: 'Map image not found.', errors: [] });
    await image.deleteOne();
    if (image.fileId) await deleteMapImageFile(image.fileId);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function getAdminMapImage(req, res, next) {
  try {
    const image = await findOwnedMapImage(req, req.params.imageId);
    if (!image) return res.status(404).json({ success: false, message: 'Map image not found.', errors: [] });
    await sendImage(res, next, image);
  } catch (error) {
    next(error);
  }
}

export function validateMapImageId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.imageId)) {
    return next(new AppError(400, 'Invalid imageId.'));
  }
  next();
}

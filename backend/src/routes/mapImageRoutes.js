import { Router } from 'express';
import * as mapImageController from '../controllers/mapImageController.js';
import { validateObjectIdParam } from '../utils/mongoId.js';

const router = Router();

router.get('/', mapImageController.listPublishedMapImages);
router.get('/:imageId/image', validateObjectIdParam('imageId'), mapImageController.getPublishedMapImage);

export default router;

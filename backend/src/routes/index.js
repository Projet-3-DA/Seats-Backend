const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/auth.routes');
const sallesRoutes = require('../modules/salles/salles.routes');
const evenementsRoutes = require('../modules/evenements/evenements.routes');
const reservationsRoutes = require('../modules/reservations/reservations.routes');
const adminRoutes = require('../modules/admin/admin.routes');

router.use('/auth', authRoutes);
router.use('/salles', sallesRoutes);
router.use('/evenements', evenementsRoutes);
router.use('/reservations', reservationsRoutes);
router.use('/admin', adminRoutes);

module.exports = router;

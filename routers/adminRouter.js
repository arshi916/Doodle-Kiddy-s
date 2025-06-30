const express = require("express");
const router = express.Router();
const adminController= require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const {userAuth,adminAuth}=require('../middlewares/auth');


router.get("/pageerror",adminController.pageerror)
// Login Management
router .get ("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get ("/",adminController.loadDashboard)
router.get("/logout",adminController.logout);

// Customer Management
router.get("/customers",adminAuth,customerController.customerInfo);
router.post('/users/toggle-block', adminAuth, customerController.toggleBlockStatus);





module.exports = router;
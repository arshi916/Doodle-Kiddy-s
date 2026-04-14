import express from "express"
import adminController from '../controllers/admin/adminController.js'
import customerController from "../controllers/admin/customerController.js";
import categoryController from "../controllers/admin/categoryController.js";
import productController from "../controllers/admin/productController.js";
import { upload, uploadMultipleMiddleware } from "../middlewares/upload.js";
import couponController from "../controllers/admin/couponController.js";
import { adminAuth } from "../middlewares/auth.js";
import {
  loadOrders,
  viewOrder,
  updateOrderStatus,
  handleReturnRequest,
  approveReturn,
  getOrderStats
} from "../controllers/admin/orderController.js";

import {
  loadSalesReport,
  getSalesReportData
} from "../controllers/admin/salesReportController.js";

const router = express.Router();

router.get("/pageerror", adminController.pageerror);

// Login
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/logout", adminController.logout);

// Dashboard
router.get('/', adminAuth, adminController.loadDashboard);

// Customers
router.get("/customers", adminAuth, customerController.customerInfo);
router.get("/customers/edit/:id", adminAuth, customerController.loadEditCustomer);
router.post("/customers/edit/:id", adminAuth, upload.single('profileImage'), customerController.updateCustomer);
router.post("/users/toggle-block", adminAuth, customerController.toggleBlockStatus);
router.post("/users/add", adminAuth, customerController.addCustomer);
router.post("/users/delete", adminAuth, customerController.deleteCustomer);

// Categories
router.get("/categories", adminAuth, categoryController.loadCategories);
router.get("/categories/add", adminAuth, categoryController.loadAddCategory);
router.get("/categories/edit/:id", adminAuth, categoryController.loadEditCategory);
router.post("/categories/add", adminAuth, categoryController.addCategory);
router.post("/categories/edit/:id", adminAuth, categoryController.updateCategory);
router.post("/categories/toggle-status", adminAuth, categoryController.toggleCategoryStatus);
router.post("/categories/toggle-listing", adminAuth, categoryController.toggleCategoryListing);
router.post('/categories/add-offer', adminAuth, categoryController.addCategoryOffer);
router.get("/categories/listed", adminAuth, categoryController.getListedCategories);
router.post('/categories/remove-offer', adminAuth, categoryController.removeCategoryOffer);

// Products
router.get("/products", adminAuth, productController.loadProductPage);
router.get("/products/add", adminAuth, productController.getAddProduct);
router.post("/products/add", adminAuth, uploadMultipleMiddleware, productController.addProduct);
router.get("/products/edit/:id", adminAuth, productController.getEditProduct);
router.post("/products/update/:id", adminAuth, uploadMultipleMiddleware, productController.updateProductPost);
router.post("/products/toggle-block", adminAuth, productController.toggleBlockStatus);
router.post("/products/delete", adminAuth, productController.deleteProduct);
router.get("/products/listed", adminAuth, productController.getListedProducts);
router.post("/products/add-offer", adminAuth, productController.addProductOffer);

// Orders — specific routes BEFORE wildcard /:id
router.get("/orders", adminAuth, loadOrders);
router.get("/orders/stats", adminAuth, getOrderStats);
router.get("/orders/detail/:id", adminAuth, viewOrder);
router.get("/orders/view/:id", adminAuth, viewOrder);
router.post("/orders/update-status", adminAuth, updateOrderStatus);
router.post("/orders/handle-return", adminAuth, handleReturnRequest);
router.post("/orders/approve-return", adminAuth, approveReturn);
router.get("/orders/:id", adminAuth, viewOrder);

// Coupons
router.get("/coupons", adminAuth, couponController.loadCoupons);
router.post("/coupons/add", adminAuth, couponController.addCoupon);
router.post("/coupons/edit/:id", adminAuth, couponController.editCoupon);
router.post("/coupons/toggle", adminAuth, couponController.toggleCoupon);
router.post("/coupons/delete", adminAuth, couponController.deleteCoupon);

router.get("/sales-report", adminAuth, loadSalesReport);
router.get("/sales-report/data", adminAuth, getSalesReportData);

export default router;
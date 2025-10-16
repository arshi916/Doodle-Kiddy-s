const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const { userAuth, adminAuth } = require('../middlewares/auth');
const categoryController = require("../controllers/admin/categoryController");
const productController = require('../controllers/admin/productController');
const { upload, uploadMultiple, resizeImages, resizeSingleImage } = require("../middlewares/upload");


const { loadOrders, viewOrder, updateOrderStatus } = require("../controllers/admin/orderController");
router.get("/pageerror", adminController.pageerror);

// Login
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/logout", adminController.logout);
router.get("/", adminAuth, adminController.loadDashboard);

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

// Products 
router.get("/products", adminAuth, productController.loadProductPage);
router.get("/products/add", adminAuth, productController.getAddProduct);
router.post("/products/add", adminAuth, uploadMultiple, productController.addProduct);
router.get("/products/edit/:id", adminAuth, productController.getEditProduct);
router.post("/products/edit/:id", adminAuth, uploadMultiple, productController.updateProductPost);
router.post("/products/toggle-block", adminAuth, productController.toggleBlockStatus); 
router.post("/products/delete", adminAuth, productController.DeleteProduct);


//orders
router.get("/orders", adminAuth, loadOrders);
router.get("/orders/detail/:id", adminAuth, viewOrder); 
router.get("/orders/view/:id", adminAuth, viewOrder);  
router.post("/orders/update-status", adminAuth, updateOrderStatus);

module.exports = router;
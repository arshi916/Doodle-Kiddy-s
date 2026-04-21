import express from "express"
import {
  loadDashboard,
  getChartData,
  getBestProducts,
  getBestCategories,
  getLedgerData
} from '../controllers/admin/adminController.js'
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

router.get("/pageerror", (req, res) =>
  res.render("admin/admin-error", { title: "Admin Error", message: "Something went wrong." })
);

// Login
router.get("/login", (req, res) => {
  if (req.session.admin) return res.redirect("/admin");
  res.render("admin/admin-login", { message: null });
});
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const bcrypt = (await import("bcrypt")).default;
  const User = (await import("../models/userSchema.js")).default;
  const admin = await User.findOne({ email, isAdmin: true });
  if (!admin) return res.render("admin/admin-login", { message: "Invalid credentials" });
  const ok = admin.password.length < 20
    ? password === admin.password
    : await bcrypt.compare(password, admin.password);
  if (!ok) return res.render("admin/admin-login", { message: "Invalid credentials" });
  req.session.admin = admin._id;
  res.redirect("/admin");
});
router.get("/logout", async (req, res) => {
  req.session.regenerate(() => {
    res.clearCookie("connect.sid_admin");
    res.redirect("/admin/login");
  });
});

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get("/", adminAuth, loadDashboard);

// Dashboard API endpoints (called by the chart / tables via fetch)
router.get("/dashboard/chart-data",     adminAuth, getChartData);
router.get("/dashboard/best-products",  adminAuth, getBestProducts);
router.get("/dashboard/best-categories",adminAuth, getBestCategories);
router.get("/dashboard/ledger",         adminAuth, getLedgerData);

// ─── Customers ───────────────────────────────────────────────────────────────
router.get("/customers", adminAuth, customerController.customerInfo);
router.get("/customers/edit/:id", adminAuth, customerController.loadEditCustomer);
router.post("/customers/edit/:id", adminAuth, upload.single("profileImage"), customerController.updateCustomer);
router.post("/users/toggle-block", adminAuth, customerController.toggleBlockStatus);
router.post("/users/add", adminAuth, customerController.addCustomer);
router.post("/users/delete", adminAuth, customerController.deleteCustomer);

// ─── Categories ──────────────────────────────────────────────────────────────
router.get("/categories", adminAuth, categoryController.loadCategories);
router.get("/categories/add", adminAuth, categoryController.loadAddCategory);
router.get("/categories/edit/:id", adminAuth, categoryController.loadEditCategory);
router.post("/categories/add", adminAuth, categoryController.addCategory);
router.post("/categories/edit/:id", adminAuth, categoryController.updateCategory);
router.post("/categories/toggle-status", adminAuth, categoryController.toggleCategoryStatus);
router.post("/categories/toggle-listing", adminAuth, categoryController.toggleCategoryListing);
router.post("/categories/add-offer", adminAuth, categoryController.addCategoryOffer);
router.get("/categories/listed", adminAuth, categoryController.getListedCategories);
router.post("/categories/remove-offer", adminAuth, categoryController.removeCategoryOffer);

// ─── Products ────────────────────────────────────────────────────────────────
router.get("/products", adminAuth, productController.loadProductPage);
router.get("/products/add", adminAuth, productController.getAddProduct);
router.post("/products/add", adminAuth, uploadMultipleMiddleware, productController.addProduct);
router.get("/products/edit/:id", adminAuth, productController.getEditProduct);
router.post("/products/update/:id", adminAuth, uploadMultipleMiddleware, productController.updateProductPost);
router.post("/products/toggle-block", adminAuth, productController.toggleBlockStatus);
router.post("/products/delete", adminAuth, productController.deleteProduct);
router.get("/products/listed", adminAuth, productController.getListedProducts);
router.post("/products/add-offer", adminAuth, productController.addProductOffer);

// ─── Orders ──────────────────────────────────────────────────────────────────
router.get("/orders", adminAuth, loadOrders);
router.get("/orders/stats", adminAuth, getOrderStats);
router.get("/orders/detail/:id", adminAuth, viewOrder);
router.get("/orders/view/:id", adminAuth, viewOrder);
router.post("/orders/update-status", adminAuth, updateOrderStatus);
router.post("/orders/handle-return", adminAuth, handleReturnRequest);
router.post("/orders/approve-return", adminAuth, approveReturn);
router.get("/orders/:id", adminAuth, viewOrder);

// ─── Coupons ─────────────────────────────────────────────────────────────────
router.get("/coupons", adminAuth, couponController.loadCoupons);
router.post("/coupons/add", adminAuth, couponController.addCoupon);
router.post("/coupons/edit/:id", adminAuth, couponController.editCoupon);
router.post("/coupons/toggle", adminAuth, couponController.toggleCoupon);
router.post("/coupons/delete", adminAuth, couponController.deleteCoupon);

// ─── Sales Report ─────────────────────────────────────────────────────────────
router.get("/sales-report", adminAuth, loadSalesReport);
router.get("/sales-report/data", adminAuth, getSalesReportData);

export default router;
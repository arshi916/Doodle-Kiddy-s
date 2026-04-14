import express from "express";
import passport from "passport";
import multer from "multer";
import userController from "../controllers/user/userController.js";
import shopController from "../controllers/user/shopController.js";
import profileController from "../controllers/user/profileController.js";
import cartController from "../controllers/user/cartController.js";
import checkoutController from "../controllers/user/checkoutController.js";
import { profileUploadMiddleware } from "../middlewares/upload.js";
import { userAuth } from "../middlewares/auth.js";
import wishlistController from '../controllers/user/wishlistController.js';
import walletController from "../controllers/user/walletController.js";
import couponController from "../controllers/user/couponController.js";
import referralController from '../controllers/user/referralController.js';


const router = express.Router();
const upload = multer();

// General
router.get("/pageNotFound", userController.pageNotFound);
router.get('/', userController.loadHomepage);

// Signup
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);

// Google OAuth
router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));
router.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login?error=auth_failed" }),
    (req, res) => {
        try {
            if (req.user) {
                req.session.user = req.user._id;
                console.log("Google OAuth successful, user:", req.user.email);
                res.redirect("/");
            } else {
                console.error("No user object found after Google authentication");
                res.redirect("/login?error=auth_failed");
            }
        } catch (error) {
            console.error("Error in Google OAuth callback:", error);
            res.redirect("/login?error=callback_error");
        }
    }
);

// Login / Logout
router.get("/login", userController.loadLogin);
router.post("/login", userController.login);
router.get("/logout", userController.logout);

// Password reset
router.get("/forgot-password", userController.loadForgotPassword);
router.post("/forgot-password", userController.sendForgotOtp);
router.get("/reset-otp", userController.loadResetOtpPage);
router.post("/verify-reset-otp", userController.verifyResetOtp);
router.post("/resend-forgot-otp", userController.resendForgotOtp);
router.get("/reset-password", userController.loadResetPasswordPage);
router.post("/reset-password", userController.handleResetPassword);

// Shop
router.get('/shop', shopController.renderShopPage);
router.get('/product/options/:id', shopController.getProductOptions);
router.get('/products/:id', shopController.getProducts);
router.get('/api/products', shopController.getProductsForShop);
router.get('/api/categories', shopController.getCategories);
router.get('/product/:id', shopController.loadProductDetail);
router.get('/api/search-suggestions', shopController.getSearchSuggestions);

//wishlist
router.get('/wishlist', wishlistController.loadWishlist);
router.post('/addWishlist/:id', wishlistController.addToWishlist);
router.post('/removeWishlist/:id', wishlistController.removeFromWishlist);
router.get('/api/wishlist-ids', wishlistController.getWishlistIds);



// Profile
router.get('/profile', userAuth, profileController.loadProfile);
router.post("/profile/update", userAuth, upload.none(), profileController.updateProfile);
router.post("/profile/upload-avatar", userAuth, profileUploadMiddleware, profileController.updateAvatar);
router.post("/profile/remove-avatar", userAuth, profileController.removeAvatar);
router.post('/profile/send-email-otp', userAuth, profileController.sendEmailOtp);
router.post('/profile/verify-email-otp', userAuth, profileController.verifyEmailOtp);
router.post('/profile/resend-email-otp', userAuth, profileController.resendEmailOtp);

// Addresses
router.get('/profile/addresses', userAuth, profileController.loadAddresses);
router.post('/profile/address/add', userAuth, upload.none(), profileController.addAddress);
router.get('/profile/address/:id', userAuth, profileController.getAddress);
router.put('/profile/address/:id', userAuth, upload.none(), profileController.updateAddress);
router.delete('/profile/address/:id', userAuth, profileController.deleteAddress);
router.post('/profile/address/set-default', userAuth, profileController.setDefaultAddress);
router.post("/profile/verify-current-password", userAuth, profileController.verifyCurrentPassword);
router.post("/profile/change-password", userAuth, profileController.changePassword);
router.post("/profile/resend-password-otp", userAuth, profileController.resendPasswordOtp);

// Cart
router.get("/cart", cartController.loadCart);
router.post('/api/add-to-cart', cartController.addToCart);
router.post('/api/update-cart-quantity', cartController.updateCartQuantity);
router.post('/api/remove-from-cart', cartController.removeFromCart);
router.get('/api/cart-count', cartController.getCartCount);
router.get('/api/cart-summary', cartController.getCartSummary);
router.get('/api/product-details/:productId', cartController.getProductDetails);

// Checkout
router.get('/checkout', userAuth, checkoutController.loadCheckout);
router.post('/user/checkout/address', upload.none(), checkoutController.addAddressCheckout);
router.get('/user/checkout/address/:id', checkoutController.getAddressCheckout);
router.put('/user/checkout/address/:id', upload.none(), checkoutController.updateAddressCheckout);
router.delete('/user/checkout/address/:id', checkoutController.deleteAddressCheckout);
router.post('/checkout/process', userAuth, upload.none(), checkoutController.processOrder);
router.get('/order-success', checkoutController.orderSuccess);

// Orders
router.get('/profile/orders', userAuth, profileController.loadOrders);
router.get('/profile/order/:id', userAuth, profileController.getOrderDetails);
router.post('/profile/cancel-order', userAuth, profileController.cancelOrder);
router.post('/profile/return-order', userAuth, profileController.returnOrder);
router.post('/profile/cancel-order-item', userAuth, profileController.cancelOrderItem);
router.post('/profile/return-order-item', userAuth, profileController.returnOrderItem);
router.get('/profile/generate-invoice/:id', userAuth, profileController.generateInvoice);
router.get('/order-failed', checkoutController.orderFailed);

//wallet
router.get('/api/wallet', userAuth, walletController.loadWallet);
router.get('/api/wallet/balance',userAuth, walletController.getWalletBalance);

//coupon
router.get('/api/coupons/available', userAuth, couponController.getAvailableCoupons);
router.post('/api/coupons/apply',    userAuth, upload.none(), couponController.applyCoupon);
router.post('/api/coupons/remove',   userAuth, couponController.removeCoupon);

router.post("/create-order", userAuth, userController.createRazorpayOrder);

router.get('/referral',              userAuth, referralController.loadReferral);
router.get('/api/referral/validate', referralController.validateReferralCode);
router.get('/api/referral/info',     userAuth, referralController.getReferralInfo); // ← ADD THIS
router.get('/api/categories-with-offers', shopController.getCategoriesWithOffers);
router.get('/api/wishlist', wishlistController.getWishlistPage)

export default router;

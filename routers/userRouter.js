const express = require('express');
const router = express.Router();
const passport = require('passport'); 
const userController = require("../controllers/user/userController");
const profileController = require("../controllers/user/profileController");
const { profileUpload } = require("../middlewares/upload");
const cartController = require("../controllers/user/cartController");
const checkoutController = require("../controllers/user/checkoutController");
const multer = require('multer');

const { userAuth } = require("../middlewares/auth");
const upload = multer();

router.get("/pageNotFound", userController.pageNotFound);
router.get('/', userController.loadHomepage);
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);

router.get('/auth/google', passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account' 
}));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/signup?error=google_auth_failed' }),
  (req, res) => {
    try {
      if (req.user) {
        req.session.user = req.user._id;
        console.log('Google OAuth successful, user ID stored in session:', req.user._id);
        console.log('User details:', req.user);
        res.redirect('/');
      } else {
        console.error('No user object found after Google authentication');
        res.redirect('/signup?error=auth_failed');
      }
    } catch (error) {
      console.error('Error in Google OAuth callback:', error);
      res.redirect('/signup?error=callback_error');
    }
  }
);

// Login/Logout routes
router.get("/login", userController.loadLogin);
router.post("/login", userController.login);
router.get("/logout", userController.logout);

// Password reset routes
router.get("/forgot-password", userController.loadForgotPassword);
router.post("/forgot-password", userController.sendForgotOtp);
router.get("/reset-otp", userController.loadResetOtpPage);
router.post("/verify-reset-otp", userController.verifyResetOtp);
router.post("/resend-forgot-otp", userController.resendForgotOtp);
router.get("/reset-password", userController.loadResetPasswordPage);
router.post("/reset-password", userController.handleResetPassword);

router.get('/shop', userController.renderShopPage);
router.get('/product/options/:id', userController.getProductOptions);
router.get('/products/:id', userController.getProducts);
router.get('/api/products', userController.getProductsForShop);
router.get('/api/categories', userController.getCategories);
router.get('/product/:id', userController.loadProductDetail);
router.get('/api/search-suggestions', userController.getSearchSuggestions);

// Profile
router.get('/profile', userAuth, profileController.loadProfile);
router.post("/profile/update", userAuth, upload.none(), profileController.updateProfile);
router.post("/profile/upload-avatar", userAuth, profileUpload, profileController.updateAvatar);
router.post("/profile/remove-avatar", userAuth, profileController.removeAvatar);
router.post('/profile/send-email-otp', userAuth, profileController.sendEmailOtp);
router.post('/profile/verify-email-otp', userAuth, profileController.verifyEmailOtp);
router.post('/profile/resend-email-otp', userAuth, profileController.resendEmailOtp);


router.get('/profile/addresses', userAuth, profileController.loadAddresses);
router.post('/profile/address/add', userAuth, upload.none(), profileController.addAddress);
router.get('/profile/address/:id', userAuth, profileController.getAddress);
router.put('/profile/address/:id', userAuth, upload.none(), profileController.updateAddress);
router.delete('/profile/address/:id', userAuth, profileController.deleteAddress);
router.post('/profile/address/set-default', userAuth, profileController.setDefaultAddress);
router.post("/profile/verify-current-password", userAuth, profileController.verifyCurrentPassword);
router.post("/profile/change-password", userAuth, profileController.changePassword);
router.post("/profile/resend-password-otp", userAuth, profileController.resendPasswordOtp);

// Cart routes
router.get("/cart", cartController.loadCart);
router.post('/api/add-to-cart', cartController.addToCart);
router.post('/api/update-cart-quantity', cartController.updateCartQuantity);
router.post('/api/remove-from-cart', cartController.removeFromCart);
router.get('/api/cart-count', cartController.getCartCount);
router.get('/api/cart-summary', cartController.getCartSummary);
router.get('/api/product-details/:productId', cartController.getProductDetails);


router.get('/checkout', checkoutController.loadCheckout);

router.post('/user/checkout/address', upload.none(), checkoutController.addAddressCheckout);
router.get('/user/checkout/address/:id', checkoutController.getAddressCheckout);
router.put('/user/checkout/address/:id', upload.none(), checkoutController.updateAddressCheckout);
router.delete('/user/checkout/address/:id', checkoutController.deleteAddressCheckout);
router.post('/checkout/process', upload.none(), checkoutController.processOrder);
router.get('/order-success', checkoutController.orderSuccess);

// Orders routes
router.get('/profile/orders', userAuth, profileController.loadOrders);
router.get('/profile/order/:id', userAuth, profileController.getOrderDetails);
router.post('/return-order', userAuth, profileController.returnOrder);


router.post('/cancel-order', userAuth, profileController.cancelOrder);

module.exports = router; 
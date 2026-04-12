import Coupon from "../../models/couponSchema.js";
import Cart   from "../../models/cartSchema.js";

// ─── helpers ────────────────────────────────────────────────────────────────

const calcTotals = (cartItems, discount = 0) => {
    const subtotal    = cartItems.reduce((s, i) => s + i.totalPrice, 0);
    const shipping    = subtotal > 2500 ? 0 : 99;
    const tax         = subtotal * 0.18;
    const totalPrice  = subtotal + shipping + tax;
    const finalAmount = Math.max(0, totalPrice - discount);
    return { subtotal, shipping, tax, totalPrice, discount, finalAmount };
};

// ─── GET /api/coupons/available ──────────────────────────────────────────────
// Returns all coupons that:
//   • are listed (islist: true)
//   • have not expired
//   • have NOT already been used by this user
const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false, message: "Please login" });

        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: "Cart is empty" });
        }

        const subtotal = cart.items.reduce((s, i) => s + i.totalPrice, 0);
        const now      = new Date();

        const coupons = await Coupon.find({
            islist:   true,
            expireOn: { $gt: now },
            userBy:   { $ne: userId },          // user hasn't used it yet
        });

        // Mark which ones meet the minimum spend requirement
        const result = coupons.map(c => ({
            _id:          c._id,
            name:         c.name,
            offerPrice:   c.offerPrice,
            minimumPrice: c.minimumPrice,
            expireOn:     c.expireOn,
            eligible:     subtotal >= c.minimumPrice,
        }));

        return res.json({ success: true, coupons: result, subtotal });
    } catch (err) {
        console.error("getAvailableCoupons error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── POST /api/coupons/apply ─────────────────────────────────────────────────
const applyCoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false, message: "Please login" });

        const { couponCode } = req.body;
        if (!couponCode || !couponCode.trim()) {
            return res.json({ success: false, message: "Please enter a coupon code" });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path:   "items.productId",
            select: "productName finalPrice quantity status isBlocked",
        });

        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: "Your cart is empty" });
        }

        const coupon = await Coupon.findOne({ name: couponCode.trim().toUpperCase() });

        // ── validations ──────────────────────────────────────────────────────
        if (!coupon) {
            return res.json({ success: false, message: "Invalid coupon code" });
        }
        if (!coupon.islist) {
            return res.json({ success: false, message: "This coupon is no longer active" });
        }
        if (new Date() > new Date(coupon.expireOn)) {
            return res.json({ success: false, message: "This coupon has expired" });
        }
        if (coupon.userBy.map(id => id.toString()).includes(userId.toString())) {
            return res.json({ success: false, message: "You have already used this coupon" });
        }

        const subtotal = cart.items.reduce((s, i) => s + i.totalPrice, 0);

        if (subtotal < coupon.minimumPrice) {
            return res.json({
                success: false,
                message: `Minimum order value of ₹${coupon.minimumPrice.toFixed(2)} required for this coupon`,
            });
        }

        // ── all good — calculate totals ───────────────────────────────────────
        const totals = calcTotals(cart.items, coupon.offerPrice);

        return res.json({
            success:    true,
            message:    `Coupon "${coupon.name}" applied successfully! You saved ₹${coupon.offerPrice.toFixed(2)}`,
            couponCode: coupon.name,
            couponId:   coupon._id,
            discount:   coupon.offerPrice,
            ...totals,
        });
    } catch (err) {
        console.error("applyCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── POST /api/coupons/remove ────────────────────────────────────────────────
const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false, message: "Please login" });

        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: "Cart is empty" });
        }

        const totals = calcTotals(cart.items, 0);

        return res.json({
            success: true,
            message: "Coupon removed",
            discount: 0,
            ...totals,
        });
    } catch (err) {
        console.error("removeCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export default { getAvailableCoupons, applyCoupon, removeCoupon };
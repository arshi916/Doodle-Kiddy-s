import Coupon from "../../models/couponSchema.js";
import Cart   from "../../models/cartSchema.js";


const calcTotals = (cartItems, discount = 0) => {
    const subtotal    = cartItems.reduce((s, i) => s + i.totalPrice, 0);
    const shipping    = subtotal > 2500 ? 0 : 99;
    const tax         = subtotal * 0.18;
    const totalPrice  = subtotal + shipping + tax;
    const finalAmount = Math.max(0, totalPrice - discount);
    return { subtotal, shipping, tax, totalPrice, discount, finalAmount };
};

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
            userBy:   { $ne: userId },         
        });

        const result = coupons.map(c => {
            let discountAmount = 0;
            if (c.discountType === "percentage") {
                discountAmount = (subtotal * c.offerPrice) / 100;
                if (c.maxDiscount && discountAmount > c.maxDiscount) {
                    discountAmount = c.maxDiscount;
                }
                discountAmount = Math.round(discountAmount * 100) / 100;
            } else {
                discountAmount = c.offerPrice;
            }

            return {
                _id:            c._id,
                name:           c.name,
                discountType:   c.discountType,
                offerPrice:     c.offerPrice,
                discountAmount,
                maxDiscount:    c.maxDiscount,
                minimumPrice:   c.minimumPrice,
                expireOn:       c.expireOn,
                eligible:       subtotal >= c.minimumPrice,
            };
        });

        return res.json({ success: true, coupons: result, subtotal });

    } catch (err) {
        console.error("getAvailableCoupons error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

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


        let discount = 0;
        if (coupon.discountType === "percentage") {
            discount = (subtotal * coupon.offerPrice) / 100;

            if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                discount = coupon.maxDiscount;
            }
            discount = Math.round(discount * 100) / 100;
        } else {
            
            discount = coupon.offerPrice;
        }

        const totals = calcTotals(cart.items, discount);

        const savingsMsg = coupon.discountType === "percentage"
            ? `${coupon.offerPrice}% off — you saved ₹${discount.toFixed(2)}${coupon.maxDiscount ? ` (capped at ₹${coupon.maxDiscount})` : ''}`
            : `₹${discount.toFixed(2)} off`;

        return res.json({
            success:    true,
            message:    `Coupon "${coupon.name}" applied! ${savingsMsg}`,
            couponCode: coupon.name,
            couponId:   coupon._id,
            discount,
            ...totals,
        });
    } catch (err) {
        console.error("applyCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const removeCoupon = async (req, res) => {
    try {
          req.session.pendingCoupon = null;
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
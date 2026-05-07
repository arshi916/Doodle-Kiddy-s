import Coupon from "../../models/couponSchema.js";

const ITEMS_PER_PAGE = 6;

function validateCouponFields({ name, discountType, offerPrice, maxDiscount, minimumPrice, expireOn }) {
    if (!name || !expireOn || isNaN(offerPrice) || isNaN(minimumPrice)) {
        return "All required fields must be filled in.";
    }
    if (!/^[A-Z0-9]+$/.test(name)) {
        return "Coupon code must contain only letters and numbers.";
    }
    if (minimumPrice <= 0) {
        return "Minimum order value must be greater than 0.";
    }

    if (discountType === "flat") {
        if (offerPrice <= 0) return "Discount amount must be greater than 0.";
        if (offerPrice >= minimumPrice) return "Discount amount must be less than the minimum order value.";
    } else {
      
        if (offerPrice <= 0 || offerPrice >= 100) return "Percentage must be between 1 and 99.";
        if (maxDiscount !== null && maxDiscount !== undefined && !isNaN(maxDiscount) && maxDiscount < 0) {
            return "Max discount cap cannot be negative.";
        }
    }

    const expire = new Date(expireOn);
    if (expire <= new Date()) return "Expiry date must be in the future.";

    return null; 
}
export const loadCoupons = async (req, res) => {
    try {
        const search      = req.query.search || "";
        const currentPage = parseInt(req.query.page) || 1;

        const query = search
            ? { name: { $regex: search.trim().toUpperCase(), $options: "i" } }
            : {};

        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages   = Math.ceil(totalCoupons / ITEMS_PER_PAGE);

        const coupons = await Coupon.find(query)
            .sort({ createdOn: -1 })
            .skip((currentPage - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE);

        res.render("admin/coupons", {
            coupons,
            search,
            currentPage,
            totalPages,
            totalCoupons,
        });
    } catch (err) {
        console.error("loadCoupons error:", err);
        res.redirect("/admin/pageerror");
    }
};

export const addCoupon = async (req, res) => {
    try {
        let { name, discountType, offerPrice, maxDiscount, minimumPrice, expireOn, islist } = req.body;

        name         = name?.trim().toUpperCase();
        discountType = discountType === "percentage" ? "percentage" : "flat";
        offerPrice   = parseFloat(offerPrice);
        minimumPrice = parseFloat(minimumPrice);
maxDiscount =
  maxDiscount !== undefined &&
  maxDiscount !== null &&
  maxDiscount !== "" &&
  !isNaN(maxDiscount)
    ? parseFloat(maxDiscount)
    : null;

        const error = validateCouponFields({ name, discountType, offerPrice, maxDiscount, minimumPrice, expireOn });
        if (error) return res.json({ success: false, message: error });

        const existing = await Coupon.findOne({ name });
        if (existing) return res.json({ success: false, message: "A coupon with this code already exists." });

        await Coupon.create({
            name,
            discountType,
            offerPrice,
            maxDiscount: discountType === "percentage" ? maxDiscount : null,
            minimumPrice,
            expireOn:    new Date(expireOn),
            islist:      islist === true || islist === "true",
        });

        return res.json({ success: true, message: `Coupon "${name}" created successfully!` });
    } catch (err) {
        console.error("addCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        let { name, discountType, offerPrice, maxDiscount, minimumPrice, expireOn, islist } = req.body;

        name         = name?.trim().toUpperCase();
        discountType = discountType === "percentage" ? "percentage" : "flat";
        offerPrice   = parseFloat(offerPrice);
        minimumPrice = parseFloat(minimumPrice);
        maxDiscount  = maxDiscount !== undefined && maxDiscount !== "" ? parseFloat(maxDiscount) : null;

        const error = validateCouponFields({ name, discountType, offerPrice, maxDiscount, minimumPrice, expireOn });
        if (error) return res.json({ success: false, message: error });

        const duplicate = await Coupon.findOne({ name, _id: { $ne: id } });
        if (duplicate) return res.json({ success: false, message: "Another coupon with this code already exists." });

        await Coupon.findByIdAndUpdate(id, {
            name,
            discountType,
            offerPrice,
            maxDiscount: discountType === "percentage" ? maxDiscount : null,
            minimumPrice,
            expireOn:    new Date(expireOn),
            islist:      islist === true || islist === "true",
        });

        return res.json({ success: true, message: "Coupon updated successfully!" });
    } catch (err) {
        console.error("editCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const toggleCoupon = async (req, res) => {
    try {
        const { couponId } = req.body;
        const coupon = await Coupon.findById(couponId);
        if (!coupon) return res.json({ success: false, message: "Coupon not found" });

        coupon.islist = !coupon.islist;
        await coupon.save();

        return res.json({
            success: true,
            message: `Coupon "${coupon.name}" ${coupon.islist ? "activated" : "deactivated"} successfully!`,
        });
    } catch (err) {
        console.error("toggleCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { couponId } = req.body;
        const coupon = await Coupon.findByIdAndDelete(couponId);
        if (!coupon) return res.json({ success: false, message: "Coupon not found" });

        return res.json({ success: true, message: `Coupon "${coupon.name}" deleted successfully!` });
    } catch (err) {
        console.error("deleteCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export function calculateDiscount(coupon, orderTotal) {
    if (coupon.discountType === "percentage") {
        let discount = (orderTotal * coupon.offerPrice) / 100;
        if (coupon.maxDiscount && discount > coupon.maxDiscount) {
            discount = coupon.maxDiscount;
        }
        return Math.round(discount * 100) / 100;
    }
    return coupon.offerPrice;
}

export default { loadCoupons, addCoupon, editCoupon, toggleCoupon, deleteCoupon };
import Coupon from "../../models/couponSchema.js";

const ITEMS_PER_PAGE = 6;

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
            totalCoupons
        });
    } catch (err) {
        console.error("loadCoupons error:", err);
        res.redirect("/admin/pageerror");
    }
};

export const addCoupon = async (req, res) => {
    try {
        let { name, offerPrice, minimumPrice, expireOn, islist } = req.body;

        name         = name?.trim().toUpperCase();
        offerPrice   = parseFloat(offerPrice);
        minimumPrice = parseFloat(minimumPrice);

        if (!name || !expireOn || isNaN(offerPrice) || isNaN(minimumPrice)) {
            return res.json({ success: false, message: "All fields are required." });
        }

        if (!/^[A-Z0-9]+$/.test(name)) {
            return res.json({ success: false, message: "Coupon code must contain only letters and numbers." });
        }

        if (offerPrice <= 0) {
            return res.json({ success: false, message: "Discount amount must be greater than 0." });
        }

        if (minimumPrice <= 0) {
            return res.json({ success: false, message: "Minimum order value must be greater than 0." });
        }

        if (offerPrice >= minimumPrice) {
            return res.json({ success: false, message: "Discount amount must be less than the minimum order value." });
        }

        const expire = new Date(expireOn);
        if (expire <= new Date()) {
            return res.json({ success: false, message: "Expiry date must be in the future." });
        }

        const existing = await Coupon.findOne({ name });
        if (existing) {
            return res.json({ success: false, message: "A coupon with this code already exists." });
        }

        await Coupon.create({
            name,
            offerPrice,
            minimumPrice,
            expireOn:  expire,
            islist:    islist === true || islist === "true",
        });

        return res.json({ success: true, message: `Coupon "${name}" created successfully!` });
    } catch (err) {
        console.error("addCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const editCoupon = async (req, res) => {
    try {
        const { id }                                    = req.params;
        let   { name, offerPrice, minimumPrice, expireOn, islist } = req.body;

        name         = name?.trim().toUpperCase();
        offerPrice   = parseFloat(offerPrice);
        minimumPrice = parseFloat(minimumPrice);

        if (!name || !expireOn || isNaN(offerPrice) || isNaN(minimumPrice)) {
            return res.json({ success: false, message: "All fields are required." });
        }

        if (offerPrice >= minimumPrice) {
            return res.json({ success: false, message: "Discount amount must be less than the minimum order value." });
        }

        const expire = new Date(expireOn);

        const duplicate = await Coupon.findOne({ name, _id: { $ne: id } });
        if (duplicate) {
            return res.json({ success: false, message: "Another coupon with this code already exists." });
        }

        await Coupon.findByIdAndUpdate(id, {
            name,
            offerPrice,
            minimumPrice,
            expireOn: expire,
            islist:   islist === true || islist === "true",
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
        const coupon       = await Coupon.findById(couponId);
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
        const coupon       = await Coupon.findByIdAndDelete(couponId);
        if (!coupon) return res.json({ success: false, message: "Coupon not found" });

        return res.json({ success: true, message: `Coupon "${coupon.name}" deleted successfully!` });
    } catch (err) {
        console.error("deleteCoupon error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export default { loadCoupons, addCoupon, editCoupon, toggleCoupon, deleteCoupon };

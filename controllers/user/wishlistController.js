import Wishlist from "../../models/wishlistSchema.js";
import mongoose from "mongoose";

const LIMIT = 8;

function getSortedProducts(wishlist) {
    if (!wishlist) return [];
    return wishlist.products
        .filter(item => item.productId !== null && item.productId !== undefined)
        .sort((a, b) => {
            const dateA = a.addedAt ? new Date(a.addedAt) : new Date(a._id.getTimestamp());
            const dateB = b.addedAt ? new Date(b.addedAt) : new Date(b._id.getTimestamp());
            return dateB - dateA;
        });
}

const addToWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;

        if (!userId) return res.json({ success: false, message: "Login required" });

        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                products: [{ productId, addedAt: new Date() }]
            });
        } else {
            const alreadyExist = wishlist.products.find(
                item => item.productId.toString() === productId
            );
            if (alreadyExist) return res.json({ success: false, message: "Already in Wishlist" });
            wishlist.products.push({ productId, addedAt: new Date() });
        }

        await wishlist.save();
        res.json({ success: true, message: "Added to wishlist" });

    } catch (err) {
        console.log("Wishlist Error:", err);
        return res.json({ success: false, message: "Server error" });
    }
};

const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;

        if (!userId) return res.json({ success: false, message: "Please login" });

        const productObjectId = new mongoose.Types.ObjectId(productId);

        await Wishlist.updateOne(
            { userId },
            { $pull: { products: { productId: productObjectId } } }
        );

        return res.json({ success: true, message: 'Removed from wishlist' });

    } catch (err) {
        console.log("Remove Wishlist Error:", err);
        return res.json({ success: false, message: "Server error" });
    }
};

const loadWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const page = Math.max(1, parseInt(req.query.page) || 1);

        const wishlist = await Wishlist.findOne({ userId })
 .populate({
        path: "products.productId",
        match: { isBlocked: false }  
    });            

        const allProducts = getSortedProducts(wishlist);
        const totalItems  = allProducts.length;
        const totalPages  = Math.ceil(totalItems / LIMIT) || 1;
        const currentPage = Math.min(page, totalPages);
        const start       = (currentPage - 1) * LIMIT;
        const paginatedItems = allProducts.slice(start, start + LIMIT);

        res.render('user/wishlist', {
            wishlist: { products: paginatedItems },
            totalItems,
            totalPages,
            currentPage
        });

    } catch (err) {
        console.log(err);
        res.redirect('/pageNotFound');
    }
};

const getWishlistPage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false, message: "Login required" });

        const page = Math.max(1, parseInt(req.query.page) || 1);

        const wishlist = await Wishlist.findOne({ userId })
            .populate("products.productId");

        const allProducts = getSortedProducts(wishlist);
        const totalItems  = allProducts.length;
        const totalPages  = Math.ceil(totalItems / LIMIT) || 1;
        const currentPage = Math.min(page, totalPages);
        const start       = (currentPage - 1) * LIMIT;
        const paginatedItems = allProducts.slice(start, start + LIMIT);

        const items = paginatedItems.map(item => {
            const p = item.productId;
            return {
                productId:   p._id,
                productName: p.productName,
                salePrice:   p.salePrice,
                regularPrice:p.regularPrice,
                image:       p.productImage?.[0] || '',
                addedAt:     item.addedAt || item._id.getTimestamp()
            };
        });

        return res.json({ success: true, items, totalItems, totalPages, currentPage });

    } catch (err) {
        console.log("getWishlistPage Error:", err);
        return res.json({ success: false, message: "Server error" });
    }
};

const getWishlistIds = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: true, productIds: [] });

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) return res.json({ success: true, productIds: [] });

        const ids = wishlist.products.map(p => p.productId.toString());
        return res.json({ success: true, productIds: ids });
    } catch (err) {
        return res.json({ success: false, productIds: [] });
    }
};

export default {
    addToWishlist,
    removeFromWishlist,
    loadWishlist,
    getWishlistPage,   
    getWishlistIds
};
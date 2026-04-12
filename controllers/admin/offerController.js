import Offer    from "../../models/offerSchema.js";
import Product  from "../../models/productSchema.js";
import Category from "../../models/categorySchema.js";

// ── List all offers ──────────────────────────────────────────
const loadOffers = async (req, res) => {
    try {
        const offers = await Offer.find()
            .populate('productId',  'productName')
            .populate('categoryId', 'name')
            .sort({ createdAt: -1 })
            .lean();

        const products   = await Product.find({ isBlocked: false }).lean();
        const categories = await Category.find({ isListed: true }).lean();

        res.render('admin/offers', { offers, products, categories });
    } catch (err) {
        console.error('loadOffers error:', err);
        res.redirect('/admin/pageerror');
    }
};

// ── Add offer ────────────────────────────────────────────────
const addOffer = async (req, res) => {
    try {
        const { offerType, offerName, discount, productId, categoryId, startDate, endDate } = req.body;

        if (!offerName || !discount || !startDate || !endDate) {
            return res.json({ success: false, message: 'All fields are required' });
        }
        if (offerType === 'product' && !productId) {
            return res.json({ success: false, message: 'Please select a product' });
        }
        if (offerType === 'category' && !categoryId) {
            return res.json({ success: false, message: 'Please select a category' });
        }
        if (Number(discount) < 1 || Number(discount) > 99) {
            return res.json({ success: false, message: 'Discount must be between 1 and 99' });
        }
        if (new Date(startDate) >= new Date(endDate)) {
            return res.json({ success: false, message: 'End date must be after start date' });
        }

        // Check for duplicate active offer on same product/category
        const dupQuery = {
            offerType,
            isActive: true,
            ...(offerType === 'product'  ? { productId }  : { categoryId })
        };
        const existing = await Offer.findOne(dupQuery);
        if (existing) {
            return res.json({ 
                success: false, 
                message: `An active ${offerType} offer already exists for this ${offerType === 'product' ? 'product' : 'category'}. Please deactivate it first.` 
            });
        }

        await Offer.create({
            offerType,
            offerName,
            discount: Number(discount),
            productId:  offerType === 'product'  ? productId  : null,
            categoryId: offerType === 'category' ? categoryId : null,
            startDate: new Date(startDate),
            endDate:   new Date(endDate),
            isActive: true
        });

        res.json({ success: true, message: 'Offer added successfully' });
    } catch (err) {
        console.error('addOffer error:', err);
        res.json({ success: false, message: 'Server error' });
    }
};

// ── Edit offer ───────────────────────────────────────────────
const editOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const { offerName, discount, startDate, endDate } = req.body;

        if (Number(discount) < 1 || Number(discount) > 99) {
            return res.json({ success: false, message: 'Discount must be between 1 and 99' });
        }
        if (new Date(startDate) >= new Date(endDate)) {
            return res.json({ success: false, message: 'End date must be after start date' });
        }

        await Offer.findByIdAndUpdate(id, { offerName, discount: Number(discount), startDate, endDate });
        res.json({ success: true, message: 'Offer updated successfully' });
    } catch (err) {
        console.error('editOffer error:', err);
        res.json({ success: false, message: 'Server error' });
    }
};

// ── Toggle active/inactive ───────────────────────────────────
const toggleOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.json({ success: false, message: 'Offer not found' });
        offer.isActive = !offer.isActive;
        await offer.save();
        res.json({ success: true, isActive: offer.isActive });
    } catch (err) {
        console.error('toggleOffer error:', err);
        res.json({ success: false, message: 'Server error' });
    }
};

// ── Delete offer ─────────────────────────────────────────────
const deleteOffer = async (req, res) => {
    try {
        await Offer.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Offer deleted' });
    } catch (err) {
        console.error('deleteOffer error:', err);
        res.json({ success: false, message: 'Server error' });
    }
};

export default { loadOffers, addOffer, editOffer, toggleOffer, deleteOffer };


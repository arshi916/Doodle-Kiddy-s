import User from "../../models/userSchema.js";
import Category from "../../models/categorySchema.js";
import Product from "../../models/productSchema.js";
import mongoose from "mongoose";
import Cart from "../../models/cartSchema.js";
import { attachOffersToProducts } from "../../utils/offerHelper.js";

const hasMultipleOptions = (product) => {
    return (Array.isArray(product.size) && product.size.length > 1) ||
        (Array.isArray(product.color) && product.color.length > 1);
};

const loadShopping = async (req, res) => {
    
    try {
        const page = parseInt(req.query.page) || 1;
        const productsPerPage = 9;
        const totalProducts = await Product.countDocuments({});
        const totalPages = Math.ceil(totalProducts / productsPerPage);
        const currentPage = Math.max(1, Math.min(page, totalPages));
        const skip = (currentPage - 1) * productsPerPage;
        const products = await Product.find({})
            .skip(skip)
            .limit(productsPerPage)
            .sort({ createdAt: -1 });
        const paginationInfo = {
            currentPage,
            totalPages,
            productsPerPage,
            totalProducts,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1,
            nextPage: currentPage < totalPages ? currentPage + 1 : null,
            prevPage: currentPage > 1 ? currentPage - 1 : null,
            startProduct: totalProducts > 0 ? skip + 1 : 0,
            endProduct: Math.min(skip + productsPerPage, totalProducts)
        };
        return res.render('user/shop', { products, pagination: paginationInfo });
    } catch (error) {
        console.log('Shopping page not loading:', error);
        res.status(500).send('Server Error');
    }
};

const renderShopPage = async (req, res) => {
    try {
        const userId = req.session.user;
        let user = null;
        if (userId) {
            const userData = await User.findById(userId);
            if (userData && userData.isBlocked) {
                req.session.destroy();
                return res.redirect("/login");
            }
            user = userData;
        }

        const { maxPrice, category, color, search, page = 1, limit = 12 } = req.query;

        const activeCategories = await Category.find({ isListed: true, isDeleted: { $ne: true } }).select('_id');
        const activeCategoryIds = activeCategories.map(cat => cat._id);

        const query = {
            isDeleted: { $ne: true },
            isBlocked: { $ne: true },
            status: 'Available',
            quantity: { $gt: 0 },
            category: { $in: activeCategoryIds }
        };

        if (maxPrice) query.salePrice = { $lte: Number(maxPrice) };
        if (category) {
            const categories = category.split(',');
            const requestedCategoryDocs = await Category.find({ 
                name: { $in: categories }, 
                isListed: true, 
                isDeleted: { $ne: true } 
            });
            const requestedCategoryIds = requestedCategoryDocs.map(cat => cat._id);
            if (requestedCategoryIds.length > 0) query.category = { $in: requestedCategoryIds };
        }
        if (color) query.color = { $in: [color.toLowerCase()] };
        if (search) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        const categoriesList = await Category.find({ isListed: true, isDeleted: { $ne: true } }, 'name').lean();

        const totalProducts = await Product.countDocuments(query);

        const products = await Product.find(query)
            .populate({ 
                path: 'category', 
                match: { isListed: true, isDeleted: { $ne: true } }, 
                select: 'name description categoryOffer' 
            })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .lean();

        const validProducts = products.filter(product => product.category !== null && product.quantity > 0);

        const productsWithOffers = attachOffersToProducts(validProducts);

        const transformedProducts = productsWithOffers.map(product => ({
            _id: product._id,
            productName: product.productName,
            description: product.description,
            category: { 
                _id: product.category?._id, 
                name: product.category?.name 
            },
            finalPrice: product.finalPrice || Math.round(product.salePrice || 0),
            originalPrice: product.regularPrice,
            discountPercent: product.discountPercent || 0,
            quantity: product.quantity,
            color: product.color || [],
            size: product.size || [],
            productImage: product.productImage || [],
            status: product.status,
            returnPolicy: product.returnPolicy,
            hasMultipleOptions: hasMultipleOptions(product)
        }));

        res.render('user/shop', {
            title: 'Shop',
            categories: categoriesList || [],
            products: transformedProducts || [],
            totalProducts: validProducts.length,
            currentPage: Number(page),
            totalPages: Math.ceil(totalProducts / Number(limit)),
            user,
            maxPrice: maxPrice || null,
            category: category || null,
            color: color || null,
            search: search || null
        });

    } catch (error) {
        console.error('Error rendering shop page:', error);
        res.status(500).render('user/error', { 
            title: 'Error', 
            message: 'Failed to load shop page' 
        });
    }
};

const getProducts = async (req, res) => {
    try {
        const { maxPrice, category, color, search, page = 1, limit = 9, sort } = req.query;

        const activeCategories = await Category.find({ 
            isListed: true, 
            isDeleted: { $ne: true } 
        }).select('_id');

        const activeCategoryIds = activeCategories.map(cat => cat._id);

        if (activeCategoryIds.length === 0) {
            return res.json({ success: true, products: [], totalProducts: 0 });
        }

        const query = {
            isDeleted: { $ne: true },
            isBlocked: { $ne: true },
            status: 'Available',
            quantity: { $gt: 0 },
            category: { $in: activeCategoryIds }
        };

        if (maxPrice) query.salePrice = { $lte: Number(maxPrice) };
        if (category) {
            const cats = category.split(',').map(c => c.trim());
            const catDocs = await Category.find({
                name: { $in: cats.map(c => new RegExp(`^${c}$`, 'i')) },
                isListed: true,
                isDeleted: { $ne: true }
            });
            const catIds = catDocs.map(c => c._id);
            if (catIds.length > 0) query.category = { $in: catIds };
        }
        if (color) query.color = { $in: [new RegExp(`^${color}$`, 'i')] };
        if (search) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        const pipeline = [
            { $match: query },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'categoryData'
                }
            },
            { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },

            { $match: { 'categoryData.isListed': true, 'categoryData.isDeleted': { $ne: true } } },

            {
                $addFields: {
                    productDiscount: { $ifNull: ['$productOffer', 0] },
                    categoryDiscount: { 
                        $ifNull: ['$categoryData.categoryOffer.discount', 0] 
                    }
                }
            },
            {
                $addFields: {
                    effectiveDiscount: { $max: ['$productDiscount', '$categoryDiscount'] }
                }
            },

            {
                $addFields: {
                    finalPrice: {
                        $round: [
                            {
                                $multiply: [
                                    '$salePrice',
                                    { $subtract: [1, { $divide: [{ $ifNull: ['$effectiveDiscount', 0] }, 100] }] }
                                ]
                            },
                            0
                        ]
                    }
                }
            },

            ...(sort ? [{
                $sort: sort === 'price-asc' ? { finalPrice: 1 } :
                       sort === 'price-desc' ? { finalPrice: -1 } :
                       sort === 'name-asc' ? { productName: 1 } :
                       sort === 'name-desc' ? { productName: -1 } : { createdAt: -1 }
            }] : []),

            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [
                        { $skip: (Number(page) - 1) * Number(limit) },
                        { $limit: Number(limit) }
                    ]
                }
            }
        ];

        const result = await Product.aggregate(pipeline);
        const totalProducts = result[0]?.metadata[0]?.total || 0;
        const rawProducts = result[0]?.data || [];

        const products = rawProducts.map(p => ({
            _id: p._id,
            productName: p.productName,
            description: p.description || '',
            category: { 
                _id: p.categoryData?._id || null, 
                name: p.categoryData?.name || 'Uncategorized' 
            },
            finalPrice: p.finalPrice || Math.round(p.salePrice || 0),
            originalPrice: p.regularPrice || p.salePrice,
            discountPercent: p.effectiveDiscount || 0,
            quantity: p.quantity,
            color: p.color || [],
            size: p.size || [],
            productImage: p.productImage || [],
            status: p.status || 'Available'
        }));

        res.json({ success: true, products, totalProducts });

    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error loading products. Please try again.' 
        });
    }
};
const getProductsForShop = async (req, res) => {
    try {
        const { maxPrice, category, search, page = 1, limit = 9, sort } = req.query;

        const activeCategories = await Category.find({ isListed: true, isDeleted: { $ne: true } }).select('_id');
        const activeCategoryIds = activeCategories.map(cat => cat._id);

        if (activeCategoryIds.length === 0) {
            return res.json({ success: true, products: [], totalProducts: 0 });
        }

        const matchQuery = {
            isDeleted: { $ne: true },
            isBlocked: { $ne: true },
            status: 'Available',
            quantity: { $gt: 0 },
            category: { $in: activeCategoryIds }
        };

        if (category) {
            const categories = category.split(',').map(c => c.trim());
            const requestedCategoryDocs = await Category.find({
                name: { $in: categories.map(c => new RegExp(`^${c}$`, 'i')) },
                isListed: true,
                isDeleted: { $ne: true }
            });
            const requestedCategoryIds = requestedCategoryDocs.map(cat => cat._id);
            if (requestedCategoryIds.length > 0) matchQuery.category = { $in: requestedCategoryIds };
        }
        if (search) {
            matchQuery.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        const pipeline = [
            { $match: matchQuery },
            { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'categoryData' } },
            { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },
            { $match: { 'categoryData.isListed': true, 'categoryData.isDeleted': { $ne: true } } },

            {
                $addFields: {
                    productDiscount: { $ifNull: ['$productOffer', 0] },
                    categoryDiscount: { $ifNull: ['$categoryData.categoryOffer.discount', 0] }
                }
            },
            { $addFields: { effectiveDiscount: { $max: ['$productDiscount', '$categoryDiscount'] } } },

            {
                $addFields: {
                    finalPrice: {
                        $round: [
                            {
                                $multiply: [
                                    '$salePrice',
                                    { $subtract: [1, { $divide: [{ $ifNull: ['$effectiveDiscount', 0] }, 100] }] }
                                ]
                            },
                            0
                        ]
                    }
                }
            },

            ...(maxPrice ? [{ $match: { finalPrice: { $lte: Number(maxPrice) } } }] : []),

            { $project: { 
                _id: 1, 
                productName: 1, 
                description: 1, 
                category: { _id: '$categoryData._id', name: '$categoryData.name' }, 
                finalPrice: 1, 
                originalPrice: '$regularPrice', 
                discountPercent: '$effectiveDiscount', 
                quantity: 1, 
                color: 1, 
                size: 1, 
                productImage: 1, 
                status: 1, 
                returnPolicy: 1 
            }}
        ];

        if (sort) {
            const [sortField, sortDirection] = sort.split('-');
            const sortStage = {};
            if (sortField === 'name') sortStage.productName = sortDirection === 'asc' ? 1 : -1;
            else if (sortField === 'price') sortStage.finalPrice = sortDirection === 'asc' ? 1 : -1;
            if (Object.keys(sortStage).length > 0) pipeline.push({ $sort: sortStage });
        }

        const countPipeline = [...pipeline, { $count: 'total' }];
        const countResult = await Product.aggregate(countPipeline);
        const totalProducts = countResult[0]?.total || 0;

        pipeline.push({ $skip: (Number(page) - 1) * Number(limit) });
        pipeline.push({ $limit: Number(limit) });

        const products = await Product.aggregate(pipeline);

        res.json({ success: true, products, totalProducts });

    } catch (error) {
        console.error('Error in getProductsForShop:', error);
        res.status(500).json({ success: false, message: 'Error loading products' });
    }
};

const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true, isDeleted: false }, 'name').lean();
        res.json({ success: true, categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Error loading categories' });
    }
};

const getProductOptions = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).lean();
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, sizes: product.size || [], colors: product.color || [], productId: product._id, productName: product.productName });
    } catch (error) {
        console.error('Error fetching product options:', error);
        res.status(500).json({ success: false, message: 'Error loading options' });
    }
};

const loadProductDetail = async (req, res) => {
    try {
        const userId = req.session.user;
        let user = null;
        if (userId) {
            user = await User.findById(userId).select('name email');
        }

        const productId = req.params.id;

if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.redirect('/shop?msg=unavailable');
}

        const productAgg = await Product.aggregate([
            { 
                $match: { 
                    _id: new mongoose.Types.ObjectId(productId), 
                    isDeleted: { $ne: true }, 
                    isBlocked: { $ne: true }, 
                    status: 'Available', 
                    quantity: { $gt: 0 } 
                } 
            },
            { 
                $lookup: { 
                    from: 'categories', 
                    localField: 'category', 
                    foreignField: '_id', 
                    as: 'categoryData' 
                } 
            },
            { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },

            // Safe discount extraction
            {
                $addFields: {
                    productDiscount: { $ifNull: ['$productOffer', 0] },
                    categoryDiscount: { $ifNull: ['$categoryData.categoryOffer.discount', 0] }
                }
            },
            {
                $addFields: {
                    effectiveDiscount: { $max: ['$productDiscount', '$categoryDiscount'] }
                }
            },

            {
                $addFields: {
                    finalPrice: {
                        $round: [
                            {
                                $multiply: [
                                    '$salePrice',
                                    { $subtract: [1, { $divide: [{ $ifNull: ['$effectiveDiscount', 0] }, 100] }] }
                                ]
                            },
                            0
                        ]
                    }
                }
            },

            {
                $project: {
                    _id: 1,
                    productName: 1,
                    description: 1,
                    category: { _id: '$categoryData._id', name: '$categoryData.name' },
                    finalPrice: 1,
                    originalPrice: '$regularPrice',
                    discountPercent: '$effectiveDiscount',
                    quantity: 1,
                    color: 1,
                    size: 1,
                    productImage: 1,
                    status: 1,
                    returnPolicy: 1
                }
            }
        ]);

      // REPLACE WITH THIS
if (!productAgg || productAgg.length === 0) {
    return res.redirect('/shop?msg=unavailable');
}

        const product = productAgg[0];

        // Related Products (same safe logic)
        const relatedProducts = await Product.aggregate([
            { 
                $match: { 
                    category: new mongoose.Types.ObjectId(product.category._id), 
                    _id: { $ne: new mongoose.Types.ObjectId(productId) }, 
                    isDeleted: { $ne: true }, 
                    isBlocked: { $ne: true }, 
                    status: 'Available', 
                    quantity: { $gt: 0 } 
                } 
            },
            { 
                $lookup: { 
                    from: 'categories', 
                    localField: 'category', 
                    foreignField: '_id', 
                    as: 'categoryData' 
                } 
            },
            { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },

            {
                $addFields: {
                    productDiscount: { $ifNull: ['$productOffer', 0] },
                    categoryDiscount: { $ifNull: ['$categoryData.categoryOffer.discount', 0] }
                }
            },
            { $addFields: { effectiveDiscount: { $max: ['$productDiscount', '$categoryDiscount'] } } },

            {
                $addFields: {
                    finalPrice: {
                        $round: [
                            {
                                $multiply: [
                                    '$salePrice',
                                    { $subtract: [1, { $divide: [{ $ifNull: ['$effectiveDiscount', 0] }, 100] }] }
                                ]
                            },
                            0
                        ]
                    }
                }
            },

            {
                $project: {
                    _id: 1,
                    productName: 1,
                    description: 1,
                    category: { _id: '$categoryData._id', name: '$categoryData.name' },
                    finalPrice: 1,
                    originalPrice: '$regularPrice',
                    discountPercent: '$effectiveDiscount',
                    quantity: 1,
                    color: 1,
                    size: 1,
                    productImage: 1,
                    status: 1,
                    returnPolicy: 1
                }
            },
            { $limit: 4 }
        ]);

        res.render('user/product', { 
            product, 
            relatedProducts, 
            error: null, 
            user 
        });

    } catch (error) {
        console.error('Error in loadProductDetail:', error);
return res.redirect('/shop?msg=unavailable');
    }
};



const searchProducts = async (req, res) => {
    try {
        const { q: query, category, sort, page = 1 } = req.query;
        const limit = 12;
        const skip = (page - 1) * limit;
        if (!query || query.trim().length === 0) return res.redirect('/shop');
        let searchCriteria = {
            isBlocked: false, quantity: { $gt: 0 },
            $or: [
                { productName: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
                { 'category.name': { $regex: query, $options: 'i' } }
            ]
        };
        if (category && category !== 'all') searchCriteria.category = category;
        let sortCriteria = { createdOn: -1 };
        if (sort === 'price_low') sortCriteria = { salePrice: 1 };
        else if (sort === 'price_high') sortCriteria = { salePrice: -1 };
        else if (sort === 'name') sortCriteria = { productName: 1 };
        const products = await Product.find(searchCriteria).populate('category').sort(sortCriteria).skip(skip).limit(limit);
        const totalProducts = await Product.countDocuments(searchCriteria);
        const totalPages = Math.ceil(totalProducts / limit);
        const categories = await Category.find({ isListed: true });
        res.render('user/search-results', { products, query, category, sort, categories, currentPage: parseInt(page), totalPages, totalProducts, user: req.session.user });
    } catch (error) {
        console.error('Search error:', error);
        res.redirect('/shop');
    }
};

const getSearchSuggestions = async (req, res) => {
    try {
        const { q: query } = req.query;
        if (!query || query.trim().length < 1) return res.json([]);
        const searchQuery = query.trim();
        const suggestions = [];
        const categories = await Category.find({ isListed: true, isDeleted: { $ne: true }, name: { $regex: searchQuery, $options: 'i' } }).select('name').limit(3).lean();
        categories.forEach(category => suggestions.push({ name: category.name, type: 'category' }));
        const products = await Product.find({ isBlocked: false, isDeleted: { $ne: true }, quantity: { $gt: 0 }, productName: { $regex: searchQuery, $options: 'i' } }).populate('category', 'name').select('productName category productImage salePrice').limit(6).lean();
        products.forEach(product => suggestions.push({ _id: product._id, name: product.productName, category: product.category?.name || 'Product', image: product.productImage?.[0] || null, price: product.salePrice, type: 'product' }));
        if (suggestions.length < 5) {
            const additionalProducts = await Product.find({ isBlocked: false, isDeleted: { $ne: true }, quantity: { $gt: 0 }, productName: { $not: { $regex: searchQuery, $options: 'i' } }, $or: [{ description: { $regex: searchQuery, $options: 'i' } }, { brand: { $regex: searchQuery, $options: 'i' } }] }).populate('category', 'name').select('productName category productImage salePrice').limit(3).lean();
            additionalProducts.forEach(product => suggestions.push({ _id: product._id, name: product.productName, category: product.category?.name || 'Product', image: product.productImage?.[0] || null, price: product.salePrice, type: 'product' }));
        }
        res.json(suggestions);
    } catch (error) {
        console.error('Search suggestions error:', error);
        res.json([]);
    }
};

const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;
        let cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart) cart = { items: [] };
        res.render("user/cart", { cart });
    } catch (error) {
        console.log("Error loading cart:", error);
        res.status(500).send("Something went wrong");
    }
};

const getCategoriesWithOffers = async (req, res) => {
    try {
        const categories = await Category.find({ 
            isListed: true, 
            isDeleted: false 
        }).select('name categoryOffer').lean();

        res.json({ 
            success: true, 
            categories 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to load categories' });
    }
};

export default {
    loadShopping,
    renderShopPage,
    getProducts,
    getProductsForShop,
    getCategories,
    getProductOptions,
    loadProductDetail,
    searchProducts,
    getSearchSuggestions,
    loadCart,
    getCategoriesWithOffers
};
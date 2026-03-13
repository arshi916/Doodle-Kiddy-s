const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const mongoose = require('mongoose')
const Cart = require("../../models/cartSchema")


const renderShopPage = async (req, res) => {
 try {
    const userId = req.session.user;
    let user = null;
    if (userId) {
      user = await User.findById(userId).select('name email');
    }
    const { maxPrice, category, color, search, page = 1, limit = 12 } = req.query;
    
    const activeCategories = await Category.find({
      isListed: true,
      isDeleted: { $ne: true }
    }).select('_id');
    
    const activeCategoryIds = activeCategories.map(cat => cat._id);
    
    const query = { 
      isDeleted: { $ne: true },
      isBlocked: { $ne: true },
      status: 'Available',
      quantity: { $gt: 0 }, 
      category: { $in: activeCategoryIds }
    };
    
    if (maxPrice) {
      query.salePrice = { $lte: Number(maxPrice) };
    }
    
    if (category) {
      const categories = category.split(',');
      const requestedCategoryDocs = await Category.find({ 
        name: { $in: categories }, 
        isListed: true, 
        isDeleted: { $ne: true }
      });
      const requestedCategoryIds = requestedCategoryDocs.map(cat => cat._id);
      if (requestedCategoryIds.length > 0) {
        query.category = { $in: requestedCategoryIds };
      }
    }
    
    if (color) {
      query.color = { $in: [color.toLowerCase()] };
    }
    
    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }
    
    console.log('renderShopPage query:', JSON.stringify(query, null, 2));
    
    const categories = await Category.find({ 
      isListed: true, 
      isDeleted: { $ne: true }
    }, 'name').lean();
    
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
    
    const validProducts = products.filter(product => 
      product.category !== null && product.quantity > 0
    );
    
    const transformedProducts = validProducts.map(product => {
      let finalPrice = product.salePrice;
      let discountPercent = 0;

      if (product.productOffer > 0) {
        finalPrice = finalPrice - (finalPrice * product.productOffer / 100);
        discountPercent = product.productOffer;
      }

      if (product.category?.categoryOffer > 0) {
        const categoryDiscount = product.salePrice - (product.salePrice * product.category.categoryOffer / 100);
        if (categoryDiscount < finalPrice) {
          finalPrice = categoryDiscount;
          discountPercent = product.category.categoryOffer;
        }
      }

      return {
        _id: product._id,
        productName: product.productName,
        description: product.description,
        category: {
          _id: product.category._id,
          name: product.category.name
        },
        finalPrice: Math.round(finalPrice),
        originalPrice: product.regularPrice,
        discountPercent: Math.round(discountPercent) || 0,
        quantity: product.quantity,
        color: product.color || [],
        size: product.size || [],
        productImage: product.productImage || [],
        status: product.status,
        returnPolicy: product.returnPolicy,
        hasMultipleOptions: hasMultipleOptions(product)
      };
    });
    
    console.log('renderShopPage products:', transformedProducts.length);
res.render('user/shop', { 
      title: 'Shop',
      categories: categories || [],
      products: transformedProducts || [],
      totalProducts: validProducts.length,
      currentPage: Number(page),
      totalPages: Math.ceil(totalProducts/ limit) || 1,
      user: user,

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

const getProductOptions = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ 
      success: true, 
      sizes: product.size || [], 
      colors: product.color || [],
      productId: product._id,
      productName: product.productName
    });
  } catch (error) {
    console.error('Error fetching product options:', error);
    res.status(500).json({ success: false, message: 'Error loading options' });
  }
};


const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true, isDeleted: false }, 'name')
      .lean();
    console.log('Fetched categories:', categories.length);
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading categories'
    });
  }
};

const getProductsForShop = async (req, res) => {
    try {
        const { maxPrice, category, search, page = 1, limit = 9, sort } = req.query;
        console.log('Received query params:', { maxPrice, category, search, page, limit, sort });

        const activeCategories = await Category.find({
            isListed: true,
            isDeleted: { $ne: true }
        }).select('_id');
        
        const activeCategoryIds = activeCategories.map(cat => cat._id);
        
        if (activeCategoryIds.length === 0) {
            console.log('No active categories found');
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
            
            if (requestedCategoryIds.length > 0) {
                matchQuery.category = { $in: requestedCategoryIds };
            } else {
                console.warn('No matching active categories found for:', categories);
                return res.json({ success: true, products: [], totalProducts: 0 });
            }
        }

        if (search) {
            matchQuery.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        console.log('Match query:', JSON.stringify(matchQuery, null, 2)); 

        const pipeline = [
            { $match: matchQuery },
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
                $match: {
                    'categoryData.isListed': true,
                    'categoryData.isDeleted': { $ne: true },
                    quantity: { $gt: 0 }
                }
            },
            {
                $addFields: {
                    effectiveDiscount: {
                        $max: ['$productOffer', { $ifNull: ['$categoryData.categoryOffer', 0] }]
                    },
                    
                    productNameLowercase: { $toLower: '$productName' }
                }
            },
            {
                $addFields: {
                    finalPrice: {
                        $round: [
                            {
                                $multiply: [
                                    '$salePrice',
                                    { $subtract: [1, { $divide: ['$effectiveDiscount', 100] }] }
                                ]
                            },
                            0
                        ]
                    }
                }
            },
            ...(maxPrice ? [{ $match: { finalPrice: { $lte: Number(maxPrice) } }}] : []),
            {
                $project: {
                    _id: 1, 
                    productName: 1,
                    productNameLowercase: 1, 
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
        ];

       
        if (sort) {
            const [sortField, sortDirection] = sort.split('-');
            const sortStage = {};
            
            if (sortField === 'name') {
           
                sortStage.productNameLowercase = sortDirection === 'asc' ? 1 : -1;
                console.log('Applying name sort:', sortStage);
            } else if (sortField === 'price') {
                sortStage.finalPrice = sortDirection === 'asc' ? 1 : -1;
                console.log('Applying price sort:', sortStage);
            }
            
            if (Object.keys(sortStage).length > 0) {
                pipeline.push({ $sort: sortStage });
            }
        }

        const countPipeline = [...pipeline];
       
        const sortIndex = countPipeline.findIndex(stage => stage.$sort);
        if (sortIndex !== -1) {
            countPipeline.splice(sortIndex);
        }
        countPipeline.push({ $count: 'total' });
        
        const countResult = await Product.aggregate(countPipeline);
        const totalProducts = countResult[0]?.total || 0;
        console.log('Total products matched:', totalProducts); 

        pipeline.push({ $skip: (Number(page) - 1) * Number(limit) });
        pipeline.push({ $limit: Number(limit) });

        
        pipeline.push({
            $project: {
                productNameLowercase: 0 
            }
        });

        const products = await Product.aggregate(pipeline);
        console.log('Products found:', products.length); 
        if (products.length > 0) {
            console.log('First few product names (sorted):', products.slice(0, 5).map(p => p.productName)); 
        }

        res.json({
            success: true,
            products,
            totalProducts
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, message: 'Error loading products', error: error.message });
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
            return res.status(400).render('user/product', {
                product: null,
                relatedProducts: [],
                error: 'Invalid product ID'
            });
        }

        const product = await Product.aggregate([
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
            {
                $addFields: {
                    effectiveDiscount: {
                        $max: ['$productOffer', { $ifNull: ['$categoryData.categoryOffer', 0] }]
                    }
                }
            },
            {
                $addFields: {
                    finalPrice: {
                        $round: [
                            {
                                $multiply: [
                                    '$salePrice',
                                    { $subtract: [1, { $divide: ['$effectiveDiscount', 100] }] }
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

        if (!product || product.length === 0) {
            return res.status(404).render('user/product', {
                product: null,
                relatedProducts: [],
                error: 'Product not found or out of stock'
            });
        }

        const relatedProducts = await Product.aggregate([
            {
                $match: {
                    category: new mongoose.Types.ObjectId(product[0].category._id),
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
                    effectiveDiscount: {
                        $max: ['$productOffer', { $ifNull: ['$categoryData.categoryOffer', 0] }]
                    }
                }
            },
            {
                $addFields: {
                    finalPrice: {
                        $round: [
                            {
                                $multiply: [
                                    '$salePrice',
                                    { $subtract: [1, { $divide: ['$effectiveDiscount', 100] }] }
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

        console.log('Product fetched:', product[0]);
        console.log('Related products:', relatedProducts);

      res.render('user/product', {
      product: product[0],
      relatedProducts,
      error: null,
      user: user  
    });
  } catch (error) {
    res.status(500).render('user/product', {
      product: null,
      relatedProducts: [],
      error: 'Error loading product details',
      user: null
    });
    }
};


const searchProducts = async (req, res) => {
    try {
        const { q: query, category, sort, page = 1 } = req.query;
        const limit = 12;
        const skip = (page - 1) * limit;

        if (!query || query.trim().length === 0) {
            return res.redirect('/shop');
        }

        let searchCriteria = {
            isBlocked: false,
            quantity: { $gt: 0 }, 
            $or: [
                { productName: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
                { 'category.name': { $regex: query, $options: 'i' } }
            ]
        };

        if (category && category !== 'all') {
            searchCriteria.category = category;
        }

        let sortCriteria = { createdOn: -1 };
        if (sort === 'price_low') sortCriteria = { salePrice: 1 };
        else if (sort === 'price_high') sortCriteria = { salePrice: -1 };
        else if (sort === 'name') sortCriteria = { productName: 1 };

        const products = await Product.find(searchCriteria)
            .populate('category')
            .sort(sortCriteria)
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(searchCriteria);
        const totalPages = Math.ceil(totalProducts / limit);

        const categories = await Category.find({ isListed: true });

        res.render('user/search-results', {
            products,
            query,
            category,
            sort,
            categories,
            currentPage: parseInt(page),
            totalPages,
            totalProducts,
            user: req.session.user
        });

    } catch (error) {
        console.error('Search error:', error);
        res.redirect('/shop');
    }
};
const getSearchSuggestions = async (req, res) => {
    try {
        const { q: query } = req.query;
        
        if (!query || query.trim().length < 1) {
            return res.json([]);
        }

        const searchQuery = query.trim();
        const suggestions = [];

       
        const categories = await Category.find({
            isListed: true,
            isDeleted: { $ne: true },
            name: { $regex: searchQuery, $options: 'i' }
        })
        .select('name')
        .limit(3)
        .lean();

        categories.forEach(category => {
            suggestions.push({
                name: category.name,
                type: 'category'
            });
        });

        const products = await Product.find({
            isBlocked: false,
            isDeleted: { $ne: true },
            quantity: { $gt: 0 },
            productName: { $regex: searchQuery, $options: 'i' }
        })
        .populate('category', 'name')
        .select('productName category productImage salePrice')
        .limit(6)
        .lean();

        products.forEach(product => {
            suggestions.push({
                _id: product._id,
                name: product.productName,
                category: product.category?.name || 'Product',
                image: product.productImage?.[0] || null,
                price: product.salePrice,
                type: 'product'
            });
        });

        if (suggestions.length < 5) {
            const additionalProducts = await Product.find({
                isBlocked: false,
                isDeleted: { $ne: true },
                quantity: { $gt: 0 },
                productName: { $not: { $regex: searchQuery, $options: 'i' } },
                $or: [
                    { description: { $regex: searchQuery, $options: 'i' } },
                    { brand: { $regex: searchQuery, $options: 'i' } }
                ]
            })
            .populate('category', 'name')
            .select('productName category productImage salePrice')
            .limit(3)
            .lean();

            additionalProducts.forEach(product => {
                suggestions.push({
                    _id: product._id,
                    name: product.productName,
                    category: product.category?.name || 'Product',
                    image: product.productImage?.[0] || null,
                    price: product.salePrice,
                    type: 'product'
                });
            });
        }

        res.json(suggestions);

    } catch (error) {
        console.error('Search suggestions error:', error);
        res.json([]);
    }
};


module.exports ={
    renderShopPage,
    getProductOptions,
    getCategories,
    getProductsForShop,
    loadProductDetail,
    searchProducts,
    getSearchSuggestions

}
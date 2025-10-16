const hasMultipleOptions = (product) => {
  return (Array.isArray(product.size) && product.size.length > 1) || 
         (Array.isArray(product.color) && product.color.length > 1);
};


const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const mongoose = require('mongoose')
const Cart = require("../../models/cartSchema")

const pageNotFound = async (req, res) => {
    try {
        res.render('user/page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const loadSignup = async (req, res) => {
    try {
        return res.render('user/signup', { message: null });
    } catch (error) {
        console.log('Signup page not loading:', error);
        res.status(500).send('Server Error');
    }
};
const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.user;
        
        console.log('Loading homepage...'); 
        
        const categories = await Category.find({ isListed: true });
        console.log('Active categories found:', categories.length); 
        
        if (categories.length === 0) {
            console.log('No active categories found');
            if (userId) {
                const userData = await User.findOne({ _id: userId });
                return res.render("user/home", { 
                    user: userData, 
                    products: [] 
                });
            } else {
                return res.render("user/home", { 
                    products: [] 
                });
            }
        }

        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        })
        .populate('category', 'name isListed') 
        .sort({ createdOn: -1 }) 
        .limit(4) 
        .lean(); 

        console.log('Raw products found:', productData.length); 
        
        
        productData = productData.filter(product => 
            product.category && product.category.isListed
        );

        console.log('Filtered products count:', productData.length); 
        
        if (productData.length > 0) {
            console.log('Sample products:', productData.slice(0, 2).map(p => ({ 
                name: p.productName, 
                category: p.category?.name,
                createdOn: p.createdOn,
                salePrice: p.salePrice,
                regularPrice: p.regularPrice,
                quantity: p.quantity,
                images: p.productImage?.length || 0
            }))); 
        }

        if (userId) {
            const userData = await User.findOne({ _id: userId });
            return res.render("user/home", { 
                user: userData, 
                products: productData 
            });
        } else {
            return res.render("user/home", { 
                products: productData 
            });
        }
    } catch (error) {
        console.log('Home page error:', error);
       
        try {
            const userId = req.session.user;
            if (userId) {
                const userData = await User.findOne({ _id: userId });
                return res.render("user/home", { 
                    user: userData, 
                    products: [] 
                });
            } else {
                return res.render("user/home", { 
                    products: [] 
                });
            }
        } catch (renderError) {
            console.log('Error rendering fallback:', renderError);
            res.status(500).send('Server error');
        }
    }
};

const loadShopping = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const productsPerPage = 9;
        
        const totalProducts = await Product.countDocuments({ 
        });
        
        const totalPages = Math.ceil(totalProducts / productsPerPage);
        
        const currentPage = Math.max(1, Math.min(page, totalPages));
        
        const skip = (currentPage - 1) * productsPerPage;
        
        const products = await Product.find({
        })
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
        
        return res.render('user/shop', { 
            products,
            pagination: paginationInfo 
        });
    } catch (error) {
        console.log('Shopping page not loading:', error);
        res.status(500).send('Server Error');
    }
};
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            html: `<b>Your OTP: ${otp}</b>`, 
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
}


const signup = async (req, res) => {
    try {
        const { name, email, phone, password, confirm_password } = req.body;

        if (!name || !email || !phone || !password || !confirm_password) {
            return res.render("user/signup", { message: "All fields are required" });
        }

        if (password !== confirm_password) {
            return res.render("user/signup", { message: "Passwords don't match" });
        }

        if (password.length < 8) {
            return res.render("user/signup", { message: "Password must be at least 8 characters long" });
        }

        if (phone.length !== 10 || !/^[0-9]+$/.test(phone)) {
            return res.render("user/signup", { message: "Phone number must be exactly 10 digits" });
        }

        const findUser = await User.findOne({ $or: [{ email }, { phone }] });

        if (findUser) {
            const message = findUser.email === email 
                ? "User with this email already exists" 
                : "User with this phone number already exists";
            return res.render("user/signup", { message });
        }

        const otp = generateOtp();
        console.log(" Signup OTP for", email, "is:", otp);

        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render("user/signup", { message: "Failed to send verification email" });
        }

        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password };

        res.render("user/verify-otp");
    } catch (error) {
        console.error("Signup error:", error);
        res.render("user/signup", { message: "An error occurred during signup" });
    }
};

const securePassword = async (password) => {
    return await bcrypt.hash(password, 10);
}; 

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
   
        if (!req.session.userOtp || !req.session.userData) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
            });

            await saveUserData.save();
            req.session.user = saveUserData._id;

            delete req.session.userOtp;
            delete req.session.userData;

            return res.json({ success: true, redirectUrl: "/" });
        } else {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
    } catch (error) {
        console.error("Error verifying OTP:", error);
        res.status(500).json({ success: false, message: "Server error during OTP verification" });
    }
};

const resendOtp = async (req, res) => {
    try {
        if (!req.session.userData) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }

        const newOtp = generateOtp();
          console.log(" Resent OTP:", newOtp);
        const sent = await sendVerificationEmail(req.session.userData.email, newOtp);

        if (!sent) {
            return res.status(500).json({ success: false, message: "Failed to resend OTP" });
        }

        req.session.userOtp = newOtp;
        return res.json({ success: true, message: "OTP resent successfully" });
    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ success: false, message: "Error resending OTP" });
    }
};

const loadLogin = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect("/");
        } else {
            return res.render("user/login", { message: null });
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ isAdmin: 0, email });

        if (!findUser) return res.render("user/login", { message: "User not found" });
        if (findUser.isBlocked) return res.render("user/login", { message: "User is blocked by Admin" });

        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) return res.render("user/login", { message: "Incorrect password" });

        req.session.user = findUser._id;
        res.redirect("/");
    } catch (error) {
        console.error("Login error", error);
        res.render("user/login", { message: "Login failed, please try again later" });
    }
};

const logout = async (req, res) => {
    try {
        
        req.logout((err) => {
            if (err) {
                console.log("Passport logout error:", err);
            }
            
         
            req.session.destroy((destroyErr) => {
                if (destroyErr) {
                    console.log("Session destroy error:", destroyErr.message);
                }
                res.redirect('/login');
            });
        });
    } catch (error) {
        console.log("Logout error", error);
        res.redirect("/pageNotFound");
    }
};

const loadForgotPassword = (req, res) => {
    try {
        res.render("user/forgot-password", { message: null, error: null });
    } catch (error) {
        console.error("Load forgot-password error:", error);
        res.redirect("/pageNotFound");
    }
};

const sendForgotOtp = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.render("user/forgot-password", { error: "User not found", message: null });
        }

        const otp = generateOtp();
        const sent = await sendVerificationEmail(email, otp);

        if (!sent) {
            return res.render("user/forgot-password", { error: "Failed to send OTP", message: null });
        }

        req.session.forgotOtp = otp;
        console.log("Forgot Password OTP for", email, "is:", otp);
        req.session.forgotEmail = email;

        res.redirect("/reset-otp");
    } catch (error) {
        console.error("Send forgot OTP error:", error);
        res.render("user/forgot-password", { error: "Something went wrong", message: null });
    }
};

const loadResetOtpPage = async (req, res) => {
    try {
        if (!req.session.forgotEmail) return res.redirect("/forgot-password");
        res.render("user/reset-otp", { message: null });
    } catch (error) {
        console.error("Load reset OTP page error:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyResetOtp = async (req, res) => {
    const { otp } = req.body;

    if (otp === req.session.forgotOtp) {
        req.session.userResetEmail = req.session.forgotEmail;
        delete req.session.forgotOtp;
        delete req.session.forgotEmail;

        return res.json({ success: true, redirectUrl: "/reset-password" });
    } else {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
};

const loadResetPasswordPage = (req, res) => {
    try {
        if (!req.session.userResetEmail) return res.redirect("/forgot-password");
        res.render("user/reset-password", { message: null });
    } catch (error) {
        console.error("Reset password page error:", error);
        res.redirect("/pageNotFound");
    }
};

const handleResetPassword = async (req, res) => {
    const { password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.render("user/reset-password", { message: "Passwords do not match" });
    }

    try {
        const hashed = await bcrypt.hash(password, 10);
        await User.findOneAndUpdate({ email: req.session.userResetEmail }, { password: hashed });

        delete req.session.userResetEmail;
        
        
        if (req.headers['content-type'] === 'application/json') {
            return res.json({ success: true, message: 'Password updated successfully' });
        }
        
        res.redirect("/reset-password?success=true");
    } catch (error) {
        console.error("Password reset error", error);
        res.render("user/reset-password", { message: "Failed to reset password" });
    }
};
const resendForgotOtp = async (req, res) => {
    try {
        if (!req.session.forgotEmail) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }

        const otp = generateOtp();
        console.log("Resent Forgot Password OTP for", req.session.forgotEmail, "is:", otp);
        const sent = await sendVerificationEmail(req.session.forgotEmail, otp);

        if (!sent) {
            return res.status(500).json({ success: false, message: "Failed to resend OTP" });
        }

        req.session.forgotOtp = otp;
        return res.json({ success: true });
    } catch (error) {
        console.error("Resend forgot OTP error:", error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};

const getProducts = async (req, res) => {
    try {
        const { maxPrice, category, color, search, page = 1, limit = 9 } = req.query;

    
        const activeCategories = await Category.find({
            isListed: true,
            isDeleted: { $ne: true }
        }).select('_id');
        
        const activeCategoryIds = activeCategories.map(cat => cat._id);
        
        if (activeCategoryIds.length === 0) {
            console.log('No active categories found');
            return res.json({ success: true, products: [], totalProducts: 0 });
        }

 
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
            const categories = category.split(',').map(c => c.trim());
            const requestedCategoryDocs = await Category.find({
                name: { $in: categories.map(c => new RegExp(`^${c}$`, 'i')) }, 
                isListed: true, 
                isDeleted: { $ne: true }
            });
            const requestedCategoryIds = requestedCategoryDocs.map(cat => cat._id);
            
            if (requestedCategoryIds.length > 0) {
                query.category = { $in: requestedCategoryIds };
            } else {
                console.warn('No matching active categories found for:', categories);
                return res.json({
                    success: true,
                    products: [],
                    totalProducts: 0
                });
            }
        }

        if (color) {
            query.color = { $in: [new RegExp(`^${color}$`, 'i')] };
        }

        if (search) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        console.log('getProducts query:', JSON.stringify(query, null, 2));

        
        const totalProducts = await Product.countDocuments(query);

        if (totalProducts === 0) {
            console.log('No products found for query');
        }

       
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
                returnPolicy: product.returnPolicy
            };
        });

        console.log('getProducts products:', transformedProducts.length);

        res.json({
            success: true,
            products: transformedProducts,
            totalProducts: validProducts.length
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading products',
            error: error.message
        });
    }
};

const renderShopPage = async (req, res) => {
  try {
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
      totalPages: Math.ceil(validProducts.length / limit) || 1
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
            error: null
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).render('user/product', {
            product: null,
            relatedProducts: [],
            error: 'Error loading product details'
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


const loadCart = async (req, res) => {
  try {
    const userId = req.session.user;
    let cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart) {
      cart = { items: [] };
    }

    res.render("user/cart", { cart });
  } catch (error) {
    console.log("Error loading cart:", error);
    res.status(500).send("Something went wrong");
  }
};





module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadShopping,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    verifyResetOtp,
    loadResetOtpPage,
    sendForgotOtp,
    loadForgotPassword,
    handleResetPassword,
    loadResetPasswordPage,
    resendForgotOtp,
    renderShopPage,
    getProducts,
    getProductsForShop,
    getCategories,
    loadProductDetail,
    searchProducts,
    getSearchSuggestions,
      getProductOptions,

  
    
    
};
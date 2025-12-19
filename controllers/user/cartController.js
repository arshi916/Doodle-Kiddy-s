const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const mongoose = require('mongoose');
const sharp = require("sharp");
const fs = require("fs");
const multer = require('multer');
const path = require('path');

const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;

        let cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            select: "productName description color brand size ageRange productImage regularPrice salePrice productOffer category isBlocked",
            populate: {
                path: "category",
                select: "name categoryOffer"
            }
        });

        if (!cart) {
            cart = { items: [] };
        }

        if (cart.items && cart.items.length > 0) {
            const originalItemCount = cart.items.length;
            cart.items = cart.items.filter(item => {
                return item.productId && !item.productId.isBlocked;
            });

            if (cart.items.length < originalItemCount) {
                await cart.save();
                console.log(`Removed ${originalItemCount - cart.items.length} blocked items from cart`);
            }
        }

        const recommendations = await Product.find({ 
            isBlocked: false,
            quantity: { $gt: 0 }
        })
            .select('productName description productImage salePrice size color')
            .limit(4);

        console.log("Cart data:", JSON.stringify(cart, null, 2));
        console.log("Recommendations:", JSON.stringify(recommendations, null, 2));
        
        if (cart.items && cart.items.length > 0) {
            cart.items.forEach((item, index) => {
                console.log(`Item ${index}:`, {
                    productName: item.productId?.productName,
                    isBlocked: item.productId?.isBlocked,
                    images: item.productId?.productImage,
                    imageCount: item.productId?.productImage?.length || 0
                });
            });
        }

        res.render("user/cart", { cart, recommendations });

    } catch (error) {
        console.log("error loading cart:", error);
        res.status(500).send("Something Went Wrong");
    }
};

const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.status(401).json({ success: false, message: "Please login" });

        const { productId, quantity = 1, selectedSize = '', selectedColor } = req.body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: "Invalid product ID" });
        }

        const product = await Product.findById(productId).populate('category');
        if (!product || product.isBlocked) {
            return res.status(404).json({ success: false, message: "Product not available" });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) cart = new Cart({ userId, items: [] });

        const existingIndex = cart.items.findIndex(i =>
            i.productId.toString() === productId.toString()
        );

        const newQty = existingIndex > -1 ? cart.items[existingIndex].quantity + quantity : quantity;

        if (newQty > product.quantity) {
            return res.status(400).json({ success: false, message: `Only ${product.quantity} items in stock` });
        }

        let finalPrice = product.salePrice;
        if (product.productOffer) finalPrice -= finalPrice * product.productOffer / 100;
        if (product.category?.categoryOffer) {
            const catPrice = product.salePrice - product.salePrice * product.category.categoryOffer / 100;
            if (catPrice < finalPrice) finalPrice = catPrice;
        }

        if (existingIndex > -1) {
            cart.items[existingIndex].quantity = newQty;
            cart.items[existingIndex].totalPrice = newQty * finalPrice;
        } else {
            cart.items.push({
                productId,
                quantity,
                price: finalPrice,
                totalPrice: finalPrice * quantity,
            });
        }

        await cart.save();

        const totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
        res.json({ success: true, message: "Added to cart", cartCount: totalItems });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Add to cart failed" });
    }
};

const getProductDetails = async (req, res) => {
    try {
        const { productId } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: "Invalid product ID" });
        }

        const product = await Product.findById(productId).populate('category').lean();
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        let finalPrice = product.salePrice;
        if (product.productOffer > 0) {
            finalPrice = finalPrice - (finalPrice * product.productOffer / 100);
        }
        if (product.category?.categoryOffer > 0) {
            const categoryDiscount = product.salePrice - (product.salePrice * product.category.categoryOffer / 100);
            if (categoryDiscount < finalPrice) {
                finalPrice = categoryDiscount;
            }
        }
        finalPrice = Math.round(finalPrice);

        res.json({
            success: true,
            product: {
                _id: product._id,
                productName: product.productName,
                description: product.description,
                productImage: product.productImage,
                color: product.color || [],
                size: product.size || [],
                quantity: product.quantity,
                regularPrice: product.regularPrice,
                salePrice: product.salePrice,
                finalPrice: finalPrice,
                category: product.category
            }
        });
    } catch (error) {
        console.error("Error getting product details:", error);
        res.status(500).json({ success: false, message: "Failed to get product details" });
    }
};

const updateCartQuantity = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.status(401).json({ success: false, message: "Please login" });

        const { productId, quantity } = req.body;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: "Invalid product ID" });
        }

        if (quantity < 1) {
            return res.status(400).json({ success: false, message: "Quantity must be at least 1" });
        }

        const product = await Product.findById(productId).populate('category');
        const cart = await Cart.findOne({ userId });
        if (!product || !cart) {
            return res.status(404).json({ success: false, message: "Item or cart not found" });
        }

        if (quantity > product.quantity) {
            return res.status(400).json({ success: false, message: `Only ${product.quantity} items in stock` });
        }

        const itemIndex = cart.items.findIndex(i => i.productId.toString() === productId);
        if (itemIndex === -1) return res.status(404).json({ success: false, message: "Item not in cart" });

        let finalPrice = product.salePrice;
        if (product.productOffer) finalPrice -= finalPrice * product.productOffer / 100;
        if (product.category?.categoryOffer) {
            const catPrice = product.salePrice - product.salePrice * product.category.categoryOffer / 100;
            if (catPrice < finalPrice) finalPrice = catPrice;
        }

        cart.items[itemIndex].quantity = quantity;
        cart.items[itemIndex].totalPrice = finalPrice * quantity;
        await cart.save();

        const totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
        res.json({ success: true, cartCount: totalItems, itemTotal: cart.items[itemIndex].totalPrice });

    } catch (error) {
        console.error("Error updating cart:", error);
        res.status(500).json({ success: false, message: "Failed to update cart" });
    }
};

const removeFromCart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login" });
        }

        const { productId } = req.body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: "Invalid product ID" });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const itemIndex = cart.items.findIndex(item => 
            item.productId.toString() === productId.toString()
        );

        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: "Item not found in cart" });
        }

    
        const product = await Product.findById(productId);
        // if (product) {
        //     product.quantity += cart.items[itemIndex].quantity;
        //     await product.save();
        // }

        cart.items.splice(itemIndex, 1);
        await cart.save();

        const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

        res.json({ 
            success: true, 
            message: "Item removed from cart",
            cartCount: totalItems
        });
    } catch (error) {
        console.error("Error removing from cart:", error);
        res.status(500).json({ success: false, message: "Failed to remove item from cart" });
    }
};

const getCartCount = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.json({ success: true, count: 0 });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.json({ success: true, count: 0 });
        }

        const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        res.json({ success: true, count: totalItems });

    } catch (error) {
        console.error("Error getting cart count:", error);
        res.json({ success: true, count: 0 });
    }
};

const getCartSummary = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.json({ success: false, message: "Please login" });
        }

        const cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart || cart.items.length === 0) {
            return res.json({ 
                success: true, 
                summary: {
                    subtotal: 0,
                    shipping: 0,
                    tax: 0,
                    total: 0,
                    itemCount: 0
                }
            });
        }

        let subtotal = 0;
        let itemCount = 0;

        cart.items.forEach(item => {
            subtotal += item.totalPrice;
            itemCount += item.quantity;
        });

        const shipping = subtotal > 50 ? 0 : 9.99;
        const tax = subtotal * 0.08; 
        const total = subtotal + shipping + tax;

        res.json({ 
            success: true, 
            summary: {
                subtotal: parseFloat(subtotal.toFixed(2)),
                shipping: parseFloat(shipping.toFixed(2)),
                tax: parseFloat(tax.toFixed(2)),
                total: parseFloat(total.toFixed(2)),
                itemCount
            }
        });
    } catch (error) {
        console.error("Error getting cart summary:", error);
        res.status(500).json({ success: false, message: "Failed to get cart summary" });
    }
};

const debugCartImages = async (req, res) => {
    try {
        const userId = req.session.user;

        const rawCart = await Cart.findOne({ userId });
        console.log("Raw cart data (no population):", JSON.stringify(rawCart, null, 2));
        
     
        const populatedCart = await Cart.findOne({ userId }).populate("items.productId");
        console.log("Populated cart:", JSON.stringify(populatedCart, null, 2));
        
      
        if (populatedCart && populatedCart.items) {
            for (let i = 0; i < populatedCart.items.length; i++) {
                const item = populatedCart.items[i];
                console.log(`Item ${i}:`, {
                    productId: item.productId?._id,
                    productName: item.productId?.productName,
                    productImage: item.productId?.productImage,
                    imageType: typeof item.productId?.productImage,
                    isArray: Array.isArray(item.productId?.productImage)
                });
            }
        }
        
        res.json({ success: true, message: "Check console for debug info" });
    } catch (error) {
        console.error("Debug error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    loadCart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    getCartCount,
    getCartSummary,
    debugCartImages,
    getProductDetails
};
import User from "../../models/userSchema.js";
import Category from "../../models/categorySchema.js";
import Product from "../../models/productSchema.js";
import Cart from "../../models/cartSchema.js";
import Wishlist from "../../models/wishlistSchema.js"; 
import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import sharp from "sharp";
import fs from "fs";
import multer from "multer";
import path from "path";

const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;

        let cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            select: "productName description color brand size ageRange productImage regularPrice salePrice productOffer category isBlocked quantity status stocks",
            populate: {
                path: "category",
                select: "name categoryOffer"
            }
        });

        if (!cart) {
            cart = { items: [] };
        }

        let removedItems = [];

        if (cart.items && cart.items.length > 0) {
            const originalItems = [...cart.items];

            cart.items = cart.items.filter(item => {
                const product = item.productId;

                if (!product || product.isBlocked) {
                    removedItems.push({ reason: 'blocked', item });
                    return false;
                }

                const stockEntry = product.stocks?.find(
                    s => s.color === (item.selectedColor || '').toLowerCase() &&
                         s.size  === (item.selectedSize  || '')
                );

                const availableQty = stockEntry ? stockEntry.quantity : product.quantity;

                if (availableQty <= 0 || product.status === 'out of stock' || product.quantity <= 0) {
                    removedItems.push({ reason: 'outOfStock', item });
                    return false;
                }

                return true;
            });

            if (removedItems.length > 0) {
                await cart.save();
            }
        }

        const recommendations = await Product.find({ 
            isBlocked: false,
            quantity: { $gt: 0 }
        })
            .select('productName description productImage salePrice size color')
            .limit(4);

        const blockedItems   = removedItems.filter(r => r.reason === 'blocked').map(r => r.item);
        const outOfStockItems = removedItems.filter(r => r.reason === 'outOfStock').map(r => r.item);

        res.render("user/cart", { 
            cart, 
            recommendations,
            blockedItems,      
            outOfStockItems    
        });

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
    i.productId.toString() === productId.toString() &&
    i.selectedSize === (selectedSize || '') &&
    i.selectedColor === (selectedColor || '')
);

        const newQty = existingIndex > -1 ? cart.items[existingIndex].quantity + quantity : quantity;

        if(newQty>5){
            return res.status(400).json({
                success:false,
                message:"Maximum 5 quantity allowed per product"
            })
        }

       const stockEntry = product.stocks?.find(
    s => s.color === (selectedColor || '').toLowerCase() &&
         s.size  === (selectedSize  || '')
);
const availableQty = stockEntry ? stockEntry.quantity : product.quantity;
if (newQty > availableQty) {
    return res.status(400).json({ 
        success: false, 
        message: `Only ${availableQty} items available for ${selectedColor} / ${selectedSize}` 
    });
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
cart.items[existingIndex].selectedSize = selectedSize || cart.items[existingIndex].selectedSize;
cart.items[existingIndex].selectedColor = selectedColor || cart.items[existingIndex].selectedColor;
        } else {
          cart.items.push({
    productId,
    quantity,
    price: finalPrice,
    totalPrice: finalPrice * quantity,
    selectedSize: selectedSize || '',
    selectedColor: selectedColor || '',
});
        }

        await cart.save();
       
await Wishlist.updateOne(
  { userId },
  { $pull: { products: { productId } } }
);
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



const stockMap = {};
(product.stocks || []).forEach(s => {
    stockMap[`${s.color}__${s.size}`] = s.quantity;
});

const availableColors = [...new Set(
    (product.stocks || []).filter(s => s.quantity > 0).map(s => s.color)
)];
const availableSizes = [...new Set(
    (product.stocks || []).filter(s => s.quantity > 0).map(s => s.size)
)];

res.json({
    success: true,
    product: {
        _id: product._id,
        productName: product.productName,
        description: product.description,
        productImage: product.productImage,
        color: availableColors,
        size: availableSizes,
        stockMap,              
        quantity: product.quantity,
        regularPrice: product.regularPrice,
        salePrice: product.salePrice,
        finalPrice,
        category: product.category
    }
});}catch (error) {
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

        if (quantity > 5) {
            return res.status(400).json({ success: false, message: "Maximum 5 quantity allowed per product" });
        }

        const product = await Product.findById(productId).populate('category');
        const cart = await Cart.findOne({ userId });

        if (!product || !cart) {
            return res.status(404).json({ success: false, message: "Item or cart not found" });
        }

        const itemIndex = cart.items.findIndex(i => i.productId.toString() === productId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: "Item not in cart" });
        }

        const item = cart.items[itemIndex];

        const stockEntry = product.stocks?.find(
            s => s.color === (item.selectedColor || '').toLowerCase() &&
                 s.size  === (item.selectedSize  || '')
        );
        const availableQty = stockEntry ? stockEntry.quantity : product.quantity;

        if (quantity > availableQty) {
            return res.status(400).json({ 
                success: false, 
                message: `Only ${availableQty} items available for this color and size` 
            });
        }

        let finalPrice = product.salePrice;
        if (product.productOffer) finalPrice -= finalPrice * product.productOffer / 100;
        if (product.category?.categoryOffer) {
            const catPrice = product.salePrice - product.salePrice * product.category.categoryOffer / 100;
            if (catPrice < finalPrice) finalPrice = catPrice;
        }

        cart.items[itemIndex].quantity   = quantity;
        cart.items[itemIndex].totalPrice = finalPrice * quantity;
        await cart.save();

        const diff = quantity - cart.items[itemIndex].quantity; 
if (diff !== 0) {
    await Product.updateOne(
        { 
            _id: productId, 
            "stocks.color": (item.selectedColor || '').toLowerCase(), 
            "stocks.size": item.selectedSize || '' 
        },
        { 
            $inc: { 
                "stocks.$.quantity": -diff,
                "quantity": -diff
            } 
        }
    );
}

        const totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);

        res.json({ 
            success: true, 
            cartCount: totalItems, 
            itemTotal: cart.items[itemIndex].totalPrice,
            maxQty: Math.min(5, availableQty)   
        });

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

        const removedItem = cart.items[itemIndex];

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

export default{
    loadCart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    getCartCount,
    getCartSummary,
    debugCartImages,
    getProductDetails
};


















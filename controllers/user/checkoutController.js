const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const mongoose = require('mongoose');

const countryStateData = {
  "India": [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", 
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", 
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", 
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", 
    "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh", 
    "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep", "Andaman and Nicobar Islands"
  ]
};

const loadCheckout = async (req, res) => {
    try {
        console.log("User session:", req.session.user); 
        const userId = req.session.user;
        if (!userId) {
            console.log("No session, redirecting to /login");
            return res.redirect('/login');
        }
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.redirect('/login');
        }

        let cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            select: 'productName finalPrice productImage'
        });

        if (!cart || cart.items.length === 0) {
            console.log("Cart empty, redirecting to /cart");
            return res.redirect('/cart');
        }

        const baseUrl = req.protocol + '://' + req.get('host') + '/images/';
        const transformedCart = {
            _id: cart._id,
            userId: cart.userId,
            items: cart.items.map(item => ({
                _id: item._id,
                productId: item.productId._id,
                productName: item.productId.productName,
                price: item.price,
                quantity: item.quantity,
                totalPrice: item.totalPrice,
                productImage: item.productId.productImage[0] ? baseUrl + item.productId.productImage[0] : null
            })),
            totalQuantity: cart.items.reduce((sum, item) => sum + item.quantity, 0)
        };

        console.log("items passed to checkout", transformedCart.items);
        
        res.render('user/checkout', { 
            cart: transformedCart, 
            user: user,
            addresses: user.addresses || [],
            countries: Object.keys(countryStateData),
            countryStateData: JSON.stringify(countryStateData)
        });
    } catch (error) {
        console.log("Checkout error:", error);
        res.status(500).send("Something Went Wrong");
    }
};


const processOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.json({ success: false, message: 'Please login to continue' });
        }

        const { selectedAddress, paymentMethod, orderNotes } = req.body;
        
        console.log('Order processing data:', {
            selectedAddress,
            paymentMethod,
            orderNotes,
            userId
        });

        const cart = await Cart.findOne({ userId }).populate({
    path: 'items.productId',
    select: 'productName finalPrice productImage quantity status isBlocked'  // ← Fixed!
});

if (!cart || cart.items.length === 0) {
    return res.json({ success: false, message: 'Your cart is empty' });
}
        const user = await User.findById(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        let addressId;

        if (selectedAddress) {
            const foundAddress = user.addresses.find(addr => addr._id.toString() === selectedAddress);
            if (!foundAddress) {
                return res.json({ success: false, message: 'Selected address not found' });
            }
            addressId = selectedAddress;
        } else {
            const { addressType, firstName, phone, address, city, state, zipCode, country } = req.body;
            
            if (!firstName || !phone || !address || !city || !state || !zipCode || !country) {
                return res.json({ success: false, message: 'Please provide complete address information' });
            }

            const newAddress = {
                addressType: addressType || 'Home',
                name: firstName,
                phone: phone.replace(/\D/g, ''),
                address,
                city,
                state,
                zipCode,
                country,
                isDefault: user.addresses.length === 0 
            };

            user.addresses.push(newAddress);
            await user.save();
            addressId = newAddress._id;
        }

        for (let item of cart.items) {
    const product = item.productId;

    // 1. Check if product is BLOCKED by admin
    if (product.isBlocked === true) {
        return res.json({ 
            success: false, 
            message: `${product.productName} is currently unavailable for purchase.` 
        });
    }

    // 2. Check insufficient stock
    if (product.quantity < item.quantity) {
        return res.json({ 
            success: false, 
            message: `${product.productName} has insufficient stock. Only ${product.quantity} left (you requested ${item.quantity}).` 
        });
    }

    // 3. Check if marked as "out of stock"
    if (product.status === "out of stock") {
        return res.json({ 
            success: false, 
            message: `${product.productName} is currently out of stock.` 
        });
    }
}

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const shippingCost = subtotal > 2500 ? 0 : 99;
        const tax = subtotal * 0.18; 
        const discount = 0; 
        const totalPrice = subtotal + shippingCost + tax;
        const finalAmount = totalPrice - discount;

        const orderData = {
            orderedItemes: cart.items.map(item => ({
                product: item.productId._id,
                quantity: item.quantity,
                price: item.price
            })),
            totalPrice: totalPrice,
            discount: discount,
            finalAmount: finalAmount,
            address: userId,
            selectedAddressId: addressId,
            invoiceDate: new Date(),
            status: 'Pending',
            createdOn: new Date(),
            couponApplied: false
        };

        console.log('Creating order with data:', orderData);

        const order = new Order(orderData);
        const savedOrder = await order.save();

        for (let item of cart.items) {
            const product = await Product.findById(item.productId._id);
            product.quantity -= item.quantity;

            if (product.quantity === 0) {
                product.status = "out of stock";
            }

            await product.save();
        }

        await Cart.findByIdAndUpdate(cart._id, { $set: { items: [] } });

        console.log('Order created successfully:', savedOrder._id);

        res.json({ 
            success: true, 
            message: 'Order placed successfully!',
            orderId: savedOrder._id,
            orderNumber: savedOrder.orderId || savedOrder._id.toString().slice(-8).toUpperCase()
        });

    } catch (error) {
        console.error("Error processing order:", error);
        res.status(500).json({ 
            success: false, 
            message: 'Error placing order. Please try again.',
            error: error.message
        });
    }
};

const orderSuccess = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const order = await Order.findOne({ address: userId })
            .populate('orderedItemes.product', 'productName productImage finalPrice')
            .sort({ createdOn: -1 });
        
        if (!order) {
            return res.redirect('/');
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/');
        }

        let shippingAddress = user.addresses.find(addr => addr.isDefault) || user.addresses[0];
        
        if (!shippingAddress) {
            shippingAddress = {
                name: user.name || 'Customer',
                address: 'Address not found',
                city: 'N/A',
                state: 'N/A',
                zipCode: 'N/A',
                phone: user.phone || 'N/A'
            };
        }

        const transformedOrder = {
            _id: order._id,
            orderId: order.orderId,
            totalAmount: order.finalAmount,
            orderStatus: order.status,
            paymentMethod: 'cod', 
            items: order.orderedItemes.map(item => ({
                productName: item.product ? item.product.productName : 'Product not found',
                quantity: item.quantity,
                totalPrice: item.price * item.quantity,
                productImage: item.product && item.product.productImage ? item.product.productImage[0] : null
            })),
            createdOn: order.createdOn,
            shippingAddress: {
                name: shippingAddress.name,
                address: shippingAddress.address,
                city: shippingAddress.city,
                state: shippingAddress.state,
                zipCode: shippingAddress.zipCode,
                phone: shippingAddress.phone
            }
        };

        console.log('Transformed order for success page:', transformedOrder);

        res.render('user/order-success', { 
            order: transformedOrder,
            orderNumber: order.orderId || order._id.toString().slice(-8).toUpperCase()
        });
    } catch (error) {
        console.log("Error loading order success page:", error);
        res.redirect('/');
    }
};

const addAddressCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressType, name, phone, address, city, state, zipCode, country, isDefault } = req.body;

        if (!name || !phone || !address || !city || !state || !zipCode || !country) {
            return res.json({ success: false, message: 'All fields are required' });
        }

        if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
            return res.json({ success: false, message: 'Please enter a valid 10-digit phone number' });
        }

        if (!/^\d{5,6}$/.test(zipCode)) {
            return res.json({ success: false, message: 'Please enter a valid zip code' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const makeDefault = user.addresses.length === 0 || isDefault === 'true';

        if (makeDefault) {
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        const newAddress = {
            addressType: addressType || 'Home',
            name,
            phone: phone.replace(/\D/g, ''),
            address,
            city,
            state,
            zipCode,
            country,
            isDefault: makeDefault
        };

        user.addresses.push(newAddress);
        await user.save();

        res.json({ 
            success: true, 
            message: 'Address added successfully',
            addressId: newAddress._id,
            address: newAddress
        });
    } catch (error) {
        console.error("Error adding address in checkout:", error);
        res.json({ success: false, message: 'Error adding address' });
    }
};

const updateAddressCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;
        const { addressType, name, phone, address, city, state, zipCode, country, isDefault } = req.body;

        if (!name || !phone || !address || !city || !state || !zipCode || !country) {
            return res.json({ success: false, message: 'All fields are required' });
        }

        if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
            return res.json({ success: false, message: 'Please enter a valid 10-digit phone number' });
        }

        if (!/^\d{5,6}$/.test(zipCode)) {
            return res.json({ success: false, message: 'Please enter a valid zip code' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.json({ success: false, message: 'Address not found' });
        }

        if (isDefault === 'true') {
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        user.addresses[addressIndex] = {
            ...user.addresses[addressIndex],
            addressType: addressType || 'Home',
            name,
            phone: phone.replace(/\D/g, ''),
            address,
            city,
            state,
            zipCode,
            country,
            isDefault: isDefault === 'true'
        };

        await user.save();

        res.json({ 
            success: true, 
            message: 'Address updated successfully',
            address: user.addresses[addressIndex]
        });
    } catch (error) {
        console.error("Error updating address in checkout:", error);
        res.json({ success: false, message: 'Error updating address' });
    }
};

const deleteAddressCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.json({ success: false, message: 'Address not found' });
        }

        const wasDefault = user.addresses[addressIndex].isDefault;
        user.addresses.splice(addressIndex, 1);

        if (wasDefault && user.addresses.length > 0) {
            user.addresses[0].isDefault = true;
        }

        await user.save();

        res.json({ 
            success: true, 
            message: 'Address deleted successfully'
        });
    } catch (error) {
        console.error("Error deleting address in checkout:", error);
        res.json({ success: false, message: 'Error deleting address' });
    }
};

const getAddressCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const address = user.addresses.find(addr => addr._id.toString() === addressId);
        if (!address) {
            return res.json({ success: false, message: 'Address not found' });
        }

        res.json({ 
            success: true, 
            address
        });
    } catch (error) {
        console.error("Error getting address in checkout:", error);
        res.json({ success: false, message: 'Error getting address' });
    }
};

const getStatesCheckout = async (req, res) => {
    try {
        const { country } = req.query;
        const states = countryStateData[country] || [];
        res.json({ success: true, states });
    } catch (error) {
        console.error("Error getting states in checkout:", error);
        res.json({ success: false, states: [] });
    }
};

module.exports = {
    loadCheckout,
    processOrder,
    addAddressCheckout,
    updateAddressCheckout,
    deleteAddressCheckout,
    getAddressCheckout,
    getStatesCheckout,
    orderSuccess
};
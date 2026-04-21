import User     from "../../models/userSchema.js";
import Category  from "../../models/categorySchema.js";
import Product   from "../../models/productSchema.js";
import Cart      from "../../models/cartSchema.js";
import Order     from "../../models/orderSchema.js";
import Coupon    from "../../models/couponSchema.js";
import { getOrCreateWallet, debitWallet } from "../user/walletController.js";
import dotenv    from "dotenv";
dotenv.config();
import { createTransport } from "nodemailer";
import bcrypt      from "bcrypt";
import mongoose    from "mongoose";

const countryStateData = {
    "India": [
        "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
        "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
        "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
        "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu",
        "Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
        "Delhi","Jammu and Kashmir","Ladakh","Puducherry","Chandigarh",
        "Dadra and Nagar Haveli and Daman and Diu","Lakshadweep","Andaman and Nicobar Islands"
    ]
};

const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect('/login');

        const user = await User.findById(userId).lean();
        if (!user)  return res.redirect('/login');

        let cart = await Cart.findOne({ userId }).populate({
            path:   'items.productId',
            select: 'productName finalPrice productImage'
        });

        if (!cart || cart.items.length === 0) return res.redirect('/cart');

        const baseUrl = req.protocol + '://' + req.get('host') + '/images/';
        const transformedCart = {
            _id:    cart._id,
            userId: cart.userId,
            items:  cart.items.map(item => ({
                _id:          item._id,
                productId:    item.productId._id,
                productName:  item.productId.productName,
                price:        item.price,
                quantity:     item.quantity,
                totalPrice:   item.totalPrice,
                productImage: item.productId.productImage[0]
                    ? baseUrl + item.productId.productImage[0]
                    : null
            })),
            totalQuantity: cart.items.reduce((s, i) => s + i.quantity, 0)
        };

        res.render('user/checkout', {
            cart:             transformedCart,
            user:             user,
            addresses:        user.addresses || [],
            countries:        Object.keys(countryStateData),
            countryStateData: JSON.stringify(countryStateData)
        });
    } catch (error) {
        console.log("Checkout error:", error);
        res.status(500).send("Something Went Wrong");
    }
};


const sendOrderConfirmationEmail = async (user, order, address, items) => {
  const transporter = createTransport({
        service: 'gmail',
        auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD,
        },
    });

    const itemRows = items.map(item => `
        <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${item.productId?.productName || 'Product'}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(item.totalPrice || 0).toFixed(2)}</td>
        </tr>
    `).join('');

    await transporter.sendMail({
        from: process.env.NODEMAILER_EMAIL,
        to: user.email,
        subject: `Order Confirmed! #${String(order.orderId || order._id).slice(-8).toUpperCase()}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#D4B896;">Order Confirmed! 🎉</h2>
                <p>Hi ${user.name}, your order has been placed successfully.</p>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8f8f8;">
                            <th style="padding:8px;text-align:left;">Product</th>
                            <th style="padding:8px;">Qty</th>
                            <th style="padding:8px;text-align:right;">Price</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
                <p style="margin-top:16px;"><strong>Total: ₹${order.finalAmount.toFixed(2)}</strong></p>
                <p>Payment: ${order.paymentMethod} | Status: ${order.paymentStatus}</p>
                ${address ? `<p>Shipping to: ${address.address}, ${address.city}, ${address.state} - ${address.zipCode}</p>` : ''}
                <p style="color:#888;font-size:12px;">Thank you for shopping with Doodle Kiddys!</p>
            </div>
        `,
    });
};

const processOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false, message: 'Please login to continue' });

        const user = await User.findById(userId);
        if (!user)  return res.json({ success: false, message: 'User not found' });

        if (user.isBlocked) {
            req.session.destroy();
            return res.status(403).json({
                success: false,
                message: "Your account has been blocked by admin"
            });
        }

        const { selectedAddress, paymentMethod, orderNotes, couponCode } = req.body;

        if (!paymentMethod) {
            return res.json({ success: false, message: 'Please select a payment method' });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path:   'items.productId',
            select: 'productName finalPrice productImage quantity status isBlocked'
        });

        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: 'Your cart is empty' });
        }

        let addressId;
        if (selectedAddress) {
            const found = user.addresses.find(a => a._id.toString() === selectedAddress);
            if (!found) return res.json({ success: false, message: 'Selected address not found' });
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
                address, city, state, zipCode, country,
                isDefault: user.addresses.length === 0
            };
            user.addresses.push(newAddress);
            await user.save();
            addressId = newAddress._id;
        }

        for (let item of cart.items) {
            const product = item.productId;
            if (product.isBlocked) {
                return res.json({ success: false, message: `${product.productName} is currently unavailable.` });
            }
            if (product.quantity < item.quantity) {
                return res.json({
                    success: false,
                    message: `${product.productName} has insufficient stock. Only ${product.quantity} left.`
                });
            }
            if (product.status === "out of stock") {
                return res.json({ success: false, message: `${product.productName} is currently out of stock.` });
            }
        }

        const subtotal    = cart.items.reduce((s, i) => s + i.totalPrice, 0);
        const shipping    = subtotal > 2500 ? 0 : 99;
        const tax         = subtotal * 0.18;
        const totalPrice  = subtotal + shipping + tax;

        let discount      = 0;
        let couponApplied = false;
        let appliedCoupon = null;

        if (couponCode && couponCode.trim()) {
            const coupon = await Coupon.findOne({ name: couponCode.trim().toUpperCase() });

            if (!coupon) {
                return res.json({ success: false, message: 'Invalid coupon code' });
            }
            if (!coupon.islist) {
                return res.json({ success: false, message: 'This coupon is no longer active' });
            }
            if (new Date() > new Date(coupon.expireOn)) {
                return res.json({ success: false, message: 'This coupon has expired' });
            }
            if (coupon.userBy.map(id => id.toString()).includes(userId.toString())) {
                return res.json({ success: false, message: 'You have already used this coupon' });
            }
            if (subtotal < coupon.minimumPrice) {
                return res.json({
                    success: false,
                    message: `Minimum order value of ₹${coupon.minimumPrice.toFixed(2)} required for this coupon`
                });
            }

            discount      = coupon.offerPrice;
            couponApplied = true;
            appliedCoupon = coupon;
        }

        const finalAmount = Math.max(0, totalPrice - discount);
if (paymentMethod === 'wallet') {
    const wallet = await getOrCreateWallet(userId);
    if (wallet.balance < finalAmount) {
        return res.json({
            success: false,
            isPartialWallet: true, 
            walletBalance: wallet.balance,
            message: `Insufficient wallet balance.`
        });
    }
}

if (paymentMethod === 'wallet+cod') {
    const wallet = await getOrCreateWallet(userId);
    if (wallet.balance <= 0) {
        return res.json({
            success: false,
            message: 'Your wallet has no balance.'
        });
    }
}
let paymentStatus = 'Pending';
if (paymentMethod === 'wallet')                                           paymentStatus = 'Completed';
else if (paymentMethod === 'wallet+cod')                                  paymentStatus = 'Partially Paid';
else if (paymentMethod === 'Cash on Delivery' || paymentMethod === 'cod') paymentStatus = 'Pending';
else if (paymentMethod === 'razorpay')                                    paymentStatus = 'Completed';

let walletAmountUsed = 0;
let codAmountDue = 0;

if (paymentMethod === 'wallet+cod') {
    const wallet = await getOrCreateWallet(userId);
    walletAmountUsed = Math.min(wallet.balance, finalAmount);
    codAmountDue = finalAmount - walletAmountUsed;
} else if (paymentMethod === 'wallet') {
    walletAmountUsed = finalAmount;
    codAmountDue = 0;
}

const orderData = {
    orderedItems: cart.items.map(item => ({
        product:  item.productId._id,
        quantity: item.quantity,
        price:    item.price
    })),
    totalPrice,
    discount,
    finalAmount,
    walletAmountUsed,
    codAmountDue,
    address:           userId,
    selectedAddressId: addressId,
    paymentMethod,
    paymentStatus,
    invoiceDate:   new Date(),
    status:        'Pending',
    createdOn:     new Date(),
    couponApplied
};

        const order      = new Order(orderData);
        const savedOrder = await order.save();

        if (couponApplied && appliedCoupon) {
            await Coupon.findByIdAndUpdate(appliedCoupon._id, {
                $push: { userBy: userId }
            });
        }

if (paymentMethod === 'wallet') {
    await debitWallet(
        userId,
        finalAmount,
        `Payment for order #${String(savedOrder.orderId || savedOrder._id).slice(-8).toUpperCase()}`,
        savedOrder._id
    );
}

if (paymentMethod === 'wallet+cod') {
    const wallet = await getOrCreateWallet(userId);
    const debitAmt = Math.min(wallet.balance, finalAmount);
    await debitWallet(
        userId,
        debitAmt,
        `Partial wallet payment for order #${String(savedOrder.orderId || savedOrder._id).slice(-8).toUpperCase()}`,
        savedOrder._id
    );
}

        for (let item of cart.items) {
            const product = await Product.findById(item.productId._id);
            product.quantity -= item.quantity;
            if (product.quantity === 0) product.status = "out of stock";
            await product.save();
        }

        await Cart.findByIdAndUpdate(cart._id, { $set: { items: [] } });

        try {
            const selectedAddressData = user.addresses.find(
                a => a._id.toString() === addressId.toString()
            );
            await sendOrderConfirmationEmail(user, savedOrder, selectedAddressData, cart.items);
        } catch (emailError) {
            console.error('Error sending order confirmation email:', emailError);
        }

        return res.json({
            success:     true,
            message:     'Order placed successfully!',
            orderId:     savedOrder._id,
            orderNumber: savedOrder.orderId || savedOrder._id.toString().slice(-8).toUpperCase()
        });

    } catch (error) {
        console.error("Error processing order:", error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Error placing order. Please try again.'
        });
    }
};

const orderSuccess = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect('/login');

        const order = await Order.findOne({ address: userId })
            .sort({ createdOn: -1 })
            .populate('orderedItems.product', 'productName productImage finalPrice')
            .lean();

        if (!order) return res.redirect('/');

        const user = await User.findById(userId).lean();
        if (!user)  return res.redirect('/');

        let shippingAddress = null;
        if (order.selectedAddressId) {
            shippingAddress = user.addresses.find(
                a => a._id.toString() === order.selectedAddressId.toString()
            );
        }
        if (!shippingAddress) {
            shippingAddress = user.addresses.find(a => a.isDefault) || user.addresses[0];
        }
        if (!shippingAddress) {
            shippingAddress = {
                name: user.name || 'Customer', address: 'Address not found',
                city: 'N/A', state: 'N/A', zipCode: 'N/A', phone: user.phone || 'N/A'
            };
        }

        const rawItems = order.orderedItems || order.orderedItemes || [];

   const transformedOrder = {
    _id:           order._id,
    orderId:       order.orderId,
    totalAmount:   order.finalAmount,
    walletAmountUsed: order.walletAmountUsed || 0,
    codAmountDue:     order.codAmountDue || 0,
            orderStatus:   order.status,
            paymentMethod: order.paymentMethod || 'Cash on Delivery',
            paymentStatus: order.paymentStatus || 'Pending',
            discount:      order.discount || 0,
            couponApplied: order.couponApplied || false,
            items: rawItems.map(item => ({
                productName:  item.product ? item.product.productName : 'Product',
                quantity:     item.quantity,
                totalPrice:   item.price * item.quantity,
                productImage: item.product?.productImage?.[0] || null
            })),
            createdOn: order.createdOn,
            shippingAddress: {
                name:    shippingAddress.name,
                address: shippingAddress.address,
                city:    shippingAddress.city,
                state:   shippingAddress.state,
                zipCode: shippingAddress.zipCode,
                phone:   shippingAddress.phone
            }
        };

        res.render('user/order-success', {
            order:       transformedOrder,
            orderNumber: order.orderId || order._id.toString().slice(-8).toUpperCase()
        });

    } catch (error) {
        console.error("Error loading order success page:", error);
        res.redirect('/');
    }
};

const addAddressCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressType, name, phone, address, city, state, zipCode, country, isDefault } = req.body;

        if (!name || !phone || !address || !city || !state || !zipCode || !country)
            return res.json({ success: false, message: 'All fields are required' });

        if (!/^\d{10}$/.test(phone.replace(/\D/g, '')))
            return res.json({ success: false, message: 'Please enter a valid 10-digit phone number' });

        if (!/^\d{5,6}$/.test(zipCode))
            return res.json({ success: false, message: 'Please enter a valid zip code' });

        const user = await User.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const makeDefault = user.addresses.length === 0 || isDefault === 'true';
        if (makeDefault) user.addresses.forEach(a => a.isDefault = false);

        const newAddress = {
            addressType: addressType || 'Home',
            name, phone: phone.replace(/\D/g, ''),
            address, city, state, zipCode, country,
            isDefault: makeDefault
        };
        user.addresses.push(newAddress);
        await user.save();

        res.json({ success: true, message: 'Address added successfully', addressId: newAddress._id, address: newAddress });
    } catch (error) {
        console.error("Error adding address in checkout:", error);
        res.json({ success: false, message: 'Error adding address' });
    }
};

const updateAddressCheckout = async (req, res) => {
    try {
        const userId    = req.session.user;
        const addressId = req.params.id;
        const { addressType, name, phone, address, city, state, zipCode, country, isDefault } = req.body;

        if (!name || !phone || !address || !city || !state || !zipCode || !country)
            return res.json({ success: false, message: 'All fields are required' });

        if (!/^\d{10}$/.test(phone.replace(/\D/g, '')))
            return res.json({ success: false, message: 'Please enter a valid 10-digit phone number' });

        if (!/^\d{5,6}$/.test(zipCode))
            return res.json({ success: false, message: 'Please enter a valid zip code' });

        const user = await User.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const idx = user.addresses.findIndex(a => a._id.toString() === addressId);
        if (idx === -1) return res.json({ success: false, message: 'Address not found' });

        if (isDefault === 'true') user.addresses.forEach(a => a.isDefault = false);

        user.addresses[idx] = {
            ...user.addresses[idx],
            addressType: addressType || 'Home',
            name, phone: phone.replace(/\D/g, ''),
            address, city, state, zipCode, country,
            isDefault: isDefault === 'true'
        };
        await user.save();

        res.json({ success: true, message: 'Address updated successfully', address: user.addresses[idx] });
    } catch (error) {
        console.error("Error updating address in checkout:", error);
        res.json({ success: false, message: 'Error updating address' });
    }
};

const deleteAddressCheckout = async (req, res) => {
    try {
        const userId    = req.session.user;
        const addressId = req.params.id;

        const user = await User.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const idx = user.addresses.findIndex(a => a._id.toString() === addressId);
        if (idx === -1) return res.json({ success: false, message: 'Address not found' });

        const wasDefault = user.addresses[idx].isDefault;
        user.addresses.splice(idx, 1);
        if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;

        await user.save();
        res.json({ success: true, message: 'Address deleted successfully' });
    } catch (error) {
        console.error("Error deleting address in checkout:", error);
        res.json({ success: false, message: 'Error deleting address' });
    }
};

const getAddressCheckout = async (req, res) => {
    try {
        const userId    = req.session.user;
        const addressId = req.params.id;

        const user = await User.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const address = user.addresses.find(a => a._id.toString() === addressId);
        if (!address)  return res.json({ success: false, message: 'Address not found' });

        res.json({ success: true, address });
    } catch (error) {
        console.error("Error getting address in checkout:", error);
        res.json({ success: false, message: 'Error getting address' });
    }
};

const getStatesCheckout = async (req, res) => {
    try {
        const { country } = req.query;
        res.json({ success: true, states: countryStateData[country] || [] });
    } catch (error) {
        console.error("Error getting states in checkout:", error);
        res.json({ success: false, states: [] });
    }
};
const orderFailed = async (req, res) => {
    try {
        const reason = req.query.reason || 'Payment was not completed';
        const amount = req.query.amount || null;
        const method = req.query.method || null;

        const orderInfo = (amount || method) ? { amount, paymentMethod: method } : null;

        res.render('user/order-failed', { reason, orderInfo });
    } catch (error) {
        console.error("Error loading order failed page:", error);
        res.redirect('/');
    }
};

const validateCart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false, message: 'Please login to continue' });

        const cart = await Cart.findOne({ userId }).populate({
            path:   'items.productId',
            select: 'productName quantity status isBlocked'
        });

        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: 'Your cart is empty' });
        }

        for (let item of cart.items) {
            const product = item.productId;

            if (!product) {
                return res.json({ success: false, message: 'One or more products in your cart are no longer available.' });
            }
            if (product.isBlocked) {
                return res.json({ success: false, message: `"${product.productName}" has been removed by the store and cannot be ordered.` });
            }
            if (product.status === 'out of stock') {
                return res.json({ success: false, message: `"${product.productName}" is currently out of stock.` });
            }
            if (product.quantity < item.quantity) {
                return res.json({ success: false, message: `"${product.productName}" has insufficient stock. Only ${product.quantity} left.` });
            }
        }

        return res.json({ success: true, message: 'Cart is valid' });

    } catch (error) {
        console.error('Cart validation error:', error);
        return res.status(500).json({ success: false, message: 'Could not validate cart. Please try again.' });
    }
};

export default {
    loadCheckout,
    processOrder,
    addAddressCheckout,
    updateAddressCheckout,
    deleteAddressCheckout,
    getAddressCheckout,
    getStatesCheckout,
    orderSuccess,
    sendOrderConfirmationEmail,
    orderFailed,
     validateCart, 
};
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const loadOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated',
        orders: []
      });
    }
    
    const orders = await Order.find({ address: userId })
      .populate('orderedItemes.product', 'productName productImage finalPrice')
      .sort({ createdOn: -1 })
      .lean();

    if (!orders || orders.length === 0) {
      return res.render("user/orders", {
        user: await User.findById(userId).lean(),
        orders: []
      });
    }

    const transformedOrders = orders.map((order) => {
      let orderNumber = 'N/A';
      let orderIdValue = 'N/A';
      
      if (order.orderId) {
        orderIdValue = String(order.orderId);
        orderNumber = orderIdValue.length >= 8 
          ? orderIdValue.slice(-8).toUpperCase() 
          : orderIdValue.toUpperCase();
      } else if (order._id) {
        orderIdValue = order._id.toString();
        orderNumber = orderIdValue.slice(-8).toUpperCase();
      }
      
      const items = Array.isArray(order.orderedItemes) 
        ? order.orderedItemes.map(item => {
            const product = item.product || {};
            return {
              productId: product._id || null,
              productName: product.productName || 'Product not found',
              quantity: item.quantity || 0,
              price: item.price || 0,
              totalPrice: (item.price || 0) * (item.quantity || 0),
              productImage: (product.productImage && Array.isArray(product.productImage) && product.productImage.length > 0)
                ? `/images/${product.productImage[0]}` 
                : '/images/default-product.jpg'
            };
          })
        : [];
      
      const itemCount = Array.isArray(order.orderedItemes)
        ? order.orderedItemes.reduce((sum, item) => sum + (item.quantity || 0), 0)
        : 0;
      
      return {
        _id: order._id,
        orderId: orderIdValue,
        orderNumber: orderNumber,
        totalPrice: order.totalPrice || 0,
        finalAmount: order.finalAmount || 0,
        discount: order.discount || 0,
        status: order.status || 'Pending',
        createdOn: order.createdOn || new Date(),
        invoiceDate: order.invoiceDate || null,
        items: items,
        itemCount: itemCount
      };
    });

    res.render("user/orders", {
      user: await User.findById(userId).lean(),
      orders: transformedOrders
    });

  } catch (error) {
    console.error("Error loading orders:", error);
    res.status(500).render("user/orders", {
      user: null,
      orders: [],
      error: 'Error loading orders'
    });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.id;

    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    })
      .populate('orderedItemes.product', 'productName productImage finalPrice description')
      .lean();

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const user = await User.findById(userId).lean();
    let shippingAddress = null;
    
    if (order.selectedAddressId && user.addresses) {
      shippingAddress = user.addresses.find(addr => 
        addr._id.toString() === order.selectedAddressId.toString()
      );
    }
    
    if (!shippingAddress && user.addresses && user.addresses.length > 0) {
      shippingAddress = user.addresses.find(addr => addr.isDefault) || user.addresses[0];
    }

    let orderNumber;
    if (order.orderId && typeof order.orderId === 'string') {
      orderNumber = order.orderId.slice(-8).toUpperCase();
    } else {
      orderNumber = order._id.toString().slice(-8).toUpperCase();
    }

    const transformedOrder = {
      _id: order._id,
      orderId: order.orderId || order._id.toString(),
      orderNumber: orderNumber,
      totalPrice: order.totalPrice || 0,
      finalAmount: order.finalAmount || 0,
      discount: order.discount || 0,
      status: order.status || 'Pending',
      createdOn: order.createdOn,
      invoiceDate: order.invoiceDate,
      items: (order.orderedItemes || []).map(item => {
        const product = item.product || {};
        return {
          itemId: item._id ? item._id.toString() : null,
          productId: product._id || null,
          productName: product.productName || 'Product not found',
          quantity: item.quantity || 0,
          price: item.price || 0,
          totalPrice: (item.price || 0) * (item.quantity || 0),
          status: item.status || order.status,
          productImage: product.productImage && product.productImage.length > 0
            ? `/images/${product.productImage[0]}` 
            : '/images/default-product.jpg'
        };
      }),
      shippingAddress: shippingAddress ? {
        name: shippingAddress.name,
        address: shippingAddress.address,
        city: shippingAddress.city,
        state: shippingAddress.state,
        zipCode: shippingAddress.zipCode,
        phone: shippingAddress.phone
      } : null
    };

    res.json({ 
      success: true, 
      order: transformedOrder 
    });

  } catch (error) {
    console.error("Error getting order details:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading order details: ' + error.message
    });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, reason, comments } = req.body;

    if (!orderId || !reason) {
      return res.json({ 
        success: false, 
        message: 'Order ID and reason are required' 
      });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    }).populate('orderedItemes.product');

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    if (!['Pending', 'Processing'].includes(order.status)) {
      return res.json({ 
        success: false, 
        message: 'Orders can only be cancelled before shipping.' 
      });
    }

    for (const item of order.orderedItemes) {
      if (item.product && item.product._id) {
        await Product.findByIdAndUpdate(
          item.product._id,
          { $inc: { quantity: item.quantity } }
        );
      }
    }

    order.status = 'Cancelled';
    order.cancellationReason = reason;
    order.cancellationComments = comments;
    order.cancelledDate = new Date();
    order.updatedAt = new Date();

    await order.save();

    const user = await User.findById(userId);
    if (user && user.email) {
      try {
        const transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: process.env.NODEMAILER_EMAIL,
          to: user.email,
          subject: `Order Cancelled - Order #${order.orderId.slice(-8).toUpperCase()}`,
          html: `
            <div style="font-family: Arial, sans-serif;">
              <h2>Order Cancelled</h2>
              <p>Your order has been cancelled successfully.</p>
              <p><strong>Refund Amount:</strong> ₹${order.finalAmount.toFixed(2)}</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Error sending cancellation email:', emailError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Order cancelled successfully.' 
    });

  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cancelling order.' 
    });
  }
};

const returnOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, reason, comments } = req.body;

    if (!orderId || !reason) {
      return res.json({ 
        success: false, 
        message: 'Order ID and reason are required' 
      });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    });

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    if (order.status !== 'Delivered') {
      return res.json({ 
        success: false, 
        message: 'Only delivered orders can be returned' 
      });
    }

    const deliveryDate = order.invoiceDate || order.createdOn;
    const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveryDate).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceDelivery > 7) {
      return res.json({ 
        success: false, 
        message: 'Return window has expired.' 
      });
    }

    order.status = 'Return Request';
    order.returnReason = reason;
    order.returnComments = comments;
    order.returnRequestedDate = new Date();
    order.updatedAt = new Date();

    await order.save();

    res.json({ 
      success: true, 
      message: 'Return request submitted successfully.' 
    });

  } catch (error) {
    console.error("Error processing return request:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing return request.' 
    });
  }
};

const cancelOrderItem = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, itemId, reason, comments } = req.body;

    if (!orderId || !itemId || !reason) {
      return res.json({ 
        success: false, 
        message: 'Order ID, Item ID and reason are required' 
      });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    }).populate('orderedItemes.product');

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    if (!['Pending', 'Processing'].includes(order.status)) {
      return res.json({ 
        success: false, 
        message: 'Items can only be cancelled before shipping.' 
      });
    }

    const itemIndex = order.orderedItemes.findIndex(
      item => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.json({ 
        success: false, 
        message: 'Item not found in order' 
      });
    }

    const item = order.orderedItemes[itemIndex];

    if (item.status === 'Cancelled') {
      return res.json({ 
        success: false, 
        message: 'This item has already been cancelled' 
      });
    }

    if (item.product && item.product._id) {
      await Product.findByIdAndUpdate(
        item.product._id,
        { $inc: { quantity: item.quantity } }
      );
    }

    const itemRefund = item.price * item.quantity;

    order.orderedItemes[itemIndex].status = 'Cancelled';
    order.orderedItemes[itemIndex].cancellationReason = reason;
    order.orderedItemes[itemIndex].cancellationComments = comments;
    order.orderedItemes[itemIndex].cancelledDate = new Date();

    order.totalPrice -= itemRefund;
    order.finalAmount -= itemRefund;

    const allItemsCancelled = order.orderedItemes.every(
      item => item.status === 'Cancelled'
    );

    if (allItemsCancelled) {
      order.status = 'Cancelled';
    }

    order.updatedAt = new Date();
    await order.save();

    res.json({ 
      success: true, 
      message: 'Item cancelled successfully.' 
    });

  } catch (error) {
    console.error("Error cancelling order item:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cancelling item.' 
    });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, itemId, reason, comments } = req.body;

    if (!orderId || !itemId || !reason) {
      return res.json({ 
        success: false, 
        message: 'Order ID, Item ID and reason are required' 
      });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    }).populate('orderedItemes.product');

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const itemIndex = order.orderedItemes.findIndex(
      item => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.json({ 
        success: false, 
        message: 'Item not found in order' 
      });
    }

    const item = order.orderedItemes[itemIndex];

    if (item.status === 'Return Request' || item.status === 'Returned') {
      return res.json({ 
        success: false, 
        message: 'A return request has already been submitted for this item' 
      });
    }

    if (item.status !== 'Delivered' && order.status !== 'Delivered') {
      return res.json({ 
        success: false, 
        message: 'Only delivered items can be returned' 
      });
    }

    const deliveryDate = order.invoiceDate || order.createdOn;
    const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveryDate).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceDelivery > 7) {
      return res.json({ 
        success: false, 
        message: 'Return window has expired.' 
      });
    }

    order.orderedItemes[itemIndex].status = 'Return Request';
    order.orderedItemes[itemIndex].returnReason = reason;
    order.orderedItemes[itemIndex].returnComments = comments;
    order.orderedItemes[itemIndex].returnRequestedDate = new Date();

    order.updatedAt = new Date();
    await order.save();

    res.json({ 
      success: true, 
      message: 'Return request submitted successfully.' 
    });

  } catch (error) {
    console.error("Error processing return request:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing return request.' 
    });
  }
};

const generateInvoice = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.id;

    const order = await Order.findOne({ _id: orderId, address: userId })
      .populate('orderedItemes.product', 'productName productImage finalPrice description')
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Invoice generation logic here
    res.json({ success: true, message: 'Invoice generated' });

  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({ success: false, message: 'Error generating invoice' });
  }
};

module.exports = {
  loadOrders,
  getOrderDetails,
  cancelOrder,
  returnOrder,
  cancelOrderItem,
  returnOrderItem,
  generateInvoice
};
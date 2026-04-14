import Order from '../../models/orderSchema.js';
import User from '../../models/userSchema.js';
import Product from '../../models/productSchema.js';
import Wallet from "../../models/walletSchema.js";
import { creditWallet } from "../user/walletController.js";
import sharp from "sharp";
import fs from "fs";
import multer from "multer";
import path from 'path';

const loadOrders = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    let query = {};
    if (search) {
      query = {
        $or: [
          { orderId: { $regex: search, $options: "i" } },
          { status: { $regex: search, $options: "i" } }
        ]
      };
    }

    const totalOrders = await Order.countDocuments(query);
    
    const orders = await Order.find(query)
      .populate({ path: 'address', select: 'name email address phone' })
      .populate({
        path: 'orderedItems.product',  
        select: 'productName category productImage price salePrice'
      })
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    if (search && !orders.length) {
      const users = await User.find({
        name: { $regex: search, $options: "i" }
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      
      if (userIds.length > 0) {
        const userQuery = { address: { $in: userIds } };
        const userBasedOrders = await Order.find(userQuery)
          .populate({ path: 'address', select: 'name email address phone' })
          .populate({
            path: 'orderedItems.product',  
            select: 'productName category productImage price salePrice'
          })
          .sort({ createdOn: -1 })
          .skip((page - 1) * limit)
          .limit(limit);
        
        const totalUserOrders = await Order.countDocuments(userQuery);
        
        return res.render("admin/orders", {
          title: "Order Management",
          orders: userBasedOrders,
          totalOrders: totalUserOrders,
          search,
          currentPage: page,
          totalPages: Math.ceil(totalUserOrders / limit)
        });
      }
    }

    res.render("admin/orders", {
      title: "Order Management",
      orders,
      totalOrders,
      search,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit)
    });
    
  } catch (error) {
    console.error("Error loading orders:", error);
    res.redirect("/admin/pageerror");
  }
};

const viewOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const order = await Order.findById(orderId)
      .populate({ path: 'address', select: 'name email phone' })
      .populate({
        path: 'orderedItems.product',  
        select: 'productName category productImage price salePrice description color size'
      });

    if (!order) {
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      return res.redirect("/admin/orders");
    }

    const user = await User.findById(order.address).select('addresses').lean();
    let shippingAddress = null;

    if (order.selectedAddressId && user?.addresses) {
      shippingAddress = user.addresses.find(
        addr => addr._id.toString() === order.selectedAddressId.toString()
      );
    }
    if (!shippingAddress && user?.addresses?.length > 0) {
      shippingAddress = user.addresses[0];
    }

    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.json({
        success: true,
        order: {
          ...order.toObject(),
          formattedDate: order.createdOn ? new Date(order.createdOn).toLocaleDateString() : 'N/A',
          invoiceDate: order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString() : 'N/A',
          shippingAddress: shippingAddress || {}
        }
      });
    }

    res.render("admin/order-detail", {
      title: `Order Details - #${order.orderId}`,
      order: {
        ...order.toObject(),
        formattedDate: order.createdOn ? new Date(order.createdOn).toLocaleDateString() : 'N/A',
        invoiceDate: order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString() : 'N/A',
        shippingAddress: shippingAddress || {}
      }
    });

  } catch (error) {
    console.error("Error viewing order:", error);
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.status(500).json({ success: false, message: error.message });
    }
    res.redirect("/admin/orders");
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ success: false, message: 'Order ID and status are required' });
    }
    
    const validStatuses = ['Pending', 'Processing', 'Shipping', 'Delivered', 'Return Request', 'Returned', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(orderId).populate('orderedItems.product');  

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const oldStatus = order.status;
    order.status = status;
    order.updatedAt = new Date();

    if (status === 'Delivered' && !order.invoiceDate) {
      order.invoiceDate = new Date();
    }

    if (['Processing', 'Shipping', 'Delivered'].includes(status)) {
      order.orderedItems.forEach(item => {  
        if (['Pending', 'Processing', 'Shipping'].includes(item.status || 'Pending')) {
          item.status = status;
        }
      });
    }

    // Deduct stock when moving from Pending to Processing/Shipping/Delivered
    if (oldStatus === 'Pending' && ['Processing', 'Shipping', 'Delivered'].includes(status)) {
     
    }

    await order.save();

    res.json({
      success: true,
      message: `Order status updated to ${status} successfully`,
      order: {
        id: order._id,
        status: order.status,
        updatedAt: order.updatedAt,
        itemStatuses: order.orderedItems.map(i => ({  
          product: i.product?.productName,
          status: i.status
        }))
      }
    });

  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


const handleReturnRequest = async (req, res) => {
  try {
    const { orderId, action } = req.body;

    if (!orderId || !action || !['accept', 'reject'].includes(action)) {
      return res.json({ success: false, message: 'Invalid request' });
    }

    const order = await Order.findById(orderId)
      .populate('orderedItems.product')  
      .populate('address');

    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }

    const returnRequestedItems = order.orderedItems.filter(  
      item => (item.status || '').trim() === 'Return Request'
    );

    const isOrderLevelReturn = order.status === 'Return Request';

    if (returnRequestedItems.length === 0 && !isOrderLevelReturn) {
      return res.json({
        success: false,
        message: 'This order does not have any pending return request'
      });
    }

    if (action === 'accept') {
      let refundAmount = 0;

      if (isOrderLevelReturn && returnRequestedItems.length === 0) {
        refundAmount = order.finalAmount;
        order.status = 'Returned';

        for (const item of order.orderedItems) {  
          if (item.product) {
            await Product.findByIdAndUpdate(
              item.product._id,
              { $inc: { quantity: item.quantity } }
            );
          }
          item.status = 'Returned';
        }
      } else {
        for (const item of returnRequestedItems) {
        const itemTotal = item.price * item.quantity;
const orderTotal = order.totalPrice;

const itemShare = itemTotal / orderTotal;
const itemDiscount = order.discount * itemShare;

const finalItemAmount = itemTotal - itemDiscount;

refundAmount += finalItemAmount;

          if (item.product) {
            await Product.findByIdAndUpdate(
              item.product._id,
              { $inc: { quantity: item.quantity } }
            );
          }
          item.status = 'Returned';
        }

        const allProcessed = order.orderedItems.every(  
          i => ['Returned', 'Cancelled'].includes(i.status || '')
        );
        if (allProcessed) order.status = 'Returned';
      }

      order.returnApprovedDate = new Date();
      order.updatedAt = new Date();
      await order.save();

      if (refundAmount > 0) {
        await creditWallet(
          order.address._id || order.address,
          refundAmount,
          `Return approved - Order #${String(order.orderId).slice(-8).toUpperCase()}`,
          order._id
        );
      }

      return res.json({
        success: true,
        message: `Return accepted. ₹${refundAmount.toFixed(2)} credited to customer wallet.`
      });
    }

    
    if (action === 'reject') {
      if (isOrderLevelReturn) {
        order.status = 'Delivered';
      }

      for (const item of returnRequestedItems) {  // ✅ fixed typo
        item.status = 'Delivered';
        item.returnReason = undefined;
        item.returnComments = undefined;
        item.returnRequestedDate = undefined;
      }

      order.updatedAt = new Date();
      await order.save();

      return res.json({
        success: true,
        message: `Return rejected for ${returnRequestedItems.length || 'all'} item(s).`
      });
    }

  } catch (error) {
    console.error('Error handling return request:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

const approveReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.body;

    if (!orderId) {
      return res.json({ success: false, message: 'Order ID is required' });
    }

    const order = await Order.findById(orderId).populate('orderedItems.product');  // ✅ fixed typo

    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }

    let refundAmount = 0;

    if (itemId) {
      const itemIndex = order.orderedItems.findIndex(  // ✅ fixed typo
        i => i._id.toString() === itemId
      );

      if (itemIndex === -1) {
        return res.json({ success: false, message: 'Item not found in order' });
      }

      const item = order.orderedItems[itemIndex];  // ✅ fixed typo

      if (item.status !== 'Return Request') {
        return res.json({ success: false, message: 'No return request for this item' });
      }

      refundAmount = item.price * item.quantity;
      order.orderedItems[itemIndex].status = 'Returned';  // ✅ fixed typo
      order.orderedItems[itemIndex].returnApprovedDate = new Date();

      if (item.product?._id) {
        await Product.findByIdAndUpdate(
          item.product._id,
          { $inc: { quantity: item.quantity } }
        );
      }

      const allDone = order.orderedItems.every( 
        i => ['Returned', 'Cancelled'].includes(i.status)
      );
      if (allDone) order.status = 'Returned';

    } else {
      if (order.status !== 'Return Request') {
        return res.json({ success: false, message: 'No return request for this order' });
      }

      refundAmount = order.finalAmount;
      order.status = 'Returned';
      order.returnApprovedDate = new Date();

      for (const item of order.orderedItems) { 
        if (item.product?._id) {
          await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { quantity: item.quantity } }
          );
        }
        item.status = 'Returned';
      }
    }

    order.updatedAt = new Date();
    await order.save();

    await creditWallet(
      order.address,
      refundAmount,
      `Return approved - Order #${String(order.orderId).slice(-8).toUpperCase()}`,
      order._id
    );

    return res.json({
      success: true,
      message: `Return approved. ₹${refundAmount.toFixed(2)} credited to customer wallet.`
    });

  } catch (err) {
    console.error('Error approving return:', err);
    return res.status(500).json({ success: false, message: 'Error approving return' });
  }
};

const getOrderStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$finalAmount' } } }
    ]);

    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        statusBreakdown: stats
      }
    });
  } catch (error) {
    console.error("Error getting order stats:", error);
    res.status(500).json({ success: false, message: 'Error fetching order statistics' });
  }
};

const exportOrders = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let query = {};

    if (startDate || endDate) {
      query.createdOn = {};
      if (startDate) query.createdOn.$gte = new Date(startDate);
      if (endDate) query.createdOn.$lte = new Date(endDate);
    }
    if (status && status !== 'all') query.status = status;

    const orders = await Order.find(query)
      .populate('address', 'name email phone')
      .populate('orderedItems.product', 'productName price')  
      .sort({ createdOn: -1 });

    const csvHeaders = ['Order ID','Customer Name','Customer Email','Total Amount','Status','Order Date','Items Count'].join(',');

    const csvRows = orders.map(order => [
      order.orderId,
      order.address?.name || 'N/A',
      order.address?.email || 'N/A',
      order.finalAmount,
      order.status,
      order.createdOn ? new Date(order.createdOn).toLocaleDateString() : 'N/A',
      order.orderedItems?.length || 0
    ].join(','));

    const csvContent = [csvHeaders, ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error("Error exporting orders:", error);
    res.status(500).json({ success: false, message: 'Error exporting orders' });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'Order ID is required' });

    const order = await Order.findByIdAndUpdate(
      orderId,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ success: false, message: 'Error deleting order' });
  }
};

const bulkUpdateStatus = async (req, res) => {
  try {
    const { orderIds, status } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Order IDs array is required' });
    }

    const validStatuses = ['Pending', 'Processing', 'Shipping', 'Delivered', 'Return Request', 'Returned', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const result = await Order.updateMany(
      { _id: { $in: orderIds } },
      { status, updatedAt: new Date() }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} orders updated to ${status}`,
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error bulk updating orders:", error);
    res.status(500).json({ success: false, message: 'Error updating orders' });
  }
};

export {
  loadOrders,
  viewOrder,
  updateOrderStatus,
  handleReturnRequest,
  approveReturn,       
  getOrderStats,
  exportOrders,
  deleteOrder,
  bulkUpdateStatus,
  
};
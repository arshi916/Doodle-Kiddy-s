const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const sharp = require("sharp");
const fs = require("fs");
const multer = require('multer');
const path = require('path');

const loadOrders = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    // Build search query - search by orderId, user name, or status
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
      .populate({
        path: 'address',
        select: 'name email address phone'
      })
      .populate({
        path: 'orderedItemes.product',
        select: 'productName category productImage price salePrice'
      })
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // If search includes user name, we need a different approach
    if (search && !orders.length) {
      const users = await User.find({
        name: { $regex: search, $options: "i" }
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      
      if (userIds.length > 0) {
        query = { address: { $in: userIds } };
        const userBasedOrders = await Order.find(query)
          .populate({
            path: 'address',
            select: 'name email address phone'
          })
          .populate({
            path: 'orderedItemes.product',
            select: 'productName category productImage price salePrice'
          })
          .sort({ createdOn: -1 })
          .skip((page - 1) * limit)
          .limit(limit);
        
        const totalUserOrders = await Order.countDocuments(query);
        
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
      .populate({
        path: 'address',
        select: 'name email phone'
      })
      .populate({
        path: 'orderedItemes.product',
        select: 'productName category productImage price salePrice description color size'
      });
    console.log("Order data:", order);

    if (!order) {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      return res.redirect("/admin/orders");
    }

    const user = await User.findById(order.address).select('addresses').lean();
    console.log("User addresses:", user ? user.addresses : 'No user found');
    let shippingAddress = null;
    if (order.selectedAddressId && user && user.addresses) {
      shippingAddress = user.addresses.find(addr => addr._id.toString() === order.selectedAddressId.toString());
    }
    console.log("Shipping Address:", shippingAddress);

    if (!shippingAddress && user && user.addresses.length > 0) {
      shippingAddress = user.addresses[0];
    }

    if (order.status === 'Pending') {
      for (const item of order.orderedItemes) {
        const product = await Product.findById(item.product);
        if (product && product.quantity >= item.quantity) {
          product.quantity -= item.quantity;
          await product.save();
        } else {
          throw new Error(`Insufficient stock for product ${item.product}`);
        }
      }
      order.status = 'Processing';
      order.updatedAt = new Date();
      await order.save();
    }

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
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
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ success: false, message: error.message || 'Error loading order details' });
    }
    res.redirect("/admin/orders");
  }
};
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    
   
    if (!orderId || !status) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID and status are required' 
      });
    }
    

    const validStatuses = ['Pending', 'Processing', 'Shipping', 'Delivered', 'Return Request', 'Returned', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ') 
      });
    }

 
    const order = await Order.findByIdAndUpdate(
      orderId,
      { 
        status: status,
       
        ...(status === 'Delivered' && { invoiceDate: new Date() }),
    
        updatedAt: new Date()
      },
      { new: true }
    ).populate('address', 'name email');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    if (['Processing', 'Shipping', 'Delivered'].includes(status) && order.status === 'Pending') {
      for (const item of order.orderedItemes) {
        const product = await Product.findById(item.product);
        if (product && product.quantity >= item.quantity) {
          product.quantity -= item.quantity;
          await product.save();
        } else {
          throw new Error(`Insufficient stock for product ${item.product}`);
        }
      }
    }


    console.log(`Order ${order.orderId} status changed to ${status} at ${new Date()}`);

    res.json({ 
      success: true, 
      message: `Order status updated to ${status} successfully`,
      order: {
        id: order._id,
        orderId: order.orderId,
        status: order.status,
        customerName: order.address?.name || 'Unknown',
        updatedAt: order.updatedAt
      }
    });

  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error while updating order status' 
    });
  }
};


const getOrderStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]);

    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$finalAmount' }
        }
      }
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
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching order statistics' 
    });
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
    

    if (status && status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('address', 'name email phone')
      .populate('orderedItemes.product', 'productName price')
      .sort({ createdOn: -1 });


    const csvHeaders = [
      'Order ID',
      'Customer Name',
      'Customer Email', 
      'Total Amount',
      'Status',
      'Order Date',
      'Items Count'
    ].join(',');

    const csvRows = orders.map(order => [
      order.orderId,
      order.address?.name || 'N/A',
      order.address?.email || 'N/A',
      order.finalAmount,
      order.status,
      order.createdOn ? new Date(order.createdOn).toLocaleDateString() : 'N/A',
      order.orderedItemes?.length || 0
    ].join(','));

    const csvContent = [csvHeaders, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error("Error exporting orders:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error exporting orders' 
    });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID is required' 
      });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { 
        isDeleted: true,
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Order deleted successfully' 
    });

  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting order' 
    });
  }
};


const bulkUpdateStatus = async (req, res) => {
  try {
    const { orderIds, status } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order IDs array is required' 
      });
    }

    const validStatuses = ['Pending', 'Processing', 'Shipping', 'Delivered', 'Return Request', 'Returned', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status' 
      });
    }

    const result = await Order.updateMany(
      { _id: { $in: orderIds } },
      { 
        status: status,
        updatedAt: new Date()
      }
    );

    res.json({ 
      success: true, 
      message: `${result.modifiedCount} orders updated to ${status}`,
      updatedCount: result.modifiedCount
    });

  } catch (error) {
    console.error("Error bulk updating orders:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating orders' 
    });
  }
};

module.exports = { 
  loadOrders, 
  viewOrder, 
  updateOrderStatus,
  getOrderStats,
  exportOrders,
  deleteOrder,
  bulkUpdateStatus
}
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    
    orderId: {
        type: String,
        default: function() {
            return uuidv4();
        }
    },
    orderedItemes: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: {
            type: Number,
            required: true,
        },
        price: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'],
            default: 'Pending'
        },
        cancellationReason: String,
        cancellationComments: String,
        cancelledDate: Date,
        returnReason: String,
        returnComments: String,
        returnRequestedDate: Date
    }],
    totalPrice: {
        type: Number,
        required: true,
    },
    discount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true,
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: "User", 
        required: true,
    },
    selectedAddressId: {
        type: Schema.Types.ObjectId,
        required: false
    },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipping', 'Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'],
        default: 'Pending'
    },
    createdOn: {  
        type: Date,
        default: Date.now,
        required: true,
    },
    couponApplied: {
        type: Boolean,
        default: false,
    },
    returnReason: String,
    returnComments: String,
    returnRequestedDate: Date,
    cancellationReason: String,
    cancellationComments: String,
    cancelledDate: Date,
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
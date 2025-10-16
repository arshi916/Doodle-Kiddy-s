const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true
    },
    orderedItemes: [{  // Note: Keep the typo if it's already in your database
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
        enum: ['Pending','Processing','Shipping','Delivered','Return Request','Returned']
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
     returnReason: {
        type: String,
        default: null
    },
    returnComments: {
        type: String,
        default: null
    },
    returnRequestedDate: {
        type: Date,
        default: null
    },
    
    // Cancellation related fields
    cancellationReason: {
        type: String,
        default: null
    },
    cancellationComments: {
        type: String,
        default: null
    },
    cancelledDate: {
        type: Date,
        default: null
    },
    
    // Status should include these options
    status: {
        type: String,
        required: true,
        enum: [
            'Pending', 
            'Processing', 
            'Shipping', 
            'Shipped',
            'Delivered', 
            'Return Request', 
            'Returned', 
            'Cancelled'
        ],
        default: 'Pending'
    },
    
    updatedAt: {
        type: Date,
        default: Date.now
    }

});


const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
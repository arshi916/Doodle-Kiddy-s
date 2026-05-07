import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
const { Schema } = mongoose;

const orderSchema = new Schema({
    
    orderId: {
        type: String,
        default: function() {
            return uuidv4();
        }
    },
   orderedItems: [{
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
            enum: ['Pending', 'Processing', 'Shipping', 'Delivered', 'Cancelled', 'Return Request', 'Returned'],
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
    couponDiscount: {     
    type: Number,
    default: 0
},
couponCode: {         
    type: String,
    default: null
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
        enum: ['Pending', 'Processing', 'Shipping', 'Delivered', 'Return Request', 'Returned', 'Cancelled'],
        default: 'Pending'
    },
    createdOn: {  
        type: Date,
        default: Date.now,
        required: true,
    },
 paymentMethod: {
    type: String,
    enum: ['cod', 'razorpay', 'card', 'upi', 'netbanking', 'wallet', 'wallet+cod'],
    required: true,
    default: 'cod'
},
paymentStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded', 'Partially Paid'],
    default: 'Pending'
},
    walletAmountUsed: {
    type: Number,
    default: 0
},
codAmountDue: {
    type: Number,
    default: 0
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
export default Order;
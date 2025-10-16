const mongoose = require('mongoose');
const {Schema} = mongoose;

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        selectedSize: {
            type: String,
            default: '', // Allow empty string for products without sizes
            // Remove the enum validation to make it more flexible
        },
        selectedColor: {
            type: String,
            default: '', // FIXED: Allow empty string for products without colors
        },
        quantity: {
            type: Number,
            default: 1,
            min: 1
        },
        price: {
            type: Number,
            required: true,
        },
        totalPrice: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            default: 'placed'
        },
        cancellationReason: {
            type: String,
            default: 'none'
        }
    }]
});

cartSchema.index({ userId: 1 });
cartSchema.index({ "items.productId": 1 });

const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;
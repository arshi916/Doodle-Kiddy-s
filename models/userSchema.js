
const mongoose = require("mongoose"); const { Schema } = mongoose;


const addressSchema = new Schema({
    addressType: {
        type: String,
        enum: ['Home', 'Work', 'Other'],
        default: 'Home'
    },
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    address: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    zipCode: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true,
        default: 'India'
    },
    isDefault: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });



const userSchema = new Schema({
    name: { type: String, 
        required: true },
    email: { type: String, 
        required: true, 
        unique: true },
    phone: { 
        type: String, 
        required: function() { return !this.googleID; }, 
        sparse: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: function() { return !this.googleID; } 
    },
    googleID: { type: String, sparse: true, unique: true },

    profileImage: {  
        type: String,  
        default: "/images/default-avatar.png"  
    },
    

    isBlocked: { 
        type: Boolean,
         default: false },
    isAdmin: { 
        type: Boolean,
         default: false },
    cart: [{
         type: Schema.Types.ObjectId, 
         ref: "Cart" }],
    wallet: {
         type: Number,
          default: 0 },
    wishlist: [{ type: Schema.
        Types.ObjectId,
         ref: "Wishlist" }],
    orderHistory: [{ type: Schema.Types.ObjectId,
         ref: "Order" }],
    createdOn: { type: Date,
         default: Date.now },
    referalCode: { type: String },
    redeemed: { type: Boolean },
    redeemedUsers: [{ type: Schema.Types.ObjectId,
         ref: "User" }],
    searchHistory: [{
        category: { type: Schema.Types.ObjectId,
             ref: "Category" },
        searchOn: { type: Date, default: Date.now }
    }],
        addresses: [addressSchema]
}, { timestamps: true });




module.exports = mongoose.model("User", userSchema);




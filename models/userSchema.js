import mongoose from "mongoose"; 
const { Schema } = mongoose;

const addressSchema = new Schema({
    addressType: {
        type: String,
        enum: ['Home', 'Work', 'Other'],
        default: 'Home'
    },
    name:     { type: String, required: true },
    phone:    { type: String, required: true },
    altPhone: { type: String, default: '' },
    address:  { type: String, required: true },
    city:     { type: String, required: true },
    landMark: { type: String, default: '' },
    state:    { type: String, required: true },
    zipCode:  { type: String, required: true },
    country:  { type: String, required: true, default: 'India' },
    isDefault:{ type: Boolean, default: false }
}, { timestamps: true });

const userSchema = new Schema({
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true },
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

    profileImage: { type: String, default: "/images/default-avatar.png" },
    isBlocked:    { type: Boolean, default: false },
    isAdmin:      { type: Boolean, default: false },

    cart:         [{ type: Schema.Types.ObjectId, ref: "Cart" }],
    wishlist:     [{ type: Schema.Types.ObjectId, ref: "Wishlist" }],
    orderHistory: [{ type: Schema.Types.ObjectId, ref: "Order" }],

    // ── Referral fields (single clean declaration each) ──
    referralCode: { type: String, sparse: true, default: null },
    referredBy:   { type: String, default: null },
    redeemed:     { type: Boolean, default: false },
    redeemedUsers:[{ type: Schema.Types.ObjectId, ref: "User" }],
    referralCoupon:{ type: String, default: null },

    searchHistory: [{
        category: { type: Schema.Types.ObjectId, ref: "Category" },
        searchOn:  { type: Date, default: Date.now }
    }],

    addresses: [addressSchema],
    createdOn: { type: Date, default: Date.now }

}, { timestamps: true });

const User = mongoose.model("User", userSchema);
export default User;
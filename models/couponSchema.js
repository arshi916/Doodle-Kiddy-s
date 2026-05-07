import mongoose from "mongoose";
const { Schema } = mongoose;

const couponSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
    },
    createdOn: {
        type: Date,
        default: Date.now,
    },
    expireOn: {
        type: Date,
        required: true,
    },


    discountType: {
        type: String,
        enum: ["flat", "percentage"],
        default: "flat",
    },


    offerPrice: {
        type: Number,
        required: true,
    },

   
    maxDiscount: {
        type: Number,
        default: null,
    },

    minimumPrice: {
        type: Number,
        required: true,
    },
    islist: {
        type: Boolean,
        default: true,
    },
    userBy: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
});

const Coupon = mongoose.model("Coupon", couponSchema);
export default Coupon;
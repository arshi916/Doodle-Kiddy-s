import mongoose from "mongoose";
const { Schema } = mongoose;

const offerSchema = new Schema({
    offerType:   { type: String, enum: ['product', 'category'], required: true },
    offerName:   { type: String, required: true },
    discount:    { type: Number, required: true, min: 1, max: 99 },
    productId:   { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    categoryId:  { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    startDate:   { type: Date, required: true },
    endDate:     { type: Date, required: true },
    isActive:    { type: Boolean, default: true },
}, { timestamps: true });

const Offer = mongoose.model("Offer", offerSchema);
export default Offer;
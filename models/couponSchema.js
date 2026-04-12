import mongoose from"mongoose";
const {Schema} = mongoose;

const couponSchema = new mongoose.Schema({
    name:{
        type:String,
        required : true,
        unique : true,
        uppercase : true,
    },
    createdOn : {
        type:Date,
        default : Date.now,
    },
    expireOn:{
        type:Date,
        required : true
    },
    offerPrice: {
        type:Number,
        required:true
    },
    minimumPrice:{
        type:Number,
        required:true,
    },
    islist:{
        type:Boolean,
        default:true,
    },
    userBy:[{
        type:mongoose.Schema.Types.ObjectId,
        ref : "User"
    }]
})

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;

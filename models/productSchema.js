
const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema({
  productName: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String, 
    required: true,
    trim: true
  },
  brand: {
    type: String,
    required: false,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  regularPrice: { 
    type: Number, 
    required: true,
    min: 0
  },
  salePrice: { 
    type: Number, 
    required: true,
    min: 0
  },
  productOffer: { 
    type: Number, 
    default: 0,
    min: 0
  },
  quantity: { 
    type: Number, 
    default: 0,
    min: 0 
  },
  color: { 
    type: [String], 
    required: true,
    validate: {
      validator: function(v) {
        const validColors = [
          "white", "gray", "tan", "beige", "yellow", "orange", "red", 
          "purple", "blue", "green", "black"
        ];
        return v && v.length > 0 && v.every(color => validColors.includes(color.toLowerCase()));
      },
      message: 'Invalid color. Valid colors are: white, gray, tan, beige, yellow, orange, red, purple, blue, green, black'
    },
    set: v => Array.isArray(v) ? v.map(color => color.toLowerCase()) : [v.toLowerCase()]
  },
  size: { 
    type: [String], 
    default: [],
    enum: {
      values: ["XS", "S", "M", "L", "XL"],
      message: '{VALUE} is not a valid size'
    }
  },
  stocks: [{
    color: {
      type: String,
      required: true
    },
    size: {
      type: String,
      enum: ["XS", "S", "M", "L", "XL"],
      required: true
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0
    }
  }],
  productImage: { 
    type: [String], 
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length >= 3 && v.length <= 4;
      },
      message: 'Product must have between 3 and 4 images'
    }
  },
  isBlocked: { 
    type: Boolean, 
    default: false 
  },
  isDeleted: { 
    type: Boolean, 
    default: false 
  },
  status: {
    type: String,
    enum: ["Available", "out of stock", "Discontinued"],
    required: true,
    default: "Available",
  },
  returnPolicy: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true 
});

productSchema.index({ productName: 1 });
productSchema.index({ category: 1 });
productSchema.index({ isDeleted: 1 });
productSchema.index({ isBlocked: 1 });
productSchema.index({ status: 1 });
productSchema.index({ color: 1 }); 


productSchema.pre('save', function(next) {
  if (this.salePrice >= this.regularPrice) {
    const error = new Error('Sale price must be less than regular price');
    return next(error);
  }
  next();
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
const mongoose = require("mongoose");
const { Schema } = mongoose;

const categorySchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  description: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500
  },
  isListed: {
    type: Boolean,
    default: true
  },
  categoryOffer: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
  type: Boolean,
  default: false
},

  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

categorySchema.index({ name: 1 });
categorySchema.index({ isListed: 1 });

categorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;
import mongoose from "mongoose";
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
  title: { type: String, default: '' },
  discount: { type: Number, default: 0 },
  startDate: { type: Date },
  endDate: { type: Date },
  isActive: { type: Boolean, default: false }
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


categorySchema.index({ isListed: 1 });

categorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Category = mongoose.model("Category", categorySchema);
export default Category;
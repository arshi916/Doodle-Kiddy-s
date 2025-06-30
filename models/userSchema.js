const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    defult:null,
  },
  googleID: {
    type: String,
    unique: true,
    sparse: true // This allows multiple null values
  },
  password: {
    type: String,
    required: function() {
      return !this.googleID; // Password required only if not Google auth
    }
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  cart: [{
    type: Schema.Types.ObjectId,
    ref: 'Cart'
  }],
  wallet: {
    type: Number,
    default: 0
  },
  wishlist: [{
    type: Schema.Types.ObjectId,
    ref: 'Wishlist'
  }],
  orderHistory: [{
    type: Schema.Types.ObjectId,
    ref: 'Order'
  }],
  createdOn: {
    type: Date,
    default: Date.now
  },
  redeemed: {
    type: Boolean,
    default: false
  },
  redeemedUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  searchHistory: {
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category'
    },
    brand: {
      type: String
    },
    searchOn: {
      type: Date,
      default: Date.now
    }
  }
});

const User = mongoose.model('User', UserSchema);
module.exports = User;
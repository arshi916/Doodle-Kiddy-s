const mongoose = require('mongoose');
const Category = require('../models/categorySchema'); // Adjust path as needed

async function cleanCategoryNames() {
  try {
    await mongoose.connect('mongodb://localhost:27017/your_database_name', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const categories = await Category.find({ isListed: true, isDeleted: false });

    for (const category of categories) {
      const originalName = category.name;
      category.name = category.name.trim();
      if (category.name !== originalName) {
        await category.save();
        console.log(`Updated category ${category._id}: ${originalName} -> ${category.name}`);
      }
    }

    console.log('Category name cleanup completed');
    mongoose.connection.close();
  } catch (error) {
    console.error('Error cleaning category names:', error);
    mongoose.connection.close();
  }
}

cleanCategoryNames();
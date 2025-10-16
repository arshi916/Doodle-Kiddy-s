const mongoose = require("mongoose"); 
const Category = require("../../models/categorySchema");  

const loadCategories = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    
    const query = search
      ? { name: { $regex: search, $options: "i" }, isDeleted: false }
      : { isDeleted: false };

    const total = await Category.countDocuments(query);
    const categories = await Category.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    
    const successMessage = req.session.successMessage;
    if (successMessage) {
      delete req.session.successMessage; 
    }

    res.render("admin/category", {
      categories,
      activePage: "categories",
      search,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      successMessage 
    });
  } catch (err) {
    console.error(err);
    res.redirect("/admin/pageerror");
  }
}; 

const loadAddCategory = (req, res) => {   

  const popupMessage = req.session.popupMessage;
  if (popupMessage) {
    delete req.session.popupMessage;
  }

  res.render("admin/addCategory", { 
    activePage: "categories",
    popupMessage 
  }); 
};  

const addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const trimmedName = name ? name.trim() : '';
    const trimmedDescription = description ? description.trim() : '';

    if (!trimmedName) {
      req.session.popupMessage = {
        type: 'error',
        message: "Category name is required. Please enter a valid category name."
      };
      return res.redirect("/admin/categories/add");
    }

    if (trimmedName.length < 2) {
      req.session.popupMessage = {
        type: 'error',
        message: "Category name must be at least 2 characters long."
      };
      return res.redirect("/admin/categories/add");
    }

    if (trimmedName.length > 50) {
      req.session.popupMessage = {
        type: 'error',
        message: "Category name cannot exceed 50 characters."
      };
      return res.redirect("/admin/categories/add");
    }

    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      isDeleted: false 
    });
    
    if (existingCategory) {
      req.session.popupMessage = {
        type: 'error',
        message: `Category "${trimmedName}" already exists! Please choose a different name.`
      };
      return res.redirect("/admin/categories/add");
    }

    if (trimmedDescription && trimmedDescription.length > 500) {
      req.session.popupMessage = {
        type: 'error',
        message: "Description cannot exceed 500 characters."
      };
      return res.redirect("/admin/categories/add");
    }

    const newCategory = new Category({ 
      name: trimmedName, 
      description: trimmedDescription, 
      isDeleted: false,
      isListed: true
    });

    await newCategory.save();
    console.log("New category added:", newCategory);

   
    req.session.successMessage = `Category "${trimmedName}" has been added successfully! 🎉`;
    res.redirect("/admin/categories");
    
  } catch (err) {
    console.error("Error adding category:", err);
    

    if (err.code === 11000) {
      req.session.popupMessage = {
        type: 'error',
        message: "Category already exists! Please choose a different name."
      };
      return res.redirect("/admin/categories/add");
    }
    
   
    req.session.popupMessage = {
      type: 'error',
      message: "Something went wrong while adding the category. Please try again."
    };
    return res.redirect("/admin/categories/add");
  }
};

const loadEditCategory = async (req, res) => {   
  try {     
    const { id } = req.params;      
    
    if (!mongoose.Types.ObjectId.isValid(id)) {       
      req.session.popupMessage = {
        type: 'error',
        message: "Invalid category ID provided."
      };
      return res.redirect("/admin/categories");     
    }      
    
    const category = await Category.findById(id);     
    if (!category || category.isDeleted) {       
      req.session.popupMessage = {
        type: 'error',
        message: "Category not found or has been deleted."
      };
      return res.redirect("/admin/categories");     
    }      

    const errorMessage = req.session.errorMessage;
    if (errorMessage) {
      delete req.session.errorMessage;
    }
    
    res.render("admin/editCategory", { 
      category, 
      activePage: "categories",
      errorMessage
    });   
  } catch (err) {     
    console.error("Error loading edit category:", err);     
    req.session.popupMessage = {
      type: 'error',
      message: "Error loading category for editing."
    };
    res.redirect("/admin/categories");   
  } 
};  

const updateCategory = async (req, res) => {   
  try {     
    const { id } = req.params;      
    
    if (!mongoose.Types.ObjectId.isValid(id)) {       
      req.session.errorMessage = "Invalid category ID provided.";
      return res.redirect("/admin/categories");     
    }      
    
    const { name, description } = req.body;
    
  
    const trimmedName = name ? name.trim() : '';
    const trimmedDescription = description ? description.trim() : '';

  
    if (!trimmedName) {
      req.session.errorMessage = "Category name is required. Please enter a valid category name.";
      return res.redirect(`/admin/categories/edit/${id}`);
    }

    if (trimmedName.length < 2) {
      req.session.errorMessage = "Category name must be at least 2 characters long.";
      return res.redirect(`/admin/categories/edit/${id}`);
    }

    if (trimmedName.length > 50) {
      req.session.errorMessage = "Category name cannot exceed 50 characters.";
      return res.redirect(`/admin/categories/edit/${id}`);
    }

    if (trimmedDescription && trimmedDescription.length > 500) {
      req.session.errorMessage = "Description cannot exceed 500 characters.";
      return res.redirect(`/admin/categories/edit/${id}`);
    }

    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      _id: { $ne: id },
      isDeleted: false
    });
    
    if (existingCategory) {
      req.session.errorMessage = `Category name "${trimmedName}" already exists. Please choose a different name.`;
      return res.redirect(`/admin/categories/edit/${id}`);
    }
    
    const updatedCategory = await Category.findByIdAndUpdate(
      id, 
      {       
        name: trimmedName,       
        description: trimmedDescription,       
        updatedAt: new Date(),     
      },
      { new: true }
    );

    if (!updatedCategory) {
      req.session.errorMessage = "Category not found or could not be updated.";
      return res.redirect("/admin/categories");
    }
    
    req.session.successMessage = `Category "${trimmedName}" has been updated successfully! `;
    res.redirect("/admin/categories");   
  } catch (err) {     
    console.error("Error updating category:", err);
    
    if (err.code === 11000) {
      req.session.errorMessage = "Category name already exists. Please choose a different name.";
      return res.redirect(`/admin/categories/edit/${req.params.id}`);
    }
    
    req.session.errorMessage = "Something went wrong while updating the category. Please try again.";
    return res.redirect(`/admin/categories/edit/${req.params.id}`);   
  } 
};  

const toggleCategoryListing = async (req, res) => {   
  try {     
    console.log('Toggle listing request received');
    console.log('Request body:', req.body);
    
    const { categoryId } = req.body;      
    
    if (!categoryId) {
      console.log('No category ID provided');
      return res.status(400).json({ 
        success: false, 
        message: "Category ID is required" 
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {       
      console.log('Invalid category ID format');
      return res.status(400).json({ 
        success: false, 
        message: "Invalid Category ID format" 
      });     
    }      
    
    console.log('Looking for category with ID:', categoryId);
    
    const category = await Category.findById(categoryId);
    if (!category || category.isDeleted) {
      console.log('Category not found or deleted');
      return res.status(404).json({ 
        success: false, 
        message: "Category not found" 
      });
    }
    
    console.log('Found category:', category.name, 'Current isListed:', category.isListed);
    
    const previousStatus = category.isListed;
    category.isListed = !category.isListed;
    category.updatedAt = new Date();
    await category.save();
    
    console.log('Category listing status updated to:', category.isListed);
    
    const statusText = category.isListed ? 'listed' : 'unlisted';
    const successMessage = `Category "${category.name}" has been ${statusText} successfully! ${category.isListed ? '✅' : '❌'}`;
    
    req.session.successMessage = successMessage;
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({ 
        success: true, 
        message: successMessage,
        isListed: category.isListed,
        categoryName: category.name
      });
    }
    
    res.redirect("/admin/categories");   
  } catch (err) {     
    console.error('Error toggling category listing:', err);     
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ 
        success: false, 
        message: "Something went wrong while updating category status. Please try again." 
      });
    }
    
    req.session.popupMessage = {
      type: 'error',
      message: "Error updating category status. Please try again."
    };
    res.redirect("/admin/categories");   
  } 
}; 

const toggleCategoryStatus = async (req, res) => {   
  try {     
    console.log('Toggle category request received');
    console.log('Request body:', req.body);
    console.log('Request URL:', req.originalUrl);
    
    const { categoryId } = req.body;     
    
    if (!categoryId) {
      console.log('No category ID provided');
      return res.status(400).json({ 
        success: false, 
        message: "Category ID is required" 
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid Category ID format" 
      });
    }
    
    const category = await Category.findById(categoryId);     
    if (!category || category.isDeleted) {
      console.log('Category not found or deleted');
      return res.status(404).json({ 
        success: false, 
        message: "Category not found" 
      });
    }
    
    console.log('Found category:', category.name);
    
    if (req.originalUrl.includes('toggle-listing')) {
      category.isListed = !category.isListed;
      console.log('Toggling isListed from', !category.isListed, 'to', category.isListed);
    } else {
      category.status = category.status === "Active" ? "Inactive" : "Active";
      console.log('Toggling status to', category.status);
    }
    
    category.updatedAt = new Date();
    await category.save();      
    
    console.log('Category updated successfully');
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({ 
        success: true, 
        message: `Category "${category.name}" updated successfully`,
        isListed: category.isListed,
        status: category.status,
        categoryName: category.name
      });
    }
    
    req.session.successMessage = `Category "${category.name}" updated successfully!`;
    res.redirect("/admin/categories");   
  } catch (err) {     
    console.error('Error toggling category:', err);     
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ 
        success: false, 
        message: "Something went wrong while updating category" 
      });
    }
    
    req.session.popupMessage = {
      type: 'error',
      message: "Error updating category. Please try again."
    };
    res.redirect("/admin/categories");   
  } 
};   

module.exports = {   
  loadCategories,   
  loadAddCategory,   
  addCategory,   
  loadEditCategory,   
  updateCategory,   
  toggleCategoryListing,
  toggleCategoryStatus  
};
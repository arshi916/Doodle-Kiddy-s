const loadSignup = async (req, res) => {
    try {
        return res.render('user/signup', { message: null });
    } catch (error) {
        console.log('Signup page not loading:', error);
        res.status(500).send('Server Error');
    }
};
const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.user;
        
        console.log('Loading homepage...'); 
        
        const categories = await Category.find({ isListed: true });
        console.log('Active categories found:', categories.length); 
        
        if (categories.length === 0) {
            console.log('No active categories found');
            if (userId) {
                const userData = await User.findOne({ _id: userId });
                return res.render("user/home", { 
                    user: userData, 
                    products: [] 
                });
            } else {
                return res.render("user/home", { 
                    products: [] 
                });
            }
        }

        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        })
        .populate('category', 'name isListed') 
        .sort({ createdOn: -1 }) 
        .limit(4) 
        .lean(); 

        console.log('Raw products found:', productData.length); 
        
        
        productData = productData.filter(product => 
            product.category && product.category.isListed
        );

        console.log('Filtered products count:', productData.length); 
        
        if (productData.length > 0) {
            console.log('Sample products:', productData.slice(0, 2).map(p => ({ 
                name: p.productName, 
                category: p.category?.name,
                createdOn: p.createdOn,
                salePrice: p.salePrice,
                regularPrice: p.regularPrice,
                quantity: p.quantity,
                images: p.productImage?.length || 0
            }))); 
        }

        if (userId) {
            const userData = await User.findOne({ _id: userId });
            return res.render("user/home", { 
                user: userData, 
                products: productData 
            });
        } else {
            return res.render("user/home", { 
                products: productData 
            });
        }
    } catch (error) {
        console.log('Home page error:', error);
       
        try {
            const userId = req.session.user;
            if (userId) {
                const userData = await User.findOne({ _id: userId });
                return res.render("user/home", { 
                    user: userData, 
                    products: [] 
                });
            } else {
                return res.render("user/home", { 
                    products: [] 
                });
            }
        } catch (renderError) {
            console.log('Error rendering fallback:', renderError);
            res.status(500).send('Server error');
        }
    }
};
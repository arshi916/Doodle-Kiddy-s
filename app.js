require('dotenv').config();

const express = require('express');
const app = express();
const path = require("path");
const MongoStore = require("connect-mongo");
const session = require('express-session');
const passport = require('./config/passport');
const userRouter = require('./routers/userRouter');
const StatusCodes = require('./config/statusCodes');
const db = require('./config/db');
db();

const adminRouter = require("./routers/adminRouter");
const userMiddleware = require('./middlewares/userMiddleware');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.post('/clear-popup-message', (req, res) => {
    delete req.session.popupMessage;
    res.sendStatus(200);
});

app.use(userMiddleware);
app.use('/', userRouter);
app.use('/admin', adminRouter);

app.use((req, res, next) => {
    res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Route not found'
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

app.listen(process.env.PORT, () => {
    console.log('Server Running');
});

module.exports = app;
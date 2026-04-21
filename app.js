import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import MongoStore from "connect-mongo";
import session from "express-session";

import passport from "./config/passport.js";
import userMiddleware from "./middlewares/userMiddleware.js";

import userRouter from "./routers/userRouter.js";
import adminRouter from "./routers/adminRouter.js";

import StatusCodes from "./config/statusCodes.js";
import db from "./config/db.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

db();

const userSession = session({
  name: "connect.sid_user",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 72 * 60 * 60 * 1000,
    path: "/",
  },
});


const adminSession = session({
  name: "connect.sid_admin",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 72 * 60 * 60 * 1000,
    path: "/", 
  },
});


app.use((req, res, next) => {
  if (req.path.startsWith("/admin")) {
    adminSession(req, res, next);
  } else {
    userSession(req, res, next);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(passport.initialize());
app.use(passport.session());
app.use(userMiddleware);



app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


app.post("/clear-popup-message", (req, res) => {
  delete req.session.popupMessage;
  res.sendStatus(200);
});


app.use("/", userRouter);
app.use("/admin", adminRouter);


app.use((req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: "Route not found",
  });
});


app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

app.listen(process.env.PORT, () => {
  console.log("Server Running on port", process.env.PORT);
});

export default app;
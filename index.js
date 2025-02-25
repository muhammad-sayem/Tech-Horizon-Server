const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// Middlewares //
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.crzce.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollection = client.db('techHorizon').collection('users');
        const productsCollection = client.db('techHorizon').collection('products');
        const featuredCollection = client.db('techHorizon').collection('featured');
        const reviewsCollection = client.db('techHorizon').collection('reviews');
        const couponsCollection = client.db('techHorizon').collection('coupons');

        // JWT token create //
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // Middlewares //
        const verifyToken = (req, res, next) => {
            // console.log("Inside verify token", req.headers.authorization);
            if (!req.headers.authorization) {
                res.status(401).send({ message: "unauthorized Access!!" });
            }
            const token = req.headers.authorization.split(' ')[1];

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "unauthorized Access!!" });
                }
                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'Admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access!!' })
            }
            next();
        }

        const verifyModerator = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isModerator = user?.role === 'Moderator';
            if (!isModerator) {
                return res.status(403).send({ message: 'forbidden access!!' })
            }
            next();
        }

        // Add a new user to userCollection //    
        app.post('/users', async (req, res) => {
            const user = req.body;

            // Check if this email already exists or not // 
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists!!' });
            }
            const result = await userCollection.insertOne({
                ...user,
                role: 'User',
                subscribed: false
            });
            res.send(result);
        });

        // Get user role // 
        app.get('/user/role/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await userCollection.findOne(query);
            res.send({ role: result?.role });
        });


        // Get all users from userCollection //
        app.get('/users', verifyToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        // Change user status to subscribed //
        app.patch('/user/status-subscribed/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    subscribed: true
                }
            }
            const result = await userCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        // Delete a user from userCollection //
        // app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: new ObjectId(id) };
        //     const result = await userCollection.deleteOne(query);
        //     res.send(result);
        // });


        // Add or save a product to productsCollection //
        app.post('/products', verifyToken, async (req, res) => {
            const product = req.body;
            const result = await productsCollection.insertOne(product);
            res.send(result);
        });

        // app.post('/products', verifyToken, async (req, res) => {
        //     const { email } = req.body; 
        //     const user = await userCollection.findOne({ email });
        
        //     if (!user) {
        //         return res.status(404).send({ message: "User not found" });
        //     }
        
            
        //     const existingProducts = await productsCollection.countDocuments({ email });
        //     if (!user.subscribed && existingProducts >= 1) {
        //         return res.status(403).send({ message: "Free users can only add 1 product. Upgrade to add more." });
        //     }
        
           
        //     const result = await productsCollection.insertOne(req.body);
        //     res.send(result);
        // });
        

       
        

        // Get all products //
        app.get('/all-products', async (req, res) => {
            const result = await productsCollection.find().toArray();
            res.send(result);
        });

        // Get all accepted products form productsCollection //
        app.get('/products', async (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 6;
            const skip = (page - 1) * limit;
            const query = { status: 'Accepted' }

            if (req.query.search) {
                query.tags = {
                    $regex: req.query.search,
                    $options: "i"
                }
            }
            const products = await productsCollection.find(query).skip(skip).limit(limit).toArray();
            const totalProducts = await productsCollection.countDocuments(query)
            res.send({ products, totalProducts });
        });

        // Get all reported products //
        app.get('/products/reported', async (req, res) => {
            const query = { reported: true };
            const result = await productsCollection.find(query).toArray();
            res.send(result);
        })

        // Get a specific product from productsCollection //
        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.send(result);
        });

        // Increase upvote count of a product //
        app.patch('/product/upvote/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const userEmail = req.decoded.email;
            const query = { _id: new ObjectId(id) };
            const product = await productsCollection.findOne(query);

            if (product.upVotedUsers && product.upVotedUsers.includes(userEmail)) {
                return res.status(400).send({ message: "You have already upvoted the product" })
            }

            const updatedDoc = {
                $inc: { upvotes: 1 },
                $push: { upVotedUsers: userEmail }
            }
            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // Increase upvote count of a featured product //
        app.patch('/product/feature-upvote/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const userEmail = req.decoded.email;
            const query = { _id: id };
            const product = await featuredCollection.findOne(query);

            if (product.upVotedUsers && product.upVotedUsers.includes(userEmail)) {
                return res.status(400).send({ message: "You have already upvoted the product" })
            }

            const updatedDoc = {
                $inc: { upvotes: 1 },
                $push: { upVotedUsers: userEmail }
            }
            const result = await featuredCollection.updateOne(query, updatedDoc);
            res.send(result);
        });


        // Change status of the product to 'Accepted' //
        app.patch('/product/accept-status/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'Accepted'
                }
            }
            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // Change status of the product to 'Rejected' //
        app.patch('/product/reject-status/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'Rejected'
                }
            }
            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // Update a product if report //
        app.patch('/product/report/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const product = await productsCollection.findOne(query);
            if (!product) {
                return res.status(404).send({ message: "Product not found" })
            }

            const updatedDoc = {
                $set: {
                    reported: true
                }
            }

            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // Get all products added by an email //
        app.get('/products/:email', async (req, res) => {
            const email = req.params.email;
            const query = { "owner.email": email };
            const result = await productsCollection.find(query).toArray();
            res.send(result);
        });

        // Update a product in productsCollection //
        app.put('/product/update/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const productData = req.body;
            const updatedDoc = {
                $set: productData
            }
            const options = { upsert: true }
            const result = await productsCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        })

        // Update a product in featuredCollection //
        app.put('/featured/update/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: id }
            const featuredProductData = req.body;
            const updatedDoc = {
                $set: featuredProductData
            }
            const options = { upsert: true }
            const result = await featuredCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        })

        // Delete a product from productsCollection //
        app.delete('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });

        // Add a product in featuredProducts // 
        app.post('/featured', async (req, res) => {
            const product = req.body;
            const result = await featuredCollection.insertOne(product);
            res.send(result);
        });

        // Get all featured products //
        app.get('/featured', async (req, res) => {
            const result = await featuredCollection
                .find()
                .sort({ featuredAt: -1 })
                .toArray();

            res.send(result);
        });

        // Update a product's featured property to true //
        app.patch('/product/feature-true/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const product = await productsCollection.findOne(query);
            if (!product) {
                return res.status(404).send({ message: "Product not found" })
            }

            const updatedDoc = {
                $set: {
                    featured: true
                }
            }

            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // Delete a product from featured //
        app.delete('/featured/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: id };
            const result = await featuredCollection.deleteOne(query);
            res.send(result);
        })

        // Get trending products by likes from productsCollection //
        app.get('/trending-products', async (req, res) => {
            const query = { status: "Accepted" };
            const result = await productsCollection
                .find(query)
                .sort({ upvotes: -1 })
                .toArray();
            res.send(result);
        });

        // Save or add a review in reviewsCollection //
        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });

        // Get a specific review from reviewsCollection //
        app.get('/review/:id', async (req, res) => {
            const id = req.params.id;
            const query = { productId: id };
            const result = await reviewsCollection.find(query).toArray();
            res.send(result);
        });

        // Get admin stats api //
        app.get('/admin-stats', async (req, res) => {
            const usersCount = await userCollection.countDocuments();
            const productsCount = await productsCollection.countDocuments();
            const reviewsCount = await reviewsCollection.countDocuments();

            res.send({ usersCount, productsCount, reviewsCount });
        });

        // Add a coupon to the couponsCollection //
        app.post('/add-coupon', async (req, res) => {
            const coupon = req.body;
            const result = await couponsCollection.insertOne(coupon);
            res.send(result);
        });

        // Get All coupons from couponsCollection //
        app.get('/coupons', async (req, res) => {
            const result = await couponsCollection.find().toArray();
            res.send(result);
        });

        // Edit a coupon's information //
        app.put('/coupon/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const couponData = req.body;
            const updatedDoc = {
                $set: couponData
            }
            const options = { upsert: true }
            const result = await couponsCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        })

        // Delete a coupon from couponsCollection //
        app.delete('/coupon/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await couponsCollection.deleteOne(query);
            res.send(result);
        });

        //








        // Make Admin API //
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: "Admin",
                }
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // Make Moderator API //
        app.patch('/users/moderator/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: "Moderator",
                }
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        // Create Payment Intent //
        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            const { price } = req.body;
            const finalPrice = price * 100;

            const {client_secret} = await stripe.paymentIntents.create({
                amount: finalPrice,
                currency: 'usd',
                automatic_payment_methods: {
                    enabled: true,
                },
            });
            res.send({clientSecret: client_secret});
        })



        // Create payment intent //
        // app.post('/create-payment-intent', async (req, res) => {
        //     const { totalPrice } = req.body;
        //     const amount = parseInt(totalPrice * 100);

        //     console.log("Amount inside payment intent", amount);

        //     const paymentIntent = await stripe.paymentIntents.create({
        //         amount: amount,
        //         currency: 'usd',
        //         payment_method_types: ['card']
        //     });

        //     res.send({
        //         clientSecret: paymentIntent.client_secret
        //     })
        // });

        // app.post('/payments', async (req, res) => {
        //     const payment = req.body;
        //     const paymentResult = await paymentCollection.insertOne(payment);

        //     // Carefully delete each item from the cart //
        //     console.log("Payment Info", payment);
        //     const query = {
        //         _id: {
        //             $in: payment.cartId.map(id => new ObjectId(id))
        //         }
        //     };
        //     const deleteResult = await cartCollection.deleteMany(query);
        //     res.send({paymentResult, deleteResult});
        // });

        // app.get('/payments/:email', verifyToken, async(req, res) => {
        //     const email = req.params.email;
        //     const query = {email: email};
        //     if(email !== req.decoded.email){
        //         return res.status(403).send({message: 'Forbidden Access!!'})
        //     }
        //     const result = await paymentCollection.find(query).toArray();
        //     res.send(result);
        // });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    }

    finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("Tech Horizon.......")
});

app.listen(port, () => {
    console.log(`Tech Horizon server is running on port ${port}`);
})
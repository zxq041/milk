// ============== 1. IMPORT PAKIETÓW ==============
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

// ============== 2. KONFIGURACJA APLIKACJI ==============
const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ============== 3. MIDDLEWARE ==============
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============== 4. POŁĄCZENIE Z BAZĄ DANYCH MONGODB ==============
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono pomyślnie z bazą danych MongoDB!'))
    .catch(err => {
        console.error('❌ Błąd połączenia z MongoDB:', err);
        process.exit(1);
    });

// ============== 5. SCHEMATY I MODELE DANYCH (MONGOOSE) ==============
const EmployeeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    login: { type: String, required: true, unique: true },
    position: { type: String, required: true },
    workplace: { type: String, required: true },
    hourlyRate: { type: Number, required: true },
}, { timestamps: true });
const Employee = mongoose.model('Employee', EmployeeSchema);

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    pricePerUnit: { type: Number, required: true },
    unit: { type: String, required: true, enum: ['szt', 'Kg', 'L', 'Op'] },
    supplier: { type: String },
    altSupplier: { type: String },
    imageUrl: { type: String, required: true },
    demand: {
        mon: { type: Number, default: 0 }, tue: { type: Number, default: 0 },
        wed: { type: Number, default: 0 }, thu: { type: Number, default: 0 },
        fri: { type: Number, default: 0 }, sat: { type: Number, default: 0 },
        sun: { type: Number, default: 0 },
    },
}, { timestamps: true });
const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
    orderedBy: { type: String, required: true },
    totalPrice: { type: Number, required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        unit: { type: String, required: true },
        priceAtOrder: { type: Number, required: true },
        orderDay: { type: String, required: true }
    }]
}, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema);

// ============== 6. ENDPOINTY API (PEŁNA LOGIKA) ==============
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Trasy dla PRACOWNIKÓW ---
app.post('/api/pracownicy', asyncHandler(async (req, res) => {
    res.status(201).json(await new Employee(req.body).save());
}));
app.get('/api/pracownicy', asyncHandler(async (req, res) => {
    res.status(200).json(await Employee.find().sort({ name: 1 }));
}));

// --- Trasy dla PRODUKTÓW ---
app.post('/api/produkty', upload.single('imageFile'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Zdjęcie produktu jest wymagane.' });
    const imageAsDataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const newProduct = new Product({ ...req.body, imageUrl: imageAsDataUri });
    await newProduct.save();
    res.status(201).json(newProduct);
}));

app.get('/api/produkty', asyncHandler(async (req, res) => {
    res.status(200).json(await Product.find().sort({ name: 1 }));
}));

// TA TRASA BYŁA PUSTA - TERAZ JEST UZUPEŁNIONA
app.get('/api/produkty/kategoria/:categoryName', asyncHandler(async (req, res) => {
    const products = await Product.find({ category: req.params.categoryName });
    res.status(200).json(products);
}));

app.put('/api/produkty/:id', upload.single('imageFile'), asyncHandler(async (req, res) => {
    const updateData = { ...req.body };
    if (req.file) {
        updateData.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedProduct) return res.status(404).json({ message: 'Nie znaleziono produktu.' });
    res.status(200).json(updatedProduct);
}));

app.delete('/api/produkty/:id', asyncHandler(async (req, res) => {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) return res.status(404).json({ message: 'Nie znaleziono produktu.' });
    res.status(204).send();
}));

// --- Trasy dla ZAMÓWIEŃ ---
app.post('/api/zamowienia', asyncHandler(async (req, res) => {
    const newOrder = new Order({ ...req.body, orderedBy: req.body.orderedBy || 'system' });
    await newOrder.save();
    res.status(201).json(newOrder);
}));

app.get('/api/zamowienia', asyncHandler(async (req, res) => {
    res.status(200).json(await Order.find().sort({ createdAt: -1 }));
}));

// ============== 7. SERWOWANIE FRONT-ENDU ==============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/system', (req, res) => res.sendFile(path.join(__dirname, 'web.html')));

// ============== 8. OBSŁUGA BŁĘDÓW ==============
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Coś poszło nie tak na serwerze!' });
});

// ============== 9. URUCHOMIENIE SERWERA ==============
app.listen(PORT, () => console.log(`🚀 Serwer nasłuchuje na porcie ${PORT}`));

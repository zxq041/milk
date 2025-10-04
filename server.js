// ============== 1. IMPORT PAKIETÓW ==============
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

// ============== 2. KONFIGURACJA APLIKACJI ==============
const app = express();
const PORT = process.env.PORT || 3000;

// Konfiguracja Multer do przechowywania plików w pamięci serwera
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ============== 3. MIDDLEWARE ==============
app.use(cors());
app.use(express.json()); // Do parsowania danych JSON
app.use(express.urlencoded({ extended: true })); // Do parsowania danych z formularzy

// ============== 4. POŁĄCZENIE Z BAZĄ DANYCH MONGODB ==============
// Używamy zmiennej środowiskowej z Railway
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono pomyślnie z bazą danych MongoDB!'))
    .catch(err => {
        console.error('❌ Błąd połączenia z MongoDB:', err);
        process.exit(1);
    });

// ============== 5. SCHEMATY I MODELE DANYCH (MONGOOSE) ==============

// --- Model Pracownika ---
const EmployeeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    login: { type: String, required: true, unique: true },
    position: { type: String, required: true },
    workplace: { type: String, required: true },
    hourlyRate: { type: Number, required: true },
}, { timestamps: true });
const Employee = mongoose.model('Employee', EmployeeSchema);

// --- Model Produktu ---
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    pricePerUnit: { type: Number, required: true },
    unit: { type: String, required: true, enum: ['szt', 'Kg', 'L', 'Op'] },
    supplier: { type: String },
    altSupplier: { type: String },
    imageUrl: { type: String, required: true }, // Obrazek jako tekst Base64
    demand: { // Zapotrzebowanie
        mon: { type: Number, default: 0 },
        tue: { type: Number, default: 0 },
        wed: { type: Number, default: 0 },
        thu: { type: Number, default: 0 },
        fri: { type: Number, default: 0 },
        sat: { type: Number, default: 0 },
        sun: { type: Number, default: 0 },
    },
}, { timestamps: true });
const Product = mongoose.model('Product', ProductSchema);

// --- Model Zamówienia ---
const OrderSchema = new mongoose.Schema({
    orderedBy: { type: String, required: true }, // Login użytkownika, który złożył zamówienie
    totalPrice: { type: Number, required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        unit: { type: String, required: true },
        priceAtOrder: { type: Number, required: true },
        orderDay: { type: String, required: true } // Na jaki dzień zamówiono
    }]
}, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema);

// ============== 6. ENDPOINTY API (TRASY) ==============
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Trasy dla PRACOWNIKÓW ---
app.post('/api/pracownicy', asyncHandler(async (req, res) => {
    const newEmployee = new Employee(req.body);
    await newEmployee.save();
    res.status(201).json(newEmployee);
}));
app.get('/api/pracownicy', asyncHandler(async (req, res) => {
    const employees = await Employee.find().sort({ name: 1 });
    res.status(200).json(employees);
}));

// --- Trasy dla PRODUKTÓW ---
app.post('/api/produkty', upload.single('imageFile'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Zdjęcie produktu jest wymagane.' });
    }

    const imageAsDataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const demand = JSON.parse(req.body.demand || '{}');

    const newProduct = new Product({
        ...req.body,
        demand,
        imageUrl: imageAsDataUri
    });
    
    await newProduct.save();
    res.status(201).json(newProduct);
}));

app.get('/api/produkty', asyncHandler(async (req, res) => {
    const products = await Product.find().sort({ name: 1 });
    res.status(200).json(products);
}));

app.put('/api/produkty/:id', upload.single('imageFile'), asyncHandler(async (req, res) => {
    const updateData = { ...req.body };
    
    if (req.body.demand) {
        updateData.demand = JSON.parse(req.body.demand);
    }
    
    if (req.file) {
        updateData.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    
    if (!updatedProduct) {
        return res.status(404).json({ message: 'Nie znaleziono produktu.' });
    }
    res.status(200).json(updatedProduct);
}));

app.delete('/api/produkty/:id', asyncHandler(async (req, res) => {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) {
        return res.status(404).json({ message: 'Nie znaleziono produktu.' });
    }
    res.status(204).send();
}));

// --- Trasy dla ZAMÓWIEŃ ---
app.post('/api/zamowienia', asyncHandler(async (req, res) => {
    const orderedBy = req.body.orderedBy || 'system';
    
    const newOrder = new Order({
        items: req.body.items,
        totalPrice: req.body.totalPrice,
        orderedBy: orderedBy
    });
    
    await newOrder.save();
    res.status(201).json(newOrder);
}));

app.get('/api/zamowienia', asyncHandler(async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.status(200).json(orders);
}));

// ============== 7. SERWOWANIE FRONT-ENDU ==============
// Ta sekcja musi być PO definicjach API, ale PRZED obsługą błędów

// Gdy ktoś wchodzi na główny adres, wyślij mu plik index.html (strona dla klientów)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Gdy ktoś wchodzi na podstronę /system, wyślij mu plik web.html (panel zarządzania)
app.get('/system', (req, res) => {
    res.sendFile(path.join(__dirname, 'web.html'));
});

// ============== 8. OBSŁUGA BŁĘDÓW ==============
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(el => el.message);
        return res.status(400).json({ message: 'Błąd walidacji', errors });
    }
    res.status(500).json({ message: 'Coś poszło nie tak na serwerze!' });
});

// ============== 9. URUCHOMIENIE SERWERA ==============
app.listen(PORT, () => {
    console.log(`🚀 Serwer nasłuchuje na porcie ${PORT}`);
});

// ============== 1. IMPORT PAKIETÓW ==============
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path'); // Ważne, aby poprawnie wskazywać pliki

// ============== 2. INICJALIZACJA APLIKACJI ==============
const app = express();
const PORT = process.env.PORT || 3000;

// ============== 3. MIDDLEWARE ==============
app.use(cors());
app.use(express.json());

// ============== 4. POŁĄCZENIE Z BAZĄ DANYCH MONGODB ==============
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono pomyślnie z bazą danych MongoDB!'))
    .catch(err => {
        console.error('❌ Błąd połączenia z MongoDB:', err);
        process.exit(1);
    });

// ============== 5. SCHEMATY I MODELE DANYCH (MONGOOSE) ==============
// --- Model Produktu ---
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'Nazwa produktu jest wymagana.'] },
    category: { type: String, required: [true, 'Kategoria jest wymagana.'] },
    unit: { type: String, required: true, enum: ['szt', 'Kg', 'L'] },
    pricePerUnit: { type: Number, required: true, default: 0 },
    supplier: { type: String, required: true },
    imageUrl: { type: String, default: 'https://i.imgur.com/EV2m6BO.jpeg' },
    packageSize: { type: Number, default: 1 },
    demand: { type: Object },
    altSupplier: { type: String }
}, { timestamps: true });
const Product = mongoose.model('Product', ProductSchema);

// --- Model Zamówienia ---
const OrderSchema = new mongoose.Schema({
    totalPrice: { type: Number, required: true },
    status: { type: String, default: 'Nowe', enum: ['Nowe', 'W realizacji', 'Zakończone'] },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unit: { type: String, required: true },
        priceAtOrder: { type: Number, required: true }
    }]
}, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema);

// --- Model Pracownika ---
const EmployeeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    login: { type: String, required: true, unique: true },
    position: { type: String, required: true },
    workplace: { type: String, required: true },
    hourlyRate: { type: Number, required: true }
}, { timestamps: true });
const Employee = mongoose.model('Employee', EmployeeSchema);


// ============== 6. ENDPOINTY API (Twoja "kuchnia") ==============
const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// --- Trasy API dla PRODUKTÓW ---
app.get('/api/produkty', asyncHandler(async (req, res) => {
    const produkty = await Product.find().sort({ name: 1 });
    res.status(200).json(produkty);
}));

app.get('/api/produkty/kategoria/:categoryName', asyncHandler(async (req, res) => {
    const produkty = await Product.find({ category: req.params.categoryName });
    res.status(200).json(produkty);
}));

app.post('/api/produkty', asyncHandler(async (req, res) => {
    const produkt = new Product(req.body);
    const newProduct = await produkt.save();
    res.status(201).json(newProduct);
}));

// --- Trasy API dla ZAMÓWIEŃ ---
app.get('/api/zamowienia', asyncHandler(async (req, res) => {
    const zamowienia = await Order.find().sort({ createdAt: -1 });
    res.status(200).json(zamowienia);
}));

app.post('/api/zamowienia', asyncHandler(async (req, res) => {
    const { items, totalPrice } = req.body;
    if (!items || items.length === 0 || !totalPrice) {
        return res.status(400).json({ message: 'Zamówienie musi zawierać produkty i cenę całkowitą.' });
    }
    const zamowienie = new Order({ items, totalPrice });
    const newOrder = await zamowienie.save();
    res.status(201).json(newOrder);
}));

// --- Trasy API dla PRACOWNIKÓW ---
app.get('/api/pracownicy', asyncHandler(async (req, res) => {
    const pracownicy = await Employee.find().sort({ name: 1 });
    res.status(200).json(pracownicy);
}));

app.post('/api/pracownicy', asyncHandler(async (req, res) => {
    const pracownik = new Employee(req.body);
    const newEmployee = await pracownik.save();
    res.status(201).json(newEmployee);
}));

app.put('/api/pracownicy/:id', asyncHandler(async (req, res) => {
    const updatedEmployee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updatedEmployee) {
        return res.status(404).json({ message: 'Nie znaleziono pracownika.' });
    }
    res.status(200).json(updatedEmployee);
}));

// ============== 7. SERWOWANIE FRONT-ENDU (Twój "kelner") ==============
// Ta sekcja musi być PO definicjach API, ale PRZED obsługą błędów i app.listen

// Serwuje pliki JS i CSS, jeśli kiedykolwiek je dodasz do głównego folderu
app.use(express.static(path.join(__dirname)));

// Serwuje główny plik index.html dla każdego zapytania, które nie pasuje do API
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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

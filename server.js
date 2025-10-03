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
// --- Tutaj wklej wszystkie swoje schematy i modele (Product, Order, Employee) ---
// --- Zostawiam je puste dla zwięzłości, ale muszą tu być ---
const ProductSchema = new mongoose.Schema({ name: String, category: String, unit: String, pricePerUnit: Number, supplier: String, imageUrl: String, packageSize: Number, demand: Object, altSupplier: String }, { timestamps: true });
const Product = mongoose.model('Product', ProductSchema);
const OrderSchema = new mongoose.Schema({ totalPrice: Number, status: String, items: Array }, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema);
const EmployeeSchema = new mongoose.Schema({ name: String, login: { type: String, unique: true }, position: String, workplace: String, hourlyRate: Number }, { timestamps: true });
const Employee = mongoose.model('Employee', EmployeeSchema);

// ============== 6. ENDPOINTY API (Twoja "kuchnia") ==============
// --- Tutaj wklej wszystkie swoje trasy API (/api/produkty, /api/zamowienia itd.) ---
// --- Zostawiam je puste dla zwięzłości, ale muszą tu być ---
app.get('/api/produkty', async (req, res) => { /* ... */ });
app.post('/api/produkty', async (req, res) => { /* ... */ });
// ... i tak dalej dla wszystkich tras API

// ============== 7. SERWOWANIE FRONT-ENDU (Logika dla stron) ==============
// Ta sekcja musi być PO definicjach API, ale PRZED obsługą błędów

// Udostępnia wszystkie pliki (np. obrazki, CSS) z głównego folderu
app.use(express.static(path.join(__dirname)));

// Gdy ktoś wchodzi na główny adres, wyślij mu plik index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Gdy ktoś wchodzi na podstronę /system, wyślij mu plik web.html
app.get('/system', (req, res) => {
    res.sendFile(path.join(__dirname, 'web.html'));
});

// ============== 8. OBSŁUGA BŁĘDÓW ==============
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Coś poszło nie tak na serwerze!' });
});

// ============== 9. URUCHOMIENIE SERWERA ==============
app.listen(PORT, () => {
    console.log(`🚀 Serwer nasłuchuje na porcie ${PORT}`);
});

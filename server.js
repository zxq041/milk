// ============== 1. IMPORT PAKIETÓW ==============
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

// ============== 2. KONFIGURACJA APLIKACJI ==============
const app = express();
const PORT = process.env.PORT || 3000;

// Konfiguracja Multer do przechowywania plików w pamięci serwera (do konwersji na Base64)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ============== 3. MIDDLEWARE ==============
app.use(cors());
app.use(express.json()); // Do parsowania danych JSON
app.use(express.urlencoded({ extended: true })); // Do parsowania danych z formularzy

// ============== 4. POŁĄCZENIE Z BAZĄ DANYCH MONGODB ==============
// Używamy zmiennej środowiskowej MONGO_URL, którą dostarcza Railway
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
  imageUrl: { type: String, required: true }, // Obrazek jako tekst Base64 (Data URI)
  demand: {
    mon: { type: Number, default: 0 }, tue: { type: Number, default: 0 },
    wed: { type: Number, default: 0 }, thu: { type: Number, default: 0 },
    fri: { type: Number, default: 0 }, sat: { type: Number, default: 0 },
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

// --- Model Rezerwacji ---
const ReservationSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  reservationDate: { type: Date, required: true },
  numberOfGuests: { type: Number, required: true },
  tableId: { type: String, required: true }, // Np. 'table-1', 'booth-2'
  tableName: { type: String, required: true }, // Np. 'Stolik 1 (2 os.)'
  status: { type: String, required: true, enum: ['Oczekująca', 'Potwierdzona', 'Anulowana'], default: 'Oczekująca' }
}, { timestamps: true });
const Reservation = mongoose.model('Reservation', ReservationSchema);

// === MENU === Model Pozycji Menu (publiczne menu lokalu)
const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  imageUrl: { type: String }, // opcjonalny Data URI (Base64) jak w produktach
  isAvailable: { type: Boolean, default: true }
}, { timestamps: true });
const MenuItem = mongoose.model('MenuItem', MenuItemSchema);

// ============== 6. ENDPOINTY API (TRASY) ==============
// Wrapper do obsługi błędów w funkcjach asynchronicznych
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Trasa do ręcznego tworzenia kont adminów ---
app.get('/api/setup-admins', asyncHandler(async (req, res) => {
  try {
    const defaultUsers = [
      { name: 'Gracjan - Admin', login: 'Admin33201', position: 'Właściciel', workplace: 'Wszystkie', hourlyRate: 100 },
      { name: 'Marcin', login: '0051', position: 'Właściciel', workplace: 'Wszystkie', hourlyRate: 100 }
    ];
    await Employee.deleteMany({ login: { $in: ['Admin33201', '0051'] } });
    await Employee.insertMany(defaultUsers);
    res.status(200).json({ message: 'Konta adminów zostały zresetowane i utworzone na nowo.', created: defaultUsers.length });
  } catch (error) {
    res.status(500).json({ message: 'Błąd podczas resetowania kont adminów.', error: error.message });
  }
}));

// --- Trasa logowania (odporna na wielkość liter) ---
app.post('/api/login', asyncHandler(async (req, res) => {
  const { login } = req.body;
  if (!login) return res.status(400).json({ message: 'Login jest wymagany.' });
  const employee = await Employee.findOne({ login: new RegExp('^' + login + '$', 'i') });
  if (!employee) return res.status(401).json({ message: 'Nieprawidłowy login.' });
  res.status(200).json(employee);
}));

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
  const demand = JSON.parse(req.body.demand || '{}');
  const newProduct = new Product({ ...req.body, demand, imageUrl: imageAsDataUri });
  await newProduct.save();
  res.status(201).json(newProduct);
}));

app.get('/api/produkty', asyncHandler(async (req, res) => {
  res.status(200).json(await Product.find().sort({ name: 1 }));
}));

app.get('/api/produkty/kategoria/:categoryName', asyncHandler(async (req, res) => {
  res.status(200).json(await Product.find({ category: req.params.categoryName }));
}));

app.get('/api/produkty/:id', asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Nie znaleziono produktu.' });
  res.status(200).json(product);
}));

app.put('/api/produkty/:id', upload.single('imageFile'), asyncHandler(async (req, res) => {
  const updateData = { ...req.body };
  if (req.body.demand) updateData.demand = JSON.parse(req.body.demand);
  if (req.file) updateData.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
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

// --- Trasy dla REZERWACJI ---
app.post('/api/rezerwacje', asyncHandler(async (req, res) => {
  const { name, phone, date, time, guests, selected_seat_value, selected_seat_display } = req.body;
  if (!name || !phone || !date || !time || !guests || !selected_seat_value) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane.' });
  }
  const reservationDateTime = new Date(`${date}T${time}`);
  const newReservation = new Reservation({
    customerName: name,
    customerPhone: phone,
    reservationDate: reservationDateTime,
    numberOfGuests: guests,
    tableId: selected_seat_value,
    tableName: selected_seat_display.replace('Wybrano: ', '')
  });
  await newReservation.save();
  res.status(201).json(newReservation);
}));

app.get('/api/rezerwacje', asyncHandler(async (req, res) => {
  res.status(200).json(await Reservation.find().sort({ reservationDate: -1 }));
}));

app.put('/api/rezerwacje/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Oczekująca', 'Potwierdzona', 'Anulowana'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Nieprawidłowy status.' });
  }
  const updatedReservation = await Reservation.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!updatedReservation) return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
  res.status(200).json(updatedReservation);
}));

// === MENU === Trasy dla POZYCJI MENU (CRUD)
app.get('/api/menu', asyncHandler(async (req, res) => {
  // Domyślnie sortuj po kategorii i nazwie, by ułatwić grupowanie w kliencie
  const items = await MenuItem.find().sort({ category: 1, name: 1 });
  res.status(200).json(items);
}));

app.get('/api/menu/:id', asyncHandler(async (req, res) => {
  const item = await MenuItem.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Nie znaleziono pozycji menu.' });
  res.status(200).json(item);
}));

app.post('/api/menu', upload.single('imageFile'), asyncHandler(async (req, res) => {
  // FormData z UI może trzymać: name, category, price, description, isAvailable ('true'/'false'), imageFile (opcjonalnie)
  const { name, category } = req.body;
  let { price, description, isAvailable } = req.body;

  if (!name || !category || (price === undefined || price === null || price === '')) {
    return res.status(400).json({ message: 'Pola name, category i price są wymagane.' });
  }

  // Konwersje typów
  price = Number(price);
  if (Number.isNaN(price)) return res.status(400).json({ message: 'Pole price musi być liczbą.' });
  const isAvailBool = String(isAvailable).toLowerCase() === 'true' || String(isAvailable).toLowerCase() === 'on';

  const doc = {
    name,
    category,
    price,
    description: description || '',
    isAvailable: isAvailBool
  };

  if (req.file) {
    doc.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }

  const created = await new MenuItem(doc).save();
  res.status(201).json(created);
}));

app.put('/api/menu/:id', upload.single('imageFile'), asyncHandler(async (req, res) => {
  const update = {};
  if (typeof req.body.name !== 'undefined') update.name = req.body.name;
  if (typeof req.body.category !== 'undefined') update.category = req.body.category;
  if (typeof req.body.description !== 'undefined') update.description = req.body.description;

  if (typeof req.body.price !== 'undefined') {
    const num = Number(req.body.price);
    if (Number.isNaN(num)) return res.status(400).json({ message: 'Pole price musi być liczbą.' });
    update.price = num;
  }

  if (typeof req.body.isAvailable !== 'undefined') {
    update.isAvailable = (String(req.body.isAvailable).toLowerCase() === 'true' || String(req.body.isAvailable).toLowerCase() === 'on');
  }

  if (req.file) {
    update.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }

  const updated = await MenuItem.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ message: 'Nie znaleziono pozycji menu.' });
  res.status(200).json(updated);
}));

app.delete('/api/menu/:id', asyncHandler(async (req, res) => {
  const deleted = await MenuItem.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Nie znaleziono pozycji menu.' });
  res.status(204).send();
}));

// ============== 7. SERWOWANIE FRONT-ENDU ==============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/system', (req, res) => {
  res.sendFile(path.join(__dirname, 'web.html'));
});

// === PUBLIC MENU PAGE === serwowanie podstrony menu (jeśli trzymasz ją obok index.html)
app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'menu.html'));
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

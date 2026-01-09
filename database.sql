-- Создание базы данных для цветочного магазина
-- Сначала создайте базу данных: CREATE DATABASE flower_shop;

-- Таблица для хранения номенклатуры цветов
CREATE TABLE IF NOT EXISTS flowers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для хранения заказов
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(255) PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    order_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для хранения позиций заказов
CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    flower_id INTEGER NOT NULL REFERENCES flowers(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для хранения текущей даты системы (для симуляции времени)

-- Создать таблицу с правильной структурой
CREATE TABLE system_date (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    date_value DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Вставка начальных данных - номенклатура цветов
INSERT INTO flowers (name, quantity) VALUES
    ('Розы', 50),
    ('Тюльпаны', 30),
    ('Хризантемы', 40),
    ('Герберы', 25),
    ('Лилии', 20),
    ('Пионы', 15),
    ('Орхидеи', 10),
    ('Гвоздики', 35)
ON CONFLICT (name) DO NOTHING;

-- Инициализация системной даты
INSERT INTO system_date (date_value) VALUES (CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_flower_id ON order_items(flower_id);


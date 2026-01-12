# Система управления заказами цветочного магазина

Веб-приложение для управления заказами в цветочном магазине с расчетом стоимости.

## Технологии

- **Клиент**: HTML, CSS, JavaScript
- **Сервер**: Node.js, Express.js  
- **База данных**: PostgreSQL

## Функциональность

- CRUD операции для заказов и позиций
- Расчет и отображение суммарной стоимости заказов
- Валидация даты заказа и проверка наличия цветов
- Перемещение позиций между заказами
- Переключение системной даты с обработкой заказов

## Установка и настройка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка базы данных

1. Установите PostgreSQL
2. Создайте базу данных:

```sql
CREATE DATABASE flower_shop;
```

3. Выполните SQL скрипт:

```bash
psql -U postgres -d flower_shop -f database.sql
```

### 3. Настройка переменных окружения

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Отредактируйте параметры подключения к БД в `.env`.

## Запуск

```bash
npm start
```

Приложение доступно по адресу: `http://localhost:3000`

## Структура проекта

```
.
├── server.js           # Express API сервер
├── database.sql        # SQL скрипт для БД
├── package.json        # Зависимости
├── .env.example        # Пример конфигурации
├── README.md           # Документация
└── public/             # Клиентская часть
    ├── index.html      # Главная страница
    ├── styles.css      # Стили
    └── app.js          # Клиентская логика
```

## API

### Система
- `GET /api/system/date` - Получить текущую дату
- `POST /api/system/date/next` - Следующий день

### Цветы
- `GET /api/flowers` - Список цветов
- `GET /api/flowers/availability` - Доступность на дату

### Заказы
- `GET /api/orders` - Все заказы
- `GET /api/orders/:id` - Заказ по ID
- `POST /api/orders` - Создать заказ
- `PUT /api/orders/:id` - Обновить заказ
- `DELETE /api/orders/:id` - Удалить заказ

### Позиции
- `POST /api/orders/:orderId/items` - Добавить позицию
- `PUT /api/orders/:orderId/items/:itemId` - Обновить позицию
- `DELETE /api/orders/:orderId/items/:itemId` - Удалить позицию
- `POST /api/orders/:targetOrderId/items/:itemId/move` - Переместить позицию

## Структура базы данных

### flowers
- `id` (SERIAL) - ID цветка
- `name` (VARCHAR) - Название
- `quantity` (INTEGER) - Количество
- `price` (DECIMAL) - Цена

### orders  
- `id` (VARCHAR) - ID заказа (UUID)
- `customer_name` (VARCHAR) - ФИО заказчика
- `order_date` (DATE) - Дата заказа
- `created_at` (TIMESTAMP) - Время создания

### order_items
- `id` (VARCHAR) - ID позиции (UUID)
- `order_id` (VARCHAR) - ID заказа
- `flower_id` (INTEGER) - ID цветка
- `quantity` (INTEGER) - Количество

### system_date
- `id` (INTEGER) - ID (всегда 1)
- `date_value` (DATE) - Текущая дата
- `updated_at` (TIMESTAMP) - Время обновления


const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Подключение к базе данных
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'flower_shop',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
});

// Проверка подключения к БД
pool.on('connect', () => {
    console.log('Подключено к базе данных PostgreSQL');
});

pool.on('error', (err) => {
    console.error('Ошибка подключения к БД:', err);
});

// Получить текущую системную дату (возвращает строку YYYY-MM-DD)
async function getCurrentDate() {
    // Используем TO_CHAR для получения даты как строки напрямую из SQL
    const result = await pool.query('SELECT TO_CHAR(date_value, \'YYYY-MM-DD\') as date_str FROM system_date WHERE id = 1');
    if (result.rows[0]?.date_str) {
        return result.rows[0].date_str;
    }
    // Если записи нет, возвращаем текущую дату
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Установить системную дату (принимает строку в формате YYYY-MM-DD)
async function setCurrentDate(date) {
    // Убедимся, что date - это строка в формате YYYY-MM-DD
    if (typeof date !== 'string') {
        throw new Error('Дата должна быть строкой в формате YYYY-MM-DD');
    }
    
    // Проверяем формат строки (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Неверный формат даты. Ожидается YYYY-MM-DD');
    }
    
    // Проверяем, существует ли запись
    const check = await pool.query('SELECT id, date_value FROM system_date WHERE id = 1');
    
    if (check.rows.length === 0) {
        // Если записи нет, создаем её
        await pool.query(
            'INSERT INTO system_date (id, date_value) VALUES (1, $1)',
            [date]
        );
        console.log(`[setCurrentDate] Создана новая запись с датой: ${date}`);
    } else {
        // Если запись есть, обновляем простым UPDATE
        const oldDate = check.rows[0].date_value;
        console.log(`[setCurrentDate] Обновление даты с ${oldDate} на ${date}`);
        
        const result = await pool.query(
            'UPDATE system_date SET date_value = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
            [date]
        );
        
        console.log(`[setCurrentDate] UPDATE выполнен, rowCount: ${result.rowCount}`);
        
        if (result.rowCount === 0) {
            throw new Error('Не удалось обновить системную дату');
        }
        
        // Проверяем, что дата действительно обновилась (используем TO_CHAR для получения строки)
        const verify = await pool.query('SELECT TO_CHAR(date_value, \'YYYY-MM-DD\') as date_str FROM system_date WHERE id = 1');
        const newDateStr = verify.rows[0]?.date_str;
        console.log(`[setCurrentDate] Проверка: дата в БД после UPDATE: ${newDateStr}`);
        
        if (newDateStr !== date) {
            console.error(`[setCurrentDate] ОШИБКА: Дата не обновилась! Ожидалось: ${date}, получено: ${newDateStr}`);
        }
    }
}

// Удалить просроченные заказы при старте
async function deleteExpiredOrders() {
    try {
        const currentDate = await getCurrentDate();
        await pool.query('DELETE FROM orders WHERE order_date < $1', [currentDate]);
        console.log('Просроченные заказы удалены');
    } catch (error) {
        console.warn('Не удалось удалить просроченные заказы (возможно, таблицы еще не созданы):', error.message);
    }
}

// Инициализация при старте
deleteExpiredOrders().catch(err => {
    console.warn('Ошибка при инициализации:', err.message);
});

// ========== API для цветов ==========

// Получить все цветы
app.get('/api/flowers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM flowers ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка получения цветов:', error);
        res.status(500).json({ error: 'Ошибка получения списка цветов' });
    }
});

// ========== API для заказов ==========

// Получить все заказы
app.get('/api/orders', async (req, res) => {
    try {
        const currentDate = await getCurrentDate();
        const result = await pool.query(
            `SELECT o.*, 
             COALESCE(json_agg(
                 json_build_object(
                     'id', oi.id,
                     'flowerId', oi.flower_id,
                     'flowerName', f.name,
                     'quantity', oi.quantity,
                     'order_id', oi.order_id
                 )
             ) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN flowers f ON oi.flower_id = f.id
             WHERE o.order_date >= $1
             GROUP BY o.id
             ORDER BY o.order_date, o.created_at`,
            [currentDate]
        );
        
        // Преобразуем items из строки в массив, если необходимо
        const orders = result.rows.map(order => ({
            ...order,
            items: typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || [])
        }));
        
        res.json(orders);
    } catch (error) {
        console.error('Ошибка получения заказов:', error);
        res.status(500).json({ error: 'Ошибка получения списка заказов' });
    }
});

// Получить один заказ
app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        const itemsResult = await pool.query(
            `SELECT oi.*, f.name as flower_name
             FROM order_items oi
             JOIN flowers f ON oi.flower_id = f.id
             WHERE oi.order_id = $1`,
            [id]
        );

        res.json({
            ...orderResult.rows[0],
            items: itemsResult.rows
        });
    } catch (error) {
        console.error('Ошибка получения заказа:', error);
        res.status(500).json({ error: 'Ошибка получения заказа' });
    }
});

// Создать новый заказ
app.post('/api/orders', async (req, res) => {
    try {
        const { customerName, orderDate } = req.body;
        const currentDate = await getCurrentDate();

        if (!customerName || !orderDate) {
            return res.status(400).json({ error: 'Необходимо указать ФИО заказчика и дату заказа' });
        }

        if (orderDate < currentDate) {
            return res.status(400).json({ error: 'Дата заказа не может быть меньше текущей даты' });
        }

        const orderId = uuidv4();
        await pool.query(
            'INSERT INTO orders (id, customer_name, order_date) VALUES ($1, $2, $3)',
            [orderId, customerName, orderDate]
        );

        res.status(201).json({ id: orderId, customerName, orderDate, items: [] });
    } catch (error) {
        console.error('Ошибка создания заказа:', error);
        res.status(500).json({ error: 'Ошибка создания заказа' });
    }
});

// Обновить заказ
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { customerName, orderDate } = req.body;
        const currentDate = await getCurrentDate();

        if (!customerName || !orderDate) {
            return res.status(400).json({ error: 'Необходимо указать ФИО заказчика и дату заказа' });
        }

        if (orderDate < currentDate) {
            return res.status(400).json({ error: 'Дата заказа не может быть меньше текущей даты' });
        }

        const result = await pool.query(
            'UPDATE orders SET customer_name = $1, order_date = $2 WHERE id = $3',
            [customerName, orderDate, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        res.json({ id, customerName, orderDate });
    } catch (error) {
        console.error('Ошибка обновления заказа:', error);
        res.status(500).json({ error: 'Ошибка обновления заказа' });
    }
});

// Удалить заказ
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM orders WHERE id = $1', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        res.json({ message: 'Заказ удален' });
    } catch (error) {
        console.error('Ошибка удаления заказа:', error);
        res.status(500).json({ error: 'Ошибка удаления заказа' });
    }
});

// ========== API для позиций заказов ==========

// Добавить позицию в заказ
app.post('/api/orders/:orderId/items', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { flowerId, quantity } = req.body;

        if (!flowerId || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Необходимо указать вид цветка и количество' });
        }

        // Проверка существования заказа
        const orderCheck = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        // Проверка наличия цветов
        const flowerResult = await pool.query('SELECT * FROM flowers WHERE id = $1', [flowerId]);
        if (flowerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Цветок не найден' });
        }

        const availableQuantity = flowerResult.rows[0].quantity;

        // Подсчет уже заказанных цветов этого вида в этом заказе
        const existingItems = await pool.query(
            'SELECT SUM(quantity) as total FROM order_items WHERE order_id = $1 AND flower_id = $2',
            [orderId, flowerId]
        );
        const alreadyOrdered = parseInt(existingItems.rows[0]?.total || 0);

        // Проверка доступности
        if (availableQuantity < alreadyOrdered + quantity) {
            return res.status(400).json({ 
                error: `Недостаточно цветов. Доступно: ${availableQuantity - alreadyOrdered}, требуется: ${quantity}` 
            });
        }

        const itemId = uuidv4();
        await pool.query(
            'INSERT INTO order_items (id, order_id, flower_id, quantity) VALUES ($1, $2, $3, $4)',
            [itemId, orderId, flowerId, quantity]
        );

        const itemResult = await pool.query(
            `SELECT oi.*, f.name as flower_name
             FROM order_items oi
             JOIN flowers f ON oi.flower_id = f.id
             WHERE oi.id = $1`,
            [itemId]
        );

        res.status(201).json(itemResult.rows[0]);
    } catch (error) {
        console.error('Ошибка добавления позиции:', error);
        res.status(500).json({ error: 'Ошибка добавления позиции' });
    }
});

// Обновить позицию заказа
app.put('/api/orders/:orderId/items/:itemId', async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { flowerId, quantity } = req.body;

        if (!flowerId || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Необходимо указать вид цветка и количество' });
        }

        // Получить текущую позицию
        const currentItem = await pool.query(
            'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
            [itemId, orderId]
        );

        if (currentItem.rows.length === 0) {
            return res.status(404).json({ error: 'Позиция не найдена' });
        }

        const oldFlowerId = currentItem.rows[0].flower_id;
        const oldQuantity = currentItem.rows[0].quantity;

        // Проверка наличия цветов
        const flowerResult = await pool.query('SELECT * FROM flowers WHERE id = $1', [flowerId]);
        if (flowerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Цветок не найден' });
        }

        const availableQuantity = flowerResult.rows[0].quantity;

        // Подсчет уже заказанных цветов этого вида в этом заказе (исключая текущую позицию)
        const existingItems = await pool.query(
            'SELECT SUM(quantity) as total FROM order_items WHERE order_id = $1 AND flower_id = $2 AND id != $3',
            [orderId, flowerId, itemId]
        );
        const alreadyOrdered = parseInt(existingItems.rows[0]?.total || 0);

        // Проверка доступности
        // Если цветок не изменился, oldQuantity уже не учитывается в alreadyOrdered, 
        // поэтому нужно проверить: availableQuantity >= alreadyOrdered + quantity
        // Если цветок изменился, нужно проверить: availableQuantity >= alreadyOrdered + quantity
        const requiredQuantity = quantity;
        const availableForOrder = availableQuantity - alreadyOrdered;
        
        if (availableForOrder < requiredQuantity) {
            return res.status(400).json({ 
                error: `Недостаточно цветов. Доступно: ${availableForOrder}, требуется: ${requiredQuantity}` 
            });
        }

        await pool.query(
            'UPDATE order_items SET flower_id = $1, quantity = $2 WHERE id = $3',
            [flowerId, quantity, itemId]
        );

        const itemResult = await pool.query(
            `SELECT oi.*, f.name as flower_name
             FROM order_items oi
             JOIN flowers f ON oi.flower_id = f.id
             WHERE oi.id = $1`,
            [itemId]
        );

        res.json(itemResult.rows[0]);
    } catch (error) {
        console.error('Ошибка обновления позиции:', error);
        res.status(500).json({ error: 'Ошибка обновления позиции' });
    }
});

// Удалить позицию из заказа
app.delete('/api/orders/:orderId/items/:itemId', async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const result = await pool.query(
            'DELETE FROM order_items WHERE id = $1 AND order_id = $2',
            [itemId, orderId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Позиция не найдена' });
        }

        res.json({ message: 'Позиция удалена' });
    } catch (error) {
        console.error('Ошибка удаления позиции:', error);
        res.status(500).json({ error: 'Ошибка удаления позиции' });
    }
});

// Переместить позицию между заказами
app.post('/api/orders/:targetOrderId/items/:itemId/move', async (req, res) => {
    try {
        const { targetOrderId, itemId } = req.params;

        // Получить текущую позицию
        const currentItem = await pool.query('SELECT * FROM order_items WHERE id = $1', [itemId]);
        if (currentItem.rows.length === 0) {
            return res.status(404).json({ error: 'Позиция не найдена' });
        }

        const { order_id: sourceOrderId, flower_id: flowerId, quantity } = currentItem.rows[0];

        // Проверка существования целевого заказа
        const targetOrderCheck = await pool.query('SELECT * FROM orders WHERE id = $1', [targetOrderId]);
        if (targetOrderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Целевой заказ не найден' });
        }

        // Проверка наличия цветов
        const flowerResult = await pool.query('SELECT * FROM flowers WHERE id = $1', [flowerId]);
        const availableQuantity = flowerResult.rows[0].quantity;

        // Подсчет уже заказанных цветов в целевом заказе
        const existingItems = await pool.query(
            'SELECT SUM(quantity) as total FROM order_items WHERE order_id = $1 AND flower_id = $2',
            [targetOrderId, flowerId]
        );
        const alreadyOrdered = parseInt(existingItems.rows[0]?.total || 0);

        // Проверка доступности (учитываем, что текущая позиция еще в старом заказе)
        if (availableQuantity < alreadyOrdered + quantity) {
            return res.status(400).json({ 
                error: `Недостаточно цветов для перемещения. Доступно: ${availableQuantity - alreadyOrdered}, требуется: ${quantity}` 
            });
        }

        // Переместить позицию
        await pool.query(
            'UPDATE order_items SET order_id = $1 WHERE id = $2',
            [targetOrderId, itemId]
        );

        const itemResult = await pool.query(
            `SELECT oi.*, f.name as flower_name
             FROM order_items oi
             JOIN flowers f ON oi.flower_id = f.id
             WHERE oi.id = $1`,
            [itemId]
        );

        res.json(itemResult.rows[0]);
    } catch (error) {
        console.error('Ошибка перемещения позиции:', error);
        res.status(500).json({ error: 'Ошибка перемещения позиции' });
    }
});

// ========== API для системной даты ==========

// Получить текущую дату
app.get('/api/system/date', async (req, res) => {
    try {
        const currentDate = await getCurrentDate(); // Уже строка YYYY-MM-DD
        res.json({ currentDate });
    } catch (error) {
        console.error('Ошибка получения даты:', error);
        res.status(500).json({ error: 'Ошибка получения даты' });
    }
});

// Переключить дату на день вперед
app.post('/api/system/date/next', async (req, res) => {
    try {
        const currentDate = await getCurrentDate(); // Строка YYYY-MM-DD
        
        // Вычисляем следующую дату как строку
        const [year, month, day] = currentDate.split('-').map(Number);
        const currentDateObj = new Date(year, month - 1, day);
        currentDateObj.setDate(currentDateObj.getDate() + 1);
        
        // Форматируем в строку YYYY-MM-DD с ведущими нулями
        const nextYear = currentDateObj.getFullYear();
        const nextMonth = String(currentDateObj.getMonth() + 1).padStart(2, '0');
        const nextDay = String(currentDateObj.getDate()).padStart(2, '0');
        const nextDateStr = `${nextYear}-${nextMonth}-${nextDay}`;

        // Удалить заказы на текущий день
        await pool.query('DELETE FROM orders WHERE order_date = $1', [currentDate]);

        // Увеличить остатки цветов случайными величинами (от 5 до 30)
        const flowers = await pool.query('SELECT id FROM flowers');
        for (const flower of flowers.rows) {
            const randomIncrease = Math.floor(Math.random() * 26) + 5; // 5-30
            await pool.query(
                'UPDATE flowers SET quantity = quantity + $1 WHERE id = $2',
                [randomIncrease, flower.id]
            );
        }

        // Установить новую дату
        console.log(`[nextDay] Устанавливаем дату: ${nextDateStr}`);
        await setCurrentDate(nextDateStr);
        
        // Получить обновленную дату для подтверждения
        const verifyDate = await getCurrentDate();
        console.log(`[nextDay] Проверка после обновления: ${verifyDate}`);
        
        res.json({ 
            previousDate: currentDate,
            currentDate: verifyDate,
            message: `Дата переключена с ${currentDate} на ${verifyDate}, заказы на предыдущий день отгружены, остатки цветов увеличены`
        });
    } catch (error) {
        console.error('Ошибка переключения даты:', error);
        res.status(500).json({ error: 'Ошибка переключения даты: ' + error.message });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в браузере`);
});


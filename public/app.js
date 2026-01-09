const API_BASE = 'http://localhost:3000/api';

let currentDate = '';
let flowers = [];
let orders = [];

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    setupEventListeners();
});

// Загрузка начальных данных
async function loadInitialData() {
    try {
        await Promise.all([
            loadCurrentDate(),
            loadFlowers(),
            loadOrders()
        ]);
    } catch (error) {
        showNotification('Ошибка загрузки данных', 'error');
        console.error('Ошибка загрузки данных:', error);
    }
}

// Загрузка текущей даты
async function loadCurrentDate() {
    try {
        const response = await fetch(`${API_BASE}/system/date`);
        const data = await response.json();
        currentDate = data.currentDate;
        console.log('Загружена текущая дата:', currentDate);
        document.getElementById('currentDate').textContent = formatDate(currentDate);
        return currentDate;
    } catch (error) {
        console.error('Ошибка загрузки даты:', error);
        throw error;
    }
}

// Загрузка списка цветов
async function loadFlowers() {
    try {
        const response = await fetch(`${API_BASE}/flowers`);
        flowers = await response.json();
        return flowers;
    } catch (error) {
        console.error('Ошибка загрузки цветов:', error);
        throw error;
    }
}

// Загрузка списка заказов
async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/orders`);
        orders = await response.json();
        renderOrders();
        return orders;
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
        throw error;
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопка добавления заказа
    document.getElementById('addOrderBtn').addEventListener('click', () => {
        openOrderModal();
    });

    // Кнопка следующего дня
    document.getElementById('nextDayBtn').addEventListener('click', async () => {
        await nextDay();
    });

    // Закрытие модальных окон
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.classList.remove('show');
            }
        });
    });

    // Закрытие модальных окон при клике вне их
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
        }
    });

    // Форма заказа
    document.getElementById('orderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveOrder();
    });

    // Форма позиции
    document.getElementById('itemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveItem();
    });

    // Форма перемещения позиции
    document.getElementById('moveItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await moveItem();
    });
}

// Отображение заказов
function renderOrders() {
    const ordersList = document.getElementById('ordersList');
    
    if (orders.length === 0) {
        ordersList.innerHTML = '<div class="empty-state"><p>Нет заказов</p></div>';
        return;
    }

    ordersList.innerHTML = orders.map(order => `
        <div class="order-card" data-order-id="${order.id}">
            <div class="order-header">
                <div class="order-info">
                    <h3>${escapeHtml(order.customer_name)}</h3>
                    <div class="order-details">
                        <div>Дата заказа: <strong>${formatDate(order.order_date)}</strong></div>
                        <div class="order-id">ID: ${order.id}</div>
                    </div>
                </div>
                <div class="order-actions">
                    <button class="btn btn-warning btn-sm" onclick="editOrder('${order.id}')">Редактировать</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteOrder('${order.id}')">Удалить</button>
                </div>
            </div>
            <div class="items-section">
                <div class="items-header">
                    <h4>Позиции заказа</h4>
                    <button class="btn btn-success btn-sm" onclick="openItemModal('${order.id}')">+ Добавить позицию</button>
                </div>
                <div class="items-list" id="items-${order.id}">
                    ${renderItems(order.items || [], order.id)}
                </div>
            </div>
        </div>
    `).join('');
}

// Отображение позиций заказа
function renderItems(items, orderId = '') {
    if (!items || items.length === 0) {
        return '<div class="empty-state"><p style="font-size: 0.9em;">Нет позиций в заказе</p></div>';
    }

    return items.map(item => {
        const itemOrderId = item.order_id || orderId;
        return `
        <div class="item-card" data-item-id="${item.id}">
            <div class="item-info">
                <div class="item-name">${escapeHtml(item.flowerName || item.flower_name || 'Неизвестный цветок')}</div>
                <div class="item-details">Количество: <strong>${item.quantity}</strong></div>
                <div class="item-id">ID: ${item.id}</div>
            </div>
            <div class="item-actions">
                <button class="btn btn-warning btn-sm" onclick="editItem('${item.id}', '${itemOrderId}')">Редактировать</button>
                <button class="btn btn-primary btn-sm" onclick="openMoveItemModal('${item.id}')">Переместить</button>
                <button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}', '${itemOrderId}')">Удалить</button>
            </div>
        </div>
        `;
    }).join('');
}

// Открытие модального окна заказа
function openOrderModal(order = null) {
    const modal = document.getElementById('orderModal');
    const form = document.getElementById('orderForm');
    const title = document.getElementById('modalTitle');
    
    if (order) {
        title.textContent = 'Редактировать заказ';
        document.getElementById('orderId').value = order.id;
        document.getElementById('customerName').value = order.customer_name;
        document.getElementById('orderDate').value = order.order_date;
    } else {
        title.textContent = 'Новый заказ';
        form.reset();
        document.getElementById('orderId').value = '';
        document.getElementById('orderDate').value = currentDate;
        document.getElementById('orderDate').min = currentDate;
    }
    
    modal.classList.add('show');
}

// Закрытие модального окна заказа
function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('show');
}

// Сохранение заказа
async function saveOrder() {
    const form = document.getElementById('orderForm');
    const orderId = document.getElementById('orderId').value;
    const customerName = document.getElementById('customerName').value.trim();
    const orderDate = document.getElementById('orderDate').value;

    if (!customerName) {
        showNotification('Введите ФИО заказчика', 'error');
        return;
    }

    try {
        const url = orderId 
            ? `${API_BASE}/orders/${orderId}`
            : `${API_BASE}/orders`;
        
        const method = orderId ? 'PUT' : 'POST';
        
        const requestData = {
            customerName,
            orderDate
        };
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка сохранения заказа', 'error');
            return;
        }

        closeOrderModal();
        await loadOrders();
        showNotification('Заказ сохранен', 'success');
    } catch (error) {
        console.error('Ошибка сохранения заказа:', error);
        showNotification('Ошибка сохранения заказа', 'error');
    }
}

// Редактирование заказа
async function editOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (order) {
        openOrderModal(order);
    }
}

// Удаление заказа
async function deleteOrder(orderId) {
    if (!confirm('Вы уверены, что хотите удалить этот заказ?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка удаления заказа', 'error');
            return;
        }

        await loadOrders();
        showNotification('Заказ удален', 'success');
    } catch (error) {
        console.error('Ошибка удаления заказа:', error);
        showNotification('Ошибка удаления заказа', 'error');
    }
}

// Открытие модального окна позиции
async function openItemModal(orderId, item = null) {
    const modal = document.getElementById('itemModal');
    const form = document.getElementById('itemForm');
    const title = document.getElementById('itemModalTitle');
    const flowerSelect = document.getElementById('flowerSelect');
    
    // Обновляем данные о заказах перед открытием модального окна, чтобы иметь актуальную информацию
    await loadOrders();
    
    // Находим заказ для получения даты
    const order = orders.find(o => o.id === orderId);
    if (!order) {
        showNotification('Заказ не найден', 'error');
        return;
    }
    
    console.log('[openItemModal] Заказ:', order.id, 'Дата:', order.order_date, 'Позиций:', order.items?.length || 0);
    
    // Загружаем информацию о доступности цветов для этой даты
    flowerSelect.innerHTML = '<option value="">Загрузка...</option>';
    
    try {
        // Нормализуем дату заказа в формат YYYY-MM-DD
        let orderDateStr = order.order_date;
        if (orderDateStr instanceof Date) {
            orderDateStr = orderDateStr.toISOString().split('T')[0];
        } else if (typeof orderDateStr === 'string') {
            // Если дата в формате с временем, берем только дату
            orderDateStr = orderDateStr.split('T')[0];
        }
        
        // Всегда исключаем текущий заказ из подсчета при добавлении новой позиции
        // При редактировании тоже исключаем, чтобы показать доступность без учета текущего заказа
        const url = `${API_BASE}/flowers/availability?orderDate=${orderDateStr}&excludeOrderId=${orderId}`;
        
        console.log('[openItemModal] Запрос доступности:', url, 'orderDateStr:', orderDateStr, 'order.order_date исходное:', order.order_date);
        const availabilityResponse = await fetch(url);
        const availability = await availabilityResponse.json();
        console.log('[openItemModal] Получена доступность:', availability);
        
        // Находим герберы в доступности для отладки
        const gerbera = availability.find(f => f.name === 'Герберы' || f.name.toLowerCase().includes('гербер'));
        if (gerbera) {
            console.log('[openItemModal] Герберы - на складе:', gerbera.quantity, 'зарезервировано:', gerbera.reserved, 'доступно:', gerbera.available);
        }
        
        // Получаем список цветов, которые уже есть в текущем заказе (для запрета дубликатов и подсчета резерва)
        const existingFlowerIds = new Set();
        const existingFlowerQuantities = new Map(); // flowerId -> quantity
        if (order.items && order.items.length > 0) {
            order.items.forEach(orderItem => {
                // При редактировании исключаем текущую позицию
                if (!item || orderItem.id !== item.id) {
                    const flowerId = orderItem.flowerId || orderItem.flower_id;
                    existingFlowerIds.add(flowerId);
                    // Суммируем количество, если цветок уже есть в заказе
                    const currentQty = existingFlowerQuantities.get(flowerId) || 0;
                    existingFlowerQuantities.set(flowerId, currentQty + (orderItem.quantity || 0));
                }
            });
        }
        
        // Заполнение списка цветов с информацией о доступности
        flowerSelect.innerHTML = '<option value="">Выберите цветок</option>';
        availability.forEach(flower => {
            const option = document.createElement('option');
            option.value = flower.id;
            
            const alreadyInOrder = existingFlowerIds.has(flower.id);
            const alreadyOrderedQty = existingFlowerQuantities.get(flower.id) || 0;
            
            // Доступность уже рассчитана без учета текущего заказа (excludeOrderId)
            // Но нужно вычесть позиции, которые уже есть в текущем заказе
            let displayAvailable = flower.available;
            
            if (item && item.flower_id === flower.id) {
                // Если редактируем этот же цветок, добавляем текущее количество к доступному
                displayAvailable = flower.available + item.quantity;
            } else if (alreadyInOrder) {
                // Если цветок уже есть в заказе, вычитаем его количество из доступного
                displayAvailable = flower.available - alreadyOrderedQty;
            }
            
            option.textContent = `${flower.name} (на складе: ${flower.quantity}, доступно: ${displayAvailable})`;
            
            // Блокируем, если цветок уже есть в заказе (кроме редактирования текущей позиции)
            if (alreadyInOrder && (!item || item.flower_id !== flower.id)) {
                option.disabled = true;
                option.textContent += ' (уже в заказе)';
            }
            
            // Блокируем, если нет в наличии (только при создании)
            if (displayAvailable <= 0 && !item && !alreadyInOrder) {
                option.disabled = true;
            }
            
            flowerSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка загрузки доступности:', error);
        // Fallback на старый способ
        flowerSelect.innerHTML = '<option value="">Выберите цветок</option>';
        flowers.forEach(flower => {
            const option = document.createElement('option');
            option.value = flower.id;
            option.textContent = `${flower.name} (доступно: ${flower.quantity})`;
            if (flower.quantity <= 0) {
                option.disabled = true;
            }
            flowerSelect.appendChild(option);
        });
    }

    if (item) {
        title.textContent = 'Редактировать позицию';
        document.getElementById('itemId').value = item.id;
        document.getElementById('itemOrderId').value = orderId;
        flowerSelect.value = item.flower_id || item.flowerId;
        document.getElementById('itemQuantity').value = item.quantity;
    } else {
        title.textContent = 'Новая позиция';
        form.reset();
        document.getElementById('itemId').value = '';
        document.getElementById('itemOrderId').value = orderId;
    }
    
    modal.classList.add('show');
}

// Закрытие модального окна позиции
function closeItemModal() {
    document.getElementById('itemModal').classList.remove('show');
}

// Сохранение позиции
async function saveItem() {
    const form = document.getElementById('itemForm');
    const itemId = document.getElementById('itemId').value;
    const orderId = document.getElementById('itemOrderId').value;
    const flowerId = parseInt(document.getElementById('flowerSelect').value);
    const quantity = parseInt(document.getElementById('itemQuantity').value);

    if (!flowerId || !quantity || quantity <= 0) {
        showNotification('Заполните все поля корректно', 'error');
        return;
    }

    try {
        const url = itemId
            ? `${API_BASE}/orders/${orderId}/items/${itemId}`
            : `${API_BASE}/orders/${orderId}/items`;
        
        const method = itemId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                flowerId,
                quantity
            })
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка сохранения позиции', 'error');
            return;
        }

        closeItemModal();
        await loadOrders();
        showNotification('Позиция сохранена', 'success');
    } catch (error) {
        console.error('Ошибка сохранения позиции:', error);
        showNotification('Ошибка сохранения позиции', 'error');
    }
}

// Редактирование позиции
async function editItem(itemId, orderId) {
    const order = orders.find(o => o.id === orderId);
    if (order && order.items) {
        const item = order.items.find(i => i.id === itemId);
        if (item) {
            // Получаем полную информацию о позиции
            try {
                const response = await fetch(`${API_BASE}/orders/${orderId}`);
                const fullOrder = await response.json();
                const fullItem = fullOrder.items.find(i => i.id === itemId);
                if (fullItem) {
                    openItemModal(orderId, fullItem);
                }
            } catch (error) {
                console.error('Ошибка загрузки позиции:', error);
                showNotification('Ошибка загрузки позиции', 'error');
            }
        }
    }
}

// Удаление позиции
async function deleteItem(itemId, orderId) {
    if (!confirm('Вы уверены, что хотите удалить эту позицию?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/items/${itemId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка удаления позиции', 'error');
            return;
        }

        await loadOrders();
        showNotification('Позиция удалена', 'success');
    } catch (error) {
        console.error('Ошибка удаления позиции:', error);
        showNotification('Ошибка удаления позиции', 'error');
    }
}

// Открытие модального окна перемещения позиции
async function openMoveItemModal(itemId) {
    const modal = document.getElementById('moveItemModal');
    const targetOrderSelect = document.getElementById('targetOrderSelect');
    
    // Заполнение списка заказов (исключая текущий заказ позиции)
    targetOrderSelect.innerHTML = '<option value="">Выберите заказ</option>';
    
    // Находим текущий заказ позиции
    let currentOrderId = '';
    for (const order of orders) {
        if (order.items && order.items.some(item => {
            if (item.id === itemId) {
                // Используем order_id из позиции, если доступен
                currentOrderId = item.order_id || order.id;
                return true;
            }
            return false;
        })) {
            break;
        }
    }
    
    orders.forEach(order => {
        if (order.id !== currentOrderId) {
            const option = document.createElement('option');
            option.value = order.id;
            option.textContent = `${order.customer_name} (${formatDate(order.order_date)})`;
            targetOrderSelect.appendChild(option);
        }
    });

    if (targetOrderSelect.options.length === 1) {
        showNotification('Нет других заказов для перемещения', 'warning');
        return;
    }

    document.getElementById('moveItemId').value = itemId;
    modal.classList.add('show');
}

// Закрытие модального окна перемещения
function closeMoveItemModal() {
    document.getElementById('moveItemModal').classList.remove('show');
}

// Перемещение позиции
async function moveItem() {
    const itemId = document.getElementById('moveItemId').value;
    const targetOrderId = document.getElementById('targetOrderSelect').value;

    if (!targetOrderId) {
        showNotification('Выберите целевой заказ', 'error');
        return;
    }

    try {
        // Находим текущий заказ позиции
        let sourceOrderId = '';
        for (const order of orders) {
            if (order.items && order.items.some(item => {
                if (item.id === itemId) {
                    // Используем order_id из позиции, если доступен
                    sourceOrderId = item.order_id || order.id;
                    return true;
                }
                return false;
            })) {
                break;
            }
        }

        if (!sourceOrderId) {
            showNotification('Не удалось найти исходный заказ', 'error');
            return;
        }

        const response = await fetch(`${API_BASE}/orders/${targetOrderId}/items/${itemId}/move`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка перемещения позиции', 'error');
            return;
        }

        closeMoveItemModal();
        await loadOrders();
        showNotification('Позиция перемещена', 'success');
    } catch (error) {
        console.error('Ошибка перемещения позиции:', error);
        showNotification('Ошибка перемещения позиции', 'error');
    }
}

// Переключение на следующий день
async function nextDay() {
    if (!confirm('Переключить дату на следующий день? Все заказы на текущий день будут отгружены и удалены, остатки цветов увеличатся.')) {
        return;
    }

    try {
        console.log('Текущая дата перед переключением:', currentDate);
        
        const response = await fetch(`${API_BASE}/system/date/next`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка переключения даты', 'error');
            return;
        }

        const data = await response.json();
        console.log('Ответ сервера:', data);
        
        // Сначала обновляем дату, затем остальное
        await loadCurrentDate();
        console.log('Дата после загрузки:', currentDate);
        
        // Небольшая задержка для гарантии обновления БД
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await Promise.all([
            loadFlowers(),
            loadOrders()
        ]);
        
        showNotification(data.message || `Дата переключена с ${data.previousDate} на ${data.currentDate}`, 'success');
    } catch (error) {
        console.error('Ошибка переключения даты:', error);
        showNotification('Ошибка переключения даты: ' + error.message, 'error');
    }
}

// Показ уведомления
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Форматирование даты
function formatDate(dateString) {    
    // Разбираем строку даты YYYY-MM-DD
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
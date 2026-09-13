// Shared customer lookup (remote tonycomm DB)
const { remotePool } = require('../db');
const { phoneFormats } = require('../sms');

async function findCustomerByPhone(phone) {
  const formats = phoneFormats(phone);
  const placeholders = formats.map(() => '?').join(',');

  const [customers] = await remotePool.query(
    `SELECT c.id, c.name, c.phone_number, c.user_id
     FROM customers c
     WHERE c.phone_number IN (${placeholders})
     AND c.deleted_at IS NULL
     LIMIT 1`,
    formats
  );

  if (customers.length === 0) return null;

  const customer = customers[0];

  if (customer.user_id) {
    const [users] = await remotePool.query(
      `SELECT id, phone, password FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [customer.user_id]
    );
    if (users.length > 0) {
      customer.user = users[0];
    }
  }

  const [services] = await remotePool.query(
    `SELECT s.id, s.mikrotik_name, s.mikrotik_password, s.status, s.price,
            p.title as plan_name
     FROM services s
     LEFT JOIN plans p ON s.plan_id = p.id
     WHERE s.customer_id = ? AND s.deleted_at IS NULL
     ORDER BY s.id DESC
     LIMIT 1`,
    [customer.id]
  );
  if (services.length > 0) {
    customer.service = services[0];
  }

  return customer;
}

module.exports = { findCustomerByPhone };

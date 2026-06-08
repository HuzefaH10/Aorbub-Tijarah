/**
 * Data Validators — Validates and sanitizes data before Firestore writes.
 * Each returns { valid: boolean, errors: string[], sanitizedData: object }
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

function sanitizeString(val) {
  if (val === undefined || val === null) return '';
  return stripHtml(String(val));
}

function clampNumber(val, min = 0, max = Infinity) {
  const n = parseFloat(val);
  if (isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(d) {
  if (!d) return false;
  if (d instanceof Date) return !isNaN(d.getTime());
  const date = new Date(d);
  return !isNaN(date.getTime());
}

// ── Validators ───────────────────────────────────────────────────────────────

export function validateProduct(data) {
  const errors = [];
  const sanitized = { ...data };

  // Required fields
  sanitized.name = sanitizeString(data.name);
  if (!sanitized.name) errors.push('Product name is required.');

  sanitized.currentStock = clampNumber(data.currentStock, 0);
  sanitized.sellingPrice = clampNumber(data.sellingPrice, 0);
  if (sanitized.sellingPrice <= 0 && data.sellingPrice !== undefined) {
    errors.push('Selling price must be greater than 0.');
  }

  // Optional
  if (data.costPrice !== undefined) sanitized.costPrice = clampNumber(data.costPrice, 0);
  if (data.lowStockThreshold !== undefined) sanitized.lowStockThreshold = clampNumber(data.lowStockThreshold, 0);
  if (data.expiryDate !== undefined) sanitized.expiryDate = data.expiryDate;
  if (data.category !== undefined) sanitized.category = sanitizeString(data.category);
  if (data.unit !== undefined) sanitized.unit = sanitizeString(data.unit);

  return { valid: errors.length === 0, errors, sanitizedData: sanitized };
}

export function validateSale(data) {
  const errors = [];
  const sanitized = { ...data };

  // Required: items array
  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.push('At least one item is required.');
  } else {
    sanitized.items = data.items.map((item, i) => {
      const s = { ...item };
      s.productName = sanitizeString(item.productName || item.name);
      s.name = s.productName;
      s.productId = sanitizeString(item.productId || item.id);
      s.quantity = clampNumber(item.quantity || item.qty, 0);
      s.qty = s.quantity;
      s.unitPrice = clampNumber(item.unitPrice || item.price, 0);
      s.price = s.unitPrice;
      s.total = clampNumber(item.total, 0);
      if (s.quantity <= 0) errors.push(`Item ${i + 1}: quantity must be > 0.`);
      if (s.unitPrice <= 0) errors.push(`Item ${i + 1}: unit price must be > 0.`);
      return s;
    });
  }

  // Required: totalAmount
  sanitized.totalAmount = clampNumber(data.totalAmount || data.netTotal || data.subtotal, 0);
  sanitized.netTotal = sanitized.totalAmount;

  // Required: paymentMethod
  sanitized.paymentMethod = sanitizeString(data.paymentMethod);
  if (!sanitized.paymentMethod) errors.push('Payment method is required.');

  // Optional
  if (data.discount !== undefined) sanitized.discount = data.discount;
  if (data.notes !== undefined) sanitized.notes = sanitizeString(data.notes);
  if (data.customerId !== undefined) sanitized.customerId = sanitizeString(data.customerId);

  return { valid: errors.length === 0, errors, sanitizedData: sanitized };
}

export function validateExpense(data) {
  const errors = [];
  const sanitized = { ...data };

  sanitized.amount = clampNumber(data.amount, 0);
  if (sanitized.amount <= 0) errors.push('Amount must be greater than 0.');

  sanitized.category = sanitizeString(data.category);
  if (!sanitized.category) errors.push('Category is required.');

  if (!data.date || !isValidDate(data.date)) {
    errors.push('A valid date is required.');
  }

  // Optional
  if (data.description !== undefined) sanitized.description = sanitizeString(data.description);
  if (data.paymentMethod !== undefined) sanitized.paymentMethod = sanitizeString(data.paymentMethod);
  if (data.receiptUrl !== undefined) sanitized.receiptUrl = data.receiptUrl;
  if (data.supplierId !== undefined) sanitized.supplierId = data.supplierId || null;
  if (data.status !== undefined) sanitized.status = data.status;

  return { valid: errors.length === 0, errors, sanitizedData: sanitized };
}

export function validateCredit(data) {
  const errors = [];
  const sanitized = { ...data };

  sanitized.personName = sanitizeString(data.personName || data.customerName || data.name);
  if (!sanitized.personName) errors.push('Person name is required.');

  sanitized.amount = clampNumber(data.amount, 0);
  if (sanitized.amount <= 0) errors.push('Amount must be greater than 0.');

  if (data.type && !['credit', 'due'].includes(data.type)) {
    errors.push('Type must be "credit" or "due".');
  }

  if (data.date && !isValidDate(data.date)) {
    errors.push('A valid date is required.');
  }

  // Optional
  if (data.phone !== undefined) sanitized.phone = sanitizeString(data.phone);
  if (data.notes !== undefined) sanitized.notes = sanitizeString(data.notes);
  if (data.dueDate !== undefined) sanitized.dueDate = data.dueDate;

  return { valid: errors.length === 0, errors, sanitizedData: sanitized };
}

export function validateInvoice(data) {
  const errors = [];
  const sanitized = { ...data };

  // Customer
  const customerName = sanitizeString(data.customerName || data.customer?.name);
  if (!customerName) errors.push('Customer name is required.');
  sanitized.customerName = customerName;

  // Line items
  const items = data.lineItems || data.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('At least one line item is required.');
  } else {
    sanitized.lineItems = items.map((item, i) => {
      const s = { ...item };
      s.name = sanitizeString(item.name || item.description);
      s.quantity = clampNumber(item.quantity || item.qty, 0);
      s.unitPrice = clampNumber(item.unitPrice || item.price, 0);
      s.total = clampNumber(item.total, 0);
      if (s.quantity <= 0) errors.push(`Line item ${i + 1}: quantity must be > 0.`);
      if (s.unitPrice <= 0) errors.push(`Line item ${i + 1}: unit price must be > 0.`);
      return s;
    });
  }

  sanitized.grandTotal = clampNumber(data.grandTotal, 0);
  if (sanitized.grandTotal <= 0) errors.push('Grand total must be greater than 0.');

  // Optional
  if (data.dueDate !== undefined) sanitized.dueDate = data.dueDate;
  if (data.notes !== undefined) sanitized.notes = sanitizeString(data.notes);
  if (data.status !== undefined) sanitized.status = data.status;

  return { valid: errors.length === 0, errors, sanitizedData: sanitized };
}

export function validateSupplier(data) {
  const errors = [];
  const sanitized = { ...data };

  sanitized.name = sanitizeString(data.name);
  if (!sanitized.name) errors.push('Supplier name is required.');

  // Optional
  if (data.phone !== undefined) sanitized.phone = sanitizeString(data.phone);
  if (data.email !== undefined) {
    sanitized.email = sanitizeString(data.email);
    if (sanitized.email && !isValidEmail(sanitized.email)) {
      errors.push('Invalid email format.');
    }
  }
  if (data.address !== undefined) sanitized.address = sanitizeString(data.address);
  if (data.notes !== undefined) sanitized.notes = sanitizeString(data.notes);
  if (data.contactPerson !== undefined) sanitized.contactPerson = sanitizeString(data.contactPerson);
  if (data.paymentTerms !== undefined) sanitized.paymentTerms = sanitizeString(data.paymentTerms);

  return { valid: errors.length === 0, errors, sanitizedData: sanitized };
}

export function validateStaff(data) {
  const errors = [];
  const sanitized = { ...data };

  sanitized.name = sanitizeString(data.name);
  if (!sanitized.name) errors.push('Staff name is required.');

  sanitized.email = sanitizeString(data.email).toLowerCase();
  if (!sanitized.email) errors.push('Email is required.');
  else if (!isValidEmail(sanitized.email)) errors.push('Invalid email format.');

  const validRoles = ['owner', 'admin', 'staff', 'Owner', 'Admin', 'Staff'];
  sanitized.role = sanitizeString(data.role);
  if (!validRoles.includes(sanitized.role)) {
    errors.push('Role must be Owner, Admin, or Staff.');
  }

  // Optional
  if (data.phone !== undefined) sanitized.phone = sanitizeString(data.phone);

  return { valid: errors.length === 0, errors, sanitizedData: sanitized };
}

export function validateBranch(data) {
  const errors = [];
  const sanitized = { ...data };

  sanitized.name = sanitizeString(data.name);
  if (!sanitized.name) errors.push('Branch name is required.');

  // Optional
  if (data.address !== undefined) sanitized.address = sanitizeString(data.address);
  if (data.phone !== undefined) sanitized.phone = sanitizeString(data.phone);
  if (data.managerName !== undefined) sanitized.managerName = sanitizeString(data.managerName);

  return { valid: errors.length === 0, errors, sanitizedData: sanitized };
}

/**
 * Generic passthrough validator for data that doesn't have a specific validator.
 * Sanitizes all string fields but doesn't enforce required fields.
 */
export function validateGeneric(data) {
  const sanitized = { ...data };
  for (const key of Object.keys(sanitized)) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = stripHtml(sanitized[key]).trim();
    }
  }
  return { valid: true, errors: [], sanitizedData: sanitized };
}

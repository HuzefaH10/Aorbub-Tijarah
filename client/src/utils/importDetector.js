export const FIELD_KEYWORDS = {
  productName: ['item', 'items', 'product', 'products', 'name', 'description', 'commodity', 'commodities', 'goods', 'article', 'sku description', 'product name', 'item name'],
  category: ['category', 'categories', 'type', 'types', 'group', 'groups', 'section', 'department', 'class', 'classification'],
  unit: ['unit', 'units', 'uom', 'measure', 'measurement', 'pack', 'packaging', 'size type'],
  price: ['price', 'rate', 'cost', 'amount', 'value', 'mrp', 'selling price', 'unit price', 'rate per unit'],
  quantity: ['quantity', 'qty', 'stock', 'stock qty', 'current stock', 'opening stock', 'on hand', 'available'],
  threshold: ['threshold', 'minimum', 'min stock', 'reorder point', 'reorder level', 'alert level', 'low stock']
};

export const STANDARD_UNITS = {
  pcs: ['pcs', 'piece', 'pieces', 'unit', 'units', 'nos', 'no'],
  kg: ['kg', 'kgs', 'kilogram', 'kilograms'],
  g: ['g', 'gm', 'gram', 'grams'],
  litre: ['l', 'ltr', 'litre', 'liter', 'litres', 'liters'],
  ml: ['ml', 'millilitre', 'milliliter'],
  box: ['box', 'boxes', 'bx'],
  dozen: ['doz', 'dozen', 'dozens'],
  pack: ['pkt', 'pack', 'packet', 'packets'],
  bag: ['bag', 'bags'],
  carton: ['ctn', 'carton', 'cartons']
};

const CATEGORY_SEEDS = {
  Dairy: ['milk', 'yogurt', 'cheese', 'butter', 'cream'],
  Grains: ['rice', 'wheat', 'flour', 'oats', 'barley'],
  Beverages: ['juice', 'water', 'soda', 'drink', 'cola'],
  Snacks: ['chips', 'biscuit', 'cookie', 'wafer', 'cracker'],
  Cleaning: ['soap', 'detergent', 'bleach', 'cleaner', 'mop'],
  'Personal Care': ['shampoo', 'toothpaste', 'lotion', 'cream', 'deodorant'],
  Frozen: ['frozen', 'ice cream', 'popsicle'],
  Produce: ['vegetable', 'fruit', 'tomato', 'potato', 'onion']
};

/**
 * Normalizes a raw unit string against known standards.
 * @param {string} rawUnit
 * @returns {string|null}
 */
export function normalizeUnit(rawUnit) {
  if (!rawUnit) return null;
  const clean = rawUnit.toString().toLowerCase().trim();
  for (const [std, aliases] of Object.entries(STANDARD_UNITS)) {
    if (aliases.includes(clean)) return std;
  }
  return null;
}

/**
 * Detects mapping logic for columns based on headers and sample rows.
 * @param {string[]} headers
 * @param {object[]} sampleRows
 * @returns {object[]} Array of mapping objects
 */
export function detectColumns(headers, sampleRows) {
  const mappings = [];
  const assignedFields = new Set();

  headers.forEach(header => {
    const cleanHeader = header.toString().toLowerCase().trim();
    let mappedTo = 'skip';
    let confidence = 'unknown';
    
    // Extract up to 3 non-empty samples for this column
    const samples = sampleRows
      .map(row => row[header])
      .filter(val => val !== null && val !== undefined && val !== '')
      .slice(0, 3);
    
    // 1. Header Keyword Matching
    let headerMatch = null;
    let headerConf = 'none';

    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      if (keywords.includes(cleanHeader)) {
        headerMatch = field;
        headerConf = 'high';
        break;
      }
      if (keywords.some(k => cleanHeader.includes(k))) {
        headerMatch = field;
        headerConf = 'medium';
      }
    }

    if (headerMatch && !assignedFields.has(headerMatch)) {
      mappedTo = headerMatch;
      confidence = headerConf;
      assignedFields.add(headerMatch);
    } else {
      // 2. Fallback to Sample Data Heuristics if header gives no confident match
      if (samples.length > 0) {
        const allNumbers = samples.every(s => !isNaN(parseFloat(s)));
        const allShortStrings = samples.every(s => typeof s === 'string' && s.length > 0 && s.split(' ').length <= 3);
        const matchesUnit = samples.some(s => normalizeUnit(s) !== null);

        if (matchesUnit && !assignedFields.has('unit')) {
          mappedTo = 'unit';
          confidence = 'low';
          assignedFields.add('unit');
        } else if (allNumbers) {
          if (!assignedFields.has('price') && (cleanHeader.includes('price') || cleanHeader.includes('cost') || cleanHeader.includes('rate'))) {
             mappedTo = 'price'; confidence = 'medium'; assignedFields.add('price');
          } else if (!assignedFields.has('quantity')) {
             mappedTo = 'quantity'; confidence = 'low'; assignedFields.add('quantity');
          }
        } else if (allShortStrings && !assignedFields.has('productName')) {
          mappedTo = 'productName';
          confidence = 'low';
          assignedFields.add('productName');
        }
      }
    }

    mappings.push({
      originalColumn: header,
      mappedTo,
      confidence,
      sampleValues: samples.map(s => s.toString()),
      autoMapped: mappedTo !== 'skip'
    });
  });

  return mappings;
}

/**
 * Groups product names by similarity using predefined seeds and first-word heuristics.
 * @param {string[]} productNames
 * @returns {object[]} Suggested groups { suggestedCategory, products }
 */
export function groupByNameSimilarity(productNames) {
  const groups = {}; // { CategoryName: [product1, product2] }

  productNames.forEach(name => {
    if (!name) return;
    const cleanName = name.trim();
    const lowerName = cleanName.toLowerCase();
    let assigned = false;

    // 1. Try seed keywords
    for (const [category, keywords] of Object.entries(CATEGORY_SEEDS)) {
      if (keywords.some(k => lowerName.includes(k))) {
        if (!groups[category]) groups[category] = [];
        groups[category].push(cleanName);
        assigned = true;
        break;
      }
    }

    // 2. Fallback to first word grouping (if word length > 2)
    if (!assigned) {
      const firstWord = cleanName.split(' ')[0].replace(/[^a-zA-Z]/g, '');
      if (firstWord.length > 2) {
        const fallbackCat = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
        if (!groups[fallbackCat]) groups[fallbackCat] = [];
        groups[fallbackCat].push(cleanName);
      } else {
        if (!groups['Other']) groups['Other'] = [];
        groups['Other'].push(cleanName);
      }
    }
  });

  // Filter out groups with only 1 item to avoid noise, unless it's a seeded category
  const results = [];
  for (const [cat, items] of Object.entries(groups)) {
    if (items.length > 1 || CATEGORY_SEEDS[cat]) {
      results.push({ suggestedCategory: cat, products: items });
    } else {
      // Merge orphans into "Other"
      const otherGroup = results.find(r => r.suggestedCategory === 'Other');
      if (otherGroup) {
        otherGroup.products.push(...items);
      } else {
        results.push({ suggestedCategory: 'Other', products: items });
      }
    }
  }

  return results.filter(r => r.products.length > 0);
}

/**
 * Validates fully mapped import data before processing.
 * @param {object[]} rawRows
 * @param {object} columnMap { colName: fieldKey }
 * @returns {object} { valid, errors, warnings }
 */
export function validateImportData(rawRows, columnMap) {
  const errors = [];
  const warnings = [];
  
  const nameCol = Object.keys(columnMap).find(k => columnMap[k] === 'productName');
  const priceCol = Object.keys(columnMap).find(k => columnMap[k] === 'price');
  const qtyCol = Object.keys(columnMap).find(k => columnMap[k] === 'quantity');

  if (!nameCol) {
    errors.push('Product Name is required. Please map a column to it.');
  }

  if (!priceCol) {
    warnings.push('No Price column mapped. All imported products will default to price 0.');
  }

  if (!qtyCol) {
    warnings.push('No Quantity column mapped. All imported products will default to stock 0.');
  }

  if (nameCol && rawRows.length > 0) {
    const nameSet = new Set();
    let hasDuplicates = false;
    
    for (const row of rawRows) {
      const val = row[nameCol];
      if (val && typeof val === 'string') {
        const cleanVal = val.toLowerCase().trim();
        if (nameSet.has(cleanVal)) {
          hasDuplicates = true;
          break;
        }
        nameSet.add(cleanVal);
      }
    }

    if (hasDuplicates) {
      warnings.push('Duplicate product names detected within the file. Duplicates will be merged or skipped depending on your selected mode.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

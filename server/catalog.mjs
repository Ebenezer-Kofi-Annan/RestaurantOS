export const tables = [1, 2, 3, 4, 5, 6];

export const ingredients = [
  { id: 'chicken', name: 'Marinated chicken', quantity: 5000, unit: 'g', lowAt: 1000 },
  { id: 'wraps', name: 'Flatbread wraps', quantity: 80, unit: 'pcs', lowAt: 15 },
  { id: 'cheese', name: 'Sliced cheese', quantity: 60, unit: 'pcs', lowAt: 10 },
  { id: 'potatoes', name: 'Potatoes', quantity: 7200, unit: 'g', lowAt: 1000 },
  { id: 'lemonade', name: 'House lemonade', quantity: 8200, unit: 'ml', lowAt: 1500 },
  { id: 'paneer', name: 'Paneer', quantity: 3500, unit: 'g', lowAt: 750 },
  { id: 'rice', name: 'Cooked rice', quantity: 6400, unit: 'g', lowAt: 1500 },
  { id: 'espresso', name: 'Espresso beans', quantity: 1250, unit: 'g', lowAt: 300 },
  { id: 'salad', name: 'Salad greens', quantity: 2750, unit: 'g', lowAt: 650 },
];

const cheese = { id: 'extra-cheese', name: 'Extra cheese', price: 5000, recipe: { cheese: 1 } };
const chilli = { id: 'extra-chilli', name: 'Extra chilli', price: 0, recipe: {} };
export const menu = [
  { id: 'chicken-wrap', name: 'Chicken tikka wrap', category: 'Mains', price: 39000, recipe: { chicken: 120, wraps: 1 }, modifiers: [cheese, chilli] },
  { id: 'paneer-wrap', name: 'Paneer masala wrap', category: 'Mains', price: 35000, recipe: { paneer: 120, wraps: 1 }, modifiers: [cheese, chilli] },
  { id: 'rice-bowl', name: 'Tikka rice bowl', category: 'Mains', price: 45000, recipe: { chicken: 140, rice: 220 }, modifiers: [chilli] },
  { id: 'fries', name: 'Masala fries', category: 'Sides', price: 16000, recipe: { potatoes: 180 }, modifiers: [chilli] },
  { id: 'garden-salad', name: 'Garden salad', category: 'Sides', price: 21000, recipe: { salad: 125 }, modifiers: [] },
  { id: 'lemonade', name: 'House lemonade', category: 'Drinks', price: 14000, recipe: { lemonade: 250 }, modifiers: [] },
  { id: 'espresso', name: 'Double espresso', category: 'Drinks', price: 12000, recipe: { espresso: 18 }, modifiers: [] },
];

import type { Product, Ingredient, Supplier, Purchase, Sale, FixedCost, DREEntry } from '../types'

function get<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function set<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// Products
export const getProducts = () => get<Product>('ff_products')
export const saveProduct = (p: Product) => {
  const list = getProducts()
  const idx = list.findIndex(x => x.id === p.id)
  idx >= 0 ? list.splice(idx, 1, p) : list.push(p)
  set('ff_products', list)
}
export const deleteProduct = (id: string) => set('ff_products', getProducts().filter(x => x.id !== id))

// Ingredients
export const getIngredients = () => get<Ingredient>('ff_ingredients')
export const saveIngredient = (i: Ingredient) => {
  const list = getIngredients()
  const idx = list.findIndex(x => x.id === i.id)
  idx >= 0 ? list.splice(idx, 1, i) : list.push(i)
  set('ff_ingredients', list)
}
export const deleteIngredient = (id: string) => set('ff_ingredients', getIngredients().filter(x => x.id !== id))

// Suppliers
export const getSuppliers = () => get<Supplier>('ff_suppliers')
export const saveSupplier = (s: Supplier) => {
  const list = getSuppliers()
  const idx = list.findIndex(x => x.id === s.id)
  idx >= 0 ? list.splice(idx, 1, s) : list.push(s)
  set('ff_suppliers', list)
}
export const deleteSupplier = (id: string) => set('ff_suppliers', getSuppliers().filter(x => x.id !== id))

// Purchases
export const getPurchases = () => get<Purchase>('ff_purchases')
export const savePurchase = (p: Purchase) => {
  const list = getPurchases()
  const idx = list.findIndex(x => x.id === p.id)
  idx >= 0 ? list.splice(idx, 1, p) : list.push(p)
  set('ff_purchases', list)
}
export const deletePurchase = (id: string) => set('ff_purchases', getPurchases().filter(x => x.id !== id))

// Sales
export const getSales = () => get<Sale>('ff_sales')
export const saveSale = (s: Sale) => {
  const list = getSales()
  const idx = list.findIndex(x => x.id === s.id)
  idx >= 0 ? list.splice(idx, 1, s) : list.push(s)
  set('ff_sales', list)
}
export const deleteSale = (id: string) => set('ff_sales', getSales().filter(x => x.id !== id))

// Fixed Costs
export const getFixedCosts = () => get<FixedCost>('ff_fixed_costs')
export const saveFixedCost = (c: FixedCost) => {
  const list = getFixedCosts()
  const idx = list.findIndex(x => x.id === c.id)
  idx >= 0 ? list.splice(idx, 1, c) : list.push(c)
  set('ff_fixed_costs', list)
}
export const deleteFixedCost = (fid: string) => set('ff_fixed_costs', getFixedCosts().filter(x => x.id !== fid))

// DRE Entries
export const getDREEntries = () => get<DREEntry>('ff_dre')
export const saveDREEntry = (e: DREEntry) => {
  const list = getDREEntries()
  const idx = list.findIndex(x => x.month === e.month && x.year === e.year)
  idx >= 0 ? list.splice(idx, 1, e) : list.push(e)
  set('ff_dre', list)
}

export { id }

export interface Product {
  id: string
  name: string
  category: 'macarrao' | 'hamburguer' | 'cachorro_quente' | 'bebida' | 'outro'
  salePrice: number
  ingredients: ProductIngredient[]
  active: boolean
}

export interface ProductIngredient {
  ingredientId: string
  quantity: number
  unit: string
}

export interface Ingredient {
  id: string
  name: string
  unit: string
  currentStock: number
  minStock: number
}

export interface Supplier {
  id: string
  name: string
  contact: string
  notes: string
}

export interface PurchaseItem {
  ingredientId: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
}

export interface Purchase {
  id: string
  supplierId: string
  supplierName: string
  date: string
  items: PurchaseItem[]
  totalValue: number
  notes: string
  estimatedDurationDays?: number
  depletedDate?: string
}

export interface SaleItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Sale {
  id: string
  date: string
  time: string
  items: SaleItem[]
  total: number
  paymentMethod: 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'pix'
  notes: string
}

export interface FixedCost {
  id: string
  name: string
  category: 'aluguel' | 'pro_labore' | 'energia' | 'agua' | 'internet' | 'outro'
  monthlyValue: number
  active: boolean
}

export interface DREEntry {
  month: string
  year: number
  fixedCosts: { costId: string; name: string; value: number }[]
  variableCosts: number
  observations: string
}

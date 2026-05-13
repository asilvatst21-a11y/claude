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
  lastCount?: number
  lastCountDate?: string
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
  expiryDate?: string
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
  orderType?: 'balcao' | 'delivery'
  deliveryFee?: number
  customerId?: string
  customerName?: string
  cashbackUsed?: number
  cashbackEarned?: number
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

export interface Customer {
  id: string
  name: string
  phone: string
  birthday: string
  cashbackBalance: number
  totalSpent: number
  createdAt: string
}

export interface CashbackConfig {
  enabled: boolean
  percentage: number
}

export interface CashExpense {
  id: string
  description: string
  amount: number
  time: string
}

export interface CashSession {
  id: string
  date: string
  openingBalance: number
  closingExpected: number
  closingCounted: number | null
  expenses: CashExpense[]
  status: 'open' | 'closed'
  notes: string
}

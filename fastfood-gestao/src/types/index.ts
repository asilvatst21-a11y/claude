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
  removedIngredients?: Array<{ id: string; name: string }>
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

export interface VariableCost {
  id: string
  name: string
  value: number
  month: string // 'YYYY-MM'
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

// ----- Delivery / Pedido online -----

export interface DeliveryZone {
  id: string
  neighborhood: string
  fee: number
}

export interface DeliveryConfig {
  enabled: boolean
  storeName: string
  whatsapp: string        // número do estabelecimento (só dígitos, com DDD)
  pixKey: string
  pixName: string
  pixCity: string
  zones: DeliveryZone[]
  minOrder: number
  notice: string          // aviso opcional exibido no topo (ex: "Entregamos das 18h às 23h")
}

export interface OnlineOrderAddress {
  street: string
  number: string
  neighborhood: string
  complement?: string
  reference?: string
}

export interface OnlineOrder {
  id: string
  createdAt: string       // ISO
  status: 'pending' | 'accepted'
  customerName: string
  customerPhone: string   // só dígitos
  address: OnlineOrderAddress
  items: SaleItem[]
  subtotal: number
  deliveryFee: number
  total: number
  payment: 'pix' | 'dinheiro' | 'cartao'
  trocoPara?: number      // troco para (pagamento em dinheiro)
  notes?: string
}

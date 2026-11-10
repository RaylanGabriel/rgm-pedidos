/** Cardápio de demonstração (lanches, combos, porções, bebidas, sobremesas) com ilustrações. */
import * as art from "./demo-art"

export interface DemoItem {
  name: string
  description: string
  price: string
  svg: () => string
}
export interface DemoCategory {
  name: string
  /** Mostra os adicionais (bacon, queijo…) para os itens desta categoria */
  extras: boolean
  items: DemoItem[]
}

const COLA = { body: "#b71c1c", band: "#e53935", label: "COLA" }
const GUARANA = { body: "#1b5e20", band: "#2e7d32", label: "GUARANÁ" }

export const DEMO_MENU: DemoCategory[] = [
  {
    name: "Smash Burgers",
    extras: true,
    items: [
      { name: "Smash Clássico", description: "Blend de carne 120g, queijo cheddar, alface, tomate e molho especial", price: "18.90", svg: () => art.burger({ cheese: 1, lettuce: true, tomato: true, sauce: "#f4a261" }) },
      { name: "Smash Bacon", description: "Blend de carne 120g, bacon crocante, queijo cheddar e molho barbecue", price: "21.90", svg: () => art.burger({ cheese: 1, bacon: true, sauce: "#7a2e1a" }) },
      { name: "Smash Duplo", description: "Dois blends de carne 120g, queijo cheddar duplo e cebola caramelizada", price: "27.90", svg: () => art.burger({ patties: 2, cheese: 2, onion: "caramel" }) },
      { name: "Smash Salada", description: "Blend de carne 120g, alface, tomate, picles, cebola roxa e molho ranch", price: "19.90", svg: () => art.burger({ lettuce: true, tomato: true, pickles: true, onion: "red", sauce: "#f1faee" }) },
      { name: "Smash Triplo", description: "Três blends de carne 120g, cheddar triplo e bacon. Para quem tem fome de verdade", price: "34.90", svg: () => art.burger({ patties: 3, cheese: 3, bacon: true }) },
      { name: "Smash Frango Crispy", description: "Filé de frango empanado crocante, queijo, alface e maionese da casa", price: "22.90", svg: () => art.burger({ chicken: true, cheese: 1, lettuce: true, sauce: "#fff3c4" }) },
    ],
  },
  {
    name: "Combos",
    extras: true,
    items: [
      { name: "Combo Clássico", description: "Smash Clássico + batata frita média + refrigerante lata", price: "32.90", svg: () => art.combo({ cheese: 1, lettuce: true, tomato: true }, COLA) },
      { name: "Combo Bacon", description: "Smash Bacon + batata frita média + refrigerante lata", price: "35.90", svg: () => art.combo({ cheese: 1, bacon: true }, GUARANA) },
      { name: "Combo Duplo", description: "Smash Duplo + batata frita média + refrigerante lata", price: "41.90", svg: () => art.combo({ patties: 2, cheese: 2, onion: "caramel" }, COLA) },
    ],
  },
  {
    name: "Porções",
    extras: false,
    items: [
      { name: "Batata Frita", description: "Porção de batata frita crocante com sal (300g)", price: "14.90", svg: () => art.fries() },
      { name: "Batata Cheddar e Bacon", description: "Batata frita coberta com cheddar cremoso e bacon em cubos (350g)", price: "22.90", svg: () => art.fries({ cheddar: true, bacon: true }) },
      { name: "Onion Rings", description: "Anéis de cebola empanados e crocantes, com molho barbecue (250g)", price: "18.90", svg: () => art.onionRings() },
      { name: "Nuggets (10 un.)", description: "Nuggets de frango crocantes com molho à escolha", price: "19.90", svg: () => art.nuggets() },
    ],
  },
  {
    name: "Bebidas",
    extras: false,
    items: [
      { name: "Refrigerante Cola (lata)", description: "Lata 350ml, bem gelada", price: "6.00", svg: () => art.can(COLA.body, COLA.band, COLA.label, ["#ffe0e0", "#ef6f6f"]) },
      { name: "Guaraná (lata)", description: "Lata 350ml, bem gelada", price: "6.00", svg: () => art.can(GUARANA.body, GUARANA.band, GUARANA.label, ["#e3f6dc", "#7cc46a"]) },
      { name: "Suco de Laranja", description: "Natural, feito na hora (500ml)", price: "9.90", svg: () => art.juice("#f8961e", "#ffc971", "#f3722c") },
      { name: "Água Mineral", description: "Garrafa 500ml, com ou sem gás", price: "4.00", svg: () => art.water() },
    ],
  },
  {
    name: "Sobremesas",
    extras: false,
    items: [
      { name: "Milkshake de Morango", description: "Sorvete de baunilha batido com morango e chantilly (400ml)", price: "16.90", svg: () => art.milkshake("#f38aa9", "#fff7f0") },
      { name: "Milkshake de Chocolate", description: "Sorvete de chocolate batido com calda e chantilly (400ml)", price: "16.90", svg: () => art.milkshake("#7b4a2d", "#fff7f0") },
      { name: "Brownie com Sorvete", description: "Brownie de chocolate quentinho com uma bola de sorvete de creme", price: "15.90", svg: () => art.brownie() },
    ],
  },
]

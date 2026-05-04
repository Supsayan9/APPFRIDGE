import type { Product, ProductCategory } from '@appfridge/shared';

interface CategoryRule {
  category: ProductCategory;
  terms: string[];
}

const categoryRules: CategoryRule[] = [
  { category: 'Сири', terms: ['cheese', 'sir', 'сыр', 'сир', 'mozzarella', 'gouda', 'parmesan', 'emmental', 'almette'] },
  { category: 'Соуси', terms: ['sauce', 'sos', 'соус', 'ketchup', 'кетчуп', 'майонез', 'mayonnaise', 'mustard', 'гірчиц', 'horseradish', 'хрін'] },
  { category: 'Молочні продукти', terms: ['milk', 'молоко', 'butter', 'масло', 'cream', 'вершк', 'кефір', 'kefir', 'smetana', 'сметан', 'curd', 'творог'] },
  { category: 'Йогурти та десерти', terms: ['yogurt', 'йогурт', 'pudding', 'пудинг', 'dessert', 'десерт'] },
  { category: "М'ясо", terms: ['meat', 'мяс', "м'яс", 'chicken', 'кур', 'beef', 'ялович', 'pork', 'свин', 'turkey', 'індич'] },
  { category: 'Ковбаси', terms: ['sausage', 'ковбас', 'ham', 'шинка', 'salami', 'салямі', 'bacon', 'бекон'] },
  { category: 'Риба та морепродукти', terms: ['fish', 'риба', 'salmon', 'лосось', 'tuna', 'тунець', 'shrimp', 'кревет', 'herring', 'оселед'] },
  { category: 'Овочі', terms: ['tomato', 'помід', 'cucumber', 'огір', 'potato', 'картоп', 'carrot', 'моркв', 'pepper', 'перець', 'onion', 'цибул', 'garlic', 'часник'] },
  { category: 'Фрукти', terms: ['apple', 'яблу', 'banana', 'банан', 'orange', 'апельс', 'lemon', 'лимон', 'berry', 'ягід', 'grape', 'виноград'] },
  { category: 'Напої', terms: ['juice', 'сік', 'water', 'вода', 'cola', 'напій', 'drink', 'tea', 'чай', 'coffee', 'кава', 'beer', 'пиво'] },
  { category: 'Снеки', terms: ['chips', 'чіпс', 'cracker', 'крекер', 'nuts', 'горіх', 'snack', 'снек', 'popcorn', 'попкорн'] },
  { category: 'Солодощі', terms: ['chocolate', 'шоколад', 'candy', 'цукерк', 'cookie', 'печив', 'cake', 'торт', 'waffle', 'вафл'] },
  { category: 'Крупи та макарони', terms: ['pasta', 'макарон', 'rice', 'рис', 'buckwheat', 'греч', 'oat', 'вівсян', 'grain', 'круп'] },
  { category: 'Хліб та випічка', terms: ['bread', 'хліб', 'bun', 'булк', 'croissant', 'круасан', 'toast', 'тост'] },
  { category: 'Заморожені продукти', terms: ['frozen', 'заморож', 'ice cream', 'морозиво', 'pelmeni', 'пельмен', 'pizza', 'піца'] },
  { category: 'Консерви', terms: ['canned', 'консерв', 'pickled', 'маринован', 'beans', 'квасол', 'corn', 'кукурудз'] },
  { category: 'Приправи', terms: ['spice', 'спец', 'salt', 'сіль', 'pepper', 'перець мелений', 'seasoning', 'приправа'] },
  { category: 'Готові страви', terms: ['ready meal', 'готов', 'salad', 'салат', 'soup', 'суп', 'wrap', 'сендвіч'] }
];

function normalizeText(value?: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferProductCategory(product: Pick<Product, 'name' | 'brand' | 'category'>): ProductCategory {
  const haystack = [product.name, product.brand, product.category].map(normalizeText).join(' ');

  for (const rule of categoryRules) {
    if (rule.terms.some((term) => haystack.includes(term))) {
      return rule.category;
    }
  }

  return 'Інше';
}

export function normalizeProductCategory(product: Pick<Product, 'name' | 'brand' | 'category'>): ProductCategory {
  return inferProductCategory(product);
}

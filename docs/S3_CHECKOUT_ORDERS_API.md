# Sprint 3: checkout ve sipariş API'si (S3-20, S3-21, S3-22)

Bu dal SCRUM-16, 17 ve 18'deki checkout, ödeme ve sipariş geçmişi ekranlarının bağlanacağı backend'i ekler.
Dal `scrum-14` üstüne kurulu, çünkü sepet ve sipariş tabloları orada.

## Uçlar

| Metot | Yol | Kim | Ne yapar |
| --- | --- | --- | --- |
| POST | `/api/checkout` | Giriş yapmış müşteri | Sunucudaki sepeti ödenmiş siparişe çevirir |
| GET | `/api/orders` | Giriş yapmış müşteri | Kendi siparişleri, yeniden eskiye |
| GET | `/api/orders/:id` | Sahibi, product manager, sales manager | Tek sipariş |
| GET | `/api/orders/:id/invoice` | Sahibi, product manager, sales manager | Fatura verisi (ekran ve PDF için) |
| GET | `/api/orders/:id/invoice.pdf` | Sahibi, product manager, sales manager | Sipariş anındaki verilerle PDF fatura indirir |

Başkasının siparişini açan müşteri 404 alır; böylece sipariş numaraları yoklanamaz. Support agent şimdilik 403 alır.

## Checkout isteği

```http
POST /api/checkout
Idempotency-Key: 0b6f9c1e-6f5e-4c8e-9d3a-1f2e3d4c5b6a
Content-Type: application/json

{
  "payment": { "cardNumber": "4242 4242 4242 4242", "cardHolder": "Ayse Yilmaz",
               "expiryMonth": 12, "expiryYear": 2030, "cvc": "123" },
  "deliveryAddress": "İsteğe bağlı; verilmezse profildeki ev adresi",
  "expectedTotalCents": 25998
}
```

- **`Idempotency-Key` zorunlu.** Her ödeme denemesinde `crypto.randomUUID()` ile yeni bir anahtar üret, ama aynı denemeyi tekrar gönderirken (çift tıklama, yanıt kaybı, yenileme) aynı anahtarı kullan. Aynı anahtar ilk sonucu döndürür, ikinci kez ödeme almaz.
- **Tutar sunucuda hesaplanır.** `expectedTotalCents` yalnızca kontrol içindir: ekrandaki toplam eskiyse 409 döner.
- **Sepet sunucudaki sepettir** (`/api/cart`). Checkout'tan önce tarayıcı sepetinin `/api/cart/import` ile aktarılmış olması gerekir.

## Yanıtlar

| Durum | Gövde | Anlamı |
| --- | --- | --- |
| 201 | `{ order, replayed: false }` | Ödeme onaylandı, sipariş `processing` |
| 200 | `{ order, replayed: true }` | Aynı anahtar tekrar geldi, ilk sipariş döndü |
| 400 | `{ error, fields? }` | Boş sepet, eksik anahtar, hatalı kart veya adres |
| 401 / 403 | `{ error }` | Giriş yok / müşteri değil |
| 402 | `{ error, code: "payment_declined", replayed }` | Banka reddetti; stok, sipariş ve sepet değişmedi |
| 409 | `{ error, code: "stock_changed", items: [{ productId, name, requested, available }] }` | Stok yetmiyor veya ürün kaldırılmış |
| 409 | `{ error, code: "price_changed", totalCents }` | Fiyat değişmiş; yeni toplamı göster |
| 503 | `{ error }` | Banka ulaşılamadı; hiçbir şey alınmadı, aynı anahtarla tekrar denenebilir |

`order`:

```json
{
  "id": 1, "status": "processing", "createdAt": "2026-11-27T10:50:16.360Z",
  "customerName": "Ayse Yilmaz", "deliveryAddress": "Orta Mah. 27, Tuzla, Istanbul",
  "totalCents": 25998, "currency": "USD",
  "items": [{ "productId": "p-101", "name": "Studio Headphones", "unitPriceCents": 12999, "quantity": 2, "lineTotalCents": 25998 }],
  "payment": { "status": "completed", "amountCents": 25998, "cardLast4": "4242" }
}
```

`invoice`: `number` (`INV-000001`), `orderId`, `issuedAt`, `customer { name, email }`, `deliveryAddress`, `items`, `totalCents`, `currency`, `payment`.

## Deneme bankası

Luhn ve son kullanma kontrolünden geçen her kart onaylanır. Şu iki numara her seferinde reddedilir:

| Kart | Sonuç |
| --- | --- |
| `4242 4242 4242 4242` | Onay |
| `4000 0000 0000 0002` | `Card declined` |
| `4000 0000 0000 9995` | `Insufficient funds` |

Kart numarası ve CVC hiçbir tabloya yazılmaz, yalnızca son dört hane saklanır (PDF madde 17).

## Nasıl çalışıyor

- **Tek transaction.** Stok kontrolü, banka, stok düşme, sipariş, kalemler, ödeme, sepetin boşalması ve deneme kaydı aynı `IMMEDIATE` transaction içinde. Biri hata verirse hepsi geri alınır.
- **Önce banka.** Banka hiçbir şey yazılmadan önce çağrılır; red gelirse stok ve sipariş hiç değişmez.
- **Son ürün.** Stok `stock >= adet` koşuluyla düşülür, eksiye inemez. Aynı son ürünü iki müşteri aynı anda alamaz.
- **Anlık kopya.** Sipariş satın alma anındaki ürün adını, fiyatını, alıcı adını ve adresi saklar. Katalog veya profil sonradan değişse de geçmiş ve fatura değişmez.

## Veritabanı (migration 5)

- `orders`: `status` (`processing`, `in-transit`, `delivered`), `total_cents`, `customer_name`, `delivery_address`. Eski siparişler `processing` olur.
- `payments`: `card_last4`.
- `checkout_attempts`: `(user_id, idempotency_key)` başına bir sonuç.

**Not:** v5 bu dalda kullanıldı; bir sonraki migration v6 olmalı.

## Kapsam dışında kalanlar

- **S3-23:** durum geçişleri (`processing` → `in-transit` → `delivered`) ve yönetici teslimat listesi. Şimdilik her sipariş `processing` kalır.
- **S3-27:** PDF faturanın e-posta ile gönderimi.
- **S3-28:** değerlendirme kuralı. SCRUM-14'teki kural yalnızca tamamlanmış ödemeye bakıyor, "teslim edildi" şartını henüz aramıyor.

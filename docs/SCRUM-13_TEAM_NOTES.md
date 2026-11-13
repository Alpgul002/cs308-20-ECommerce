# SCRUM-13 ekip notu: login ve ürün backend'i

Bu not `scrum13-backend` dalında nelerin hazır olduğunu ve üstüne iş yaparken nelere uyulacağını anlatır.

## Stack

Değişmedi, hepsi PDF'in önerdiği listeden: **Node.js + Express 5**, **SQLite (better-sqlite3)**, **React + Vite**.

| Konu | Karar | Neden |
| --- | --- | --- |
| Parola | bcrypt, 12 tur (`bcryptjs`) | PDF madde 17. Native derleme istemez, herkesin bilgisayarında kurulur. |
| Oturum | Sunucuda `sessions` tablosu + HttpOnly çerez | Çıkış oturumu gerçekten bitirir. JavaScript token'ı okuyamaz. DB'de token'ın yalnızca SHA-256'sı var. |
| CSRF | `SameSite=Lax` + izinli origin kontrolü | Frontend'in ayrıca token taşıması gerekmez. |
| Roller | `users.role`, kontrol sunucuda | PDF madde 10 ve 17. Rol hiçbir zaman istekten okunmaz. |
| Ürün silme | Soft delete (`deleted_at`) | Sipariş ve iade eski ürünü bulabilmeli, sepetlerdeki ID başka ürüne gitmemeli. |

## Kurulum

```bash
git switch scrum13-backend
npm install
cp backend/.env.example backend/.env
npm run dev
```

`backend/.env` içinde `DEMO_USERS_PASSWORD` değerine 8+ karakterlik bir şifre yaz. Sunucu açılınca bu şifreyle şu hesaplar oluşur:

| E-posta | Rol |
| --- | --- |
| `customer@orbit.test` | `customer` |
| `sales@orbit.test` | `sales_manager` |
| `product@orbit.test` | `product_manager` |
| `support@orbit.test` | `support_agent` |

Telefondan LAN adresiyle deniyorsan adresi `CORS_ORIGIN` listesine ekle. Yoksa giriş yaptıktan sonraki POST ve DELETE istekleri 403 döner.

## API

Bütün hatalar `{ "error": "mesaj", "fields": { "alan": "mesaj" } }` biçiminde gelir; `fields` yalnızca alan hatalarında vardır.
Her yanıtta JSON gövde vardır, çünkü frontend'in `fetchJson` fonksiyonu gövdeyi her zaman parse ediyor.

| Metot | Yol | Yetki | Başarı | Hatalar |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | Herkes | 201 `{ user }`, çerez | 400, 409 e-posta kayıtlı, 429 |
| POST | `/api/auth/login` | Herkes | 200 `{ user }`, çerez | 400, 401, 429 |
| POST | `/api/auth/logout` | Herkes | 200 `{ ok: true }` | |
| GET | `/api/auth/me` | Giriş yapmış | 200 `{ user }` | 401 |
| POST | `/api/products` | `product_manager` | 201 `{ product }` | 400, 401, 403, 409 seri no kayıtlı |
| DELETE | `/api/products/:id` | `product_manager` | 200 `{ deleted: true, id }` | 401, 403, 404 |

`user`: `{ id, name, email, role, homeAddress }`. Parola hash'i ve vergi numarası hiçbir yanıtta yok.

**Kayıt gövdesi:** `name`, `email`, `password` (8+ karakter, en fazla 72 bayt), `taxId` (10-11 rakam), `homeAddress`.

**Ürün gövdesi:**

| Alan | Kural |
| --- | --- |
| `name`, `brand`, `model`, `serialNumber`, `description`, `warrantyStatus`, `distributor` | Zorunlu metin |
| `stock` | Tam sayı, 0 ve üstü |
| `priceCents` | Tam sayı, en az 1 |
| `warrantyMonths` | Tam sayı, 0-120 |
| `categorySlug` | Var olan bir kategori |
| `costCents` | İsteğe bağlı, verilmezse fiyatın %50'si (PDF madde 11) |
| `imageKey` | İsteğe bağlı: `headphones`, `speaker`, `earbuds`, `laptop`, `keyboard`, `mouse`, `watch`, `tablet`, `camera` |
| `accent` | İsteğe bağlı: `violet`, `orange`, `mint`, `blue`, `rose`, `sand` |

## Frontend için

`LoginPage` hazır ama `App.jsx` içindeki `onSubmit` hâlâ "Sign-in is temporarily unavailable" diyor. Bağlamak için:

```jsx
onSubmit={async ({ email, password }) => {
  const { user } = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  setUser(user);
  setLoginOpen(false);
}}
```

- Vite proxy üzerinden çerez kendiliğinden gider. API'yi doğrudan `:4000`'den çağırırsan `credentials: "include"` gerekir.
- Sayfa açılışında `GET /api/auth/me` ile kullanıcıyı al; 401 "giriş yapılmamış" demektir.
- Yanlış şifrede `fetchJson` `Invalid email or password.` hatası fırlatır. `LoginPage`'in bunu gösterecek bir alanı henüz yok.
- Sepet `localStorage`'da durduğu için girişte kaybolmuyor.

## Backend için

```js
import { ROLES } from "./auth.js";
import { HttpError } from "./errors.js";
import { requireAuth, requireRole } from "./middleware.js";

router.post("/", requireRole(ROLES.SALES_MANAGER), (req, res) => {
  if (!valid) throw new HttpError(400, "Please check the highlighted fields.", { price: "..." });
  res.status(201).json({ id: req.user.id });
});
```

- Rolü asla `req.body`'den alma, `req.user` kullan. `req.user` her istekte DB'den okunur.
- Para her yerde integer cent. Ürün ID'si `p-NNN` kalmalı, frontend ve sepet buna bakıyor.
- Yeni route'ları `authRoutes.js` gibi ayrı dosyaya yaz, `app.js`'e yalnızca `app.use` ekle. Böylece çakışma az olur.
- Checkout'ta stoğu transaction içinde koşullu düş (`stock >= ?`). `validateCart` yalnızca fiyat teklifi verir, stok ayırmaz.
- Test: `node:test` + `supertest`. `backend/test-support/helpers.js` içinde `createTestApp`, `signInAsStaff`, `signUpCustomer` var.

**Dokunulmayan işler:** sipariş ve checkout, stok güncelleme, kategori ekleme/silme, sipariş durumu, fatura, yorum ve puan, wish list, iade, destek sohbeti.

## Veritabanı için

Şema yalnızca `backend/src/migrations.js` üzerinden değişir. Sunucu açılınca eksik migration'lar tek transaction içinde uygulanır, sürüm `PRAGMA user_version` ile izlenir. Şu an **v3**.

```js
{
  version: 4,
  name: "orders",
  up(db) {
    db.exec(`CREATE TABLE orders ( ... );`);
  }
}
```

- Merge edilmiş migration değiştirilmez, sona yenisi eklenir.
- İki dal aynı numarayı almasın, aldığın numarayı ekibe söyle.
- DB'n koddan yeniyse sunucu açılmaz ve nedenini yazar: kodu güncelle ya da `backend/data/store.sqlite` dosyasını sil.

| Tablo | Kolonlar |
| --- | --- |
| `categories` | `slug` PK, `name` |
| `products` | `id` PK (`p-NNN`), `category_slug` FK, `name`, `brand`, `model`, `serial_number`, `description`, `stock`, `price_cents`, `cost_cents`, `warranty_months`, `warranty_status`, `distributor`, `popularity`, `image_key`, `accent`, `deleted_at` |
| `users` | `id` PK, `name`, `email` UNIQUE, `tax_id`, `home_address`, `password_hash`, `role`, `created_at` |
| `sessions` | `token_hash` PK, `user_id` FK, `created_at`, `expires_at` (epoch ms) |

- Para `INTEGER` ve adı `_cents` ile biter. Zaman `TEXT` ISO 8601.
- `products` satırı silinmez. Katalog sorguları `deleted_at IS NULL` filtrelesin, sipariş geçmişi filtrelemesin.
- Sipariş kalemine satış anındaki fiyatı kopyala; iade o fiyattan yapılır (PDF madde 16).
- Teslimat listesi alanları PDF madde 12'de: delivery ID, customer ID, product ID, quantity, total price, delivery address, completed.
- Kart ve fatura bilgisi düz metin tutulmaz (PDF madde 17).
- PostgreSQL'e geçiş ekip kararı olmalı: bütün sorgular senkron `better-sqlite3` ile yazılı, geçiş hepsini değiştirir.

## Bilinen sınırlar

Açık konular ve düzeltilen bug'lar [BUG_REPORTS.md](BUG_REPORTS.md) içinde.

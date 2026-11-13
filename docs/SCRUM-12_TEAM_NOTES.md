# SCRUM-12 — Entegrasyon, test ve bug fixing

## Bilet kapsamı

Gönderilen sprint ekranındaki SCRUM-12: “filtreleme, ürün sayfası ve anasayfada front end ve database ile entegrasyon ve tüm bu integrasyonların test ve bug fixingleri”.

Bu teslim, verilen ZIP'lerin karşılaştırılmasıyla oluşturuldu. Ana temel `cs308-20-ECommerce-scrum-14.zip`. Bu sürüm SCRUM-13 backend'ini, SCRUM-15 profil/veritabanı çalışmasını ve mevcut frontend ekranlarını içeriyor. Diğer ZIP'ler ayrıca üstüne kopyalanmadı; eski dosyaları yeni dosyaların üzerine yazmamak için içerikleri karşılaştırıldı. Foundation ve SCRUM-10 dosyalarının bu temelde karşılıkları bulunuyor. Kaynak ZIP'lerde Git geçmişi yok; belge, kişi bazında commit sahipliği iddia etmez.

## Ne eklendi?

| Alan | Önce | SCRUM-12 teslimi |
| --- | --- | --- |
| Filtreleme | İndirilen listenin tarayıcıda süzülmesi | UI → `/api/products` → SQLite; arama, kategori, sıralama, min/max fiyat ve stok birlikte uygulanır |
| Ürün detayı | Karttaki nesnenin kopyası gösterilirdi | `/api/products/:id` ile her açılışta yeni veri; ayrıca Refresh product |
| Adres/yenileme | Seçili ürün ve filtreler React state'inde kaybolurdu | Query string ile doğrudan ürün bağlantısı, yenileme ve browser back desteği |
| Hata yönetimi | Katalog hatası vardı; detay bağımsız yüklenmezdi | Detay için loading/404/bağlantı hatası/retry, HTML proxy hatası ve 10 sn timeout |
| Hızlı filtre değişimi | İstek yarışı için ayrı koruma gerekmiyordu | 250 ms gecikme, eski isteği iptal etme ve eski cevabı ekrana uygulamama |
| Fiyat aralığı | Yok | Ondalıklı fiyatı tam sayı cent'e çevirme; geçersiz ve ters aralığa 400 |
| Hero | Veri yokken sabit fiyatlı yedek ürün vardı | Sadece API'den alınmış ürün/fiyat ve gerçek detay bağlantısı |
| Teslim | Kilit dosyası yok | package-lock, npm ci, test/build/browser CI, kapsam rehberi |

## Senin dosyaların

Bu listede “değişen” dosyaların tamamı SCRUM-12 tarafından sıfırdan yazılmış değildir; eski takım kodu korunup ilgili bölümlere entegrasyon eklenmiştir.

| Dosya | Katkı |
| --- | --- |
| `frontend/src/App.jsx` | Değişen: API tabanlı filtreler, gerçek hero verisi, detay yönlendirmesi, fiyat/stok kontrolleri, sepet uyumluluğu |
| `frontend/src/storefront.js` | Yeni: URL state, filtre query'si, iptal edilebilir veri okuma |
| `frontend/src/ConnectedProductPage.jsx` | Yeni: detay API çağrısı ve loading/error/404/retry |
| `frontend/src/ProductDetailsPage.jsx` | Değişen: güncel ürünü gösterme ve tekrar okuma düğmesi; mevcut tasarım/feedback korunur |
| `frontend/src/api.js` | Değişen: ağ/JSON/timeout hataları, iptal, güncel veri okuma |
| `backend/src/catalogFilters.js` | Yeni: fiyat/stok dahil filtre parametrelerinin doğrulanması |
| `backend/src/catalog.js` | Değişen: parametreli SQL'e fiyat ve stok filtreleri |
| `backend/src/app.js` | Değişen: filtre parser'ı ve katalog/detail cache politikası |
| `frontend/src/styles.css` | Değişen: yeni filtreler ve isteğe bağlı demo işaretleri |
| `frontend/src/Scrum12Scope.jsx`, `frontend/public/scrum12.html` | Yeni: sadece demo bağlantısında kapsam açıklamaları |
| `backend/test/scrum12.integration.test.js` | Yeni: gerçek DB/API entegrasyon regresyonları |
| `frontend/src/api.test.js` | Yeni: ağ, iptal, timeout ve JSON regresyonları |
| `e2e/scrum12.spec.js`, `playwright.config.js`, `scripts/e2e-*` | Yeni: ayrı test DB'si ile gerçek tarayıcı testleri |
| Paket dosyaları, Vite ve CI ayarı | Tekrarlanabilir kurulum/çalıştırma/test desteği |

`frontend/src/catalog.js` ve eski testleri geriye uyumluluk için korunur; ekranın filtreleme kaynağı artık bu yardımcı fonksiyon değildir. Katalog ve kategori verileri açılışta ayrıca okunur; bu tam liste hero ve sepetin ürün eşleştirmesinde kullanılır. Filtre sonucunun ayrı tutulması, başka kategoriye geçince sepetteki ürünün kaybolmasını önler. Ürün sayfasından kataloğa dönüldüğünde liste ve kategori sayıları yeniden okunur.

## Takım sınırı

- SCRUM-10 / mevcut frontend: ürün sayfası taslağı, login ekranı, sepetten ürüne geçiş ve mevcut mağaza tasarımı korunur.
- SCRUM-13: auth, roller ve ürün yönetimi backend'i korunur; bunlar SCRUM-12'nin yeni işi olarak sunulmaz.
- SCRUM-14: kalıcı misafir sepeti, yorum, beğeni, ödeme geçmişi korunur. Bu teslim bunlarla entegrasyonu test eder.
- SCRUM-15: SQLite şeması/migration ve profil korunur. Yeni paralel veritabanı oluşturulmadı; mevcut yapı kullanılır.
- SCRUM-11 ZIP'i ayrıca verilmedi. Bu nedenle görünüm/ilk katalog çalışmalarının kişi bazında sahipliği kesinleştirilemez.
- Checkout, gerçek ödeme ve sipariş oluşturma mevcut temel projede yoktur; bu bilet kapsamında eklenmedi.

## Local çalıştırma

Node.js 24 önerilir; Node 22+ destek aralığıdır. Doğrulama Windows / Node 24.22.1 üzerinde yapıldı.

```sh
npm ci
npm run dev
```

- Mağaza: http://localhost:5173/
- Açıklamalı demo: http://localhost:5173/?scrum12=1
- Demo rehberi: http://localhost:5173/scrum12.html
- Örnek ürün: http://localhost:5173/?scrum12=1&product=p-101
- API: http://localhost:4000/api/health

SQLite ilk açılışta `backend/data/store.sqlite` içinde oluşur. Ayrı veritabanı sunucusu veya `.env` zorunlu değildir. İlk veri seti 9 ürün ve 4 kategoridir. Yerel sepet ve hesap verileri bu dosyada kalır; ZIP/Git'e dahil edilmez.

5173 veya 4000 doluysa ilgili eski uygulamayı kapat. Vite yanlış porta sessizce kaymaz. API portu değiştirilirse `API_PROXY_TARGET` ve backend `CORS_ORIGIN` değerlerini uyumlu ayarla. Standart komutları proje kökünde çalıştır.

## Gösterimde yapacağın işlem sırası

1. Açıklamalı ana sayfayı aç. Mor kutu bu alanın veri bağlantısının senin kapsamın olduğunu belirtir.
2. Audio seç; `wireless` ara; fiyat 70–130; In stock only; Price: low to high. Earbuds ve Headphones gelir.
3. Yenile: aynı filtreler ve sonuçlar kalır.
4. Studio Headphones'ı aç: ID, model, seri no, garanti, distribütör, güncel fiyat/stok gösterilir. Refresh product tekrar veri ister.
5. Tarayıcı geri düğmesiyle dön: Audio filtresi kalır. Reset filters ile temizle.
6. Photography seç: sold-out kamera görünür, ekleme düğmesi kapalıdır. In stock only seçilince boş durum görünür.
7. `?product=p-999` aç: ürün bulunamadı ekranını göster.
8. Sepete ürün ekle; kategori değiştir ve yenile. Sepet korunur.
9. İstersen tarayıcının Network bölümünde `/api/products?...` ve `/api/products/p-101` isteklerini göster.

Sunumda söyleyebileceğin kısa açıklama: “Ben SCRUM-12 kapsamında mevcut ana sayfa, filtre ve ürün ekranlarının backend/veritabanı bağlantısını tamamladım. Filtreler sunucuya gidiyor, ürün detayı güncel veriyi tekrar okuyor. Yenileme, boş sonuç, tükenen/silinmiş ürün, bağlantı hataları ve istek yarışlarını test ettim. Login, veritabanı altyapısı ve sepetin ana uygulaması takım arkadaşlarının işleri; ben bunlarla uyumunu doğruladım.”

## Testleri yeniden çalıştırma

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Hepsi: `npm run check`. Sadece bu biletin yeni testleri: `npm run test:scrum12`.

Tarayıcı testleri 5174 ve 4001 portlarını, geçici ayrı SQLite dosyasını kullanır; local demodaki DB'yi değiştirmez. Test sırasında bir ürün fiyatı/stoku gerçekten DB'de değiştirilir ve ekranın yeni veriyi okuduğu doğrulanır. Test sonrasında bu değerler geri alınır. Ağ hatası ve gecikme senaryoları tarayıcıda kontrollü olarak taklit edilir. Sonuç özeti `TEST_RESULTS.md` dosyasında.

## GitHub'a aktarım

Tam proje ZIP'i tek başına çalıştırılabilir. ZIP'i GitHub'a dosya olarak yüklemek yerine açıp içindeki kaynak dosyaları repository'ye koy. `.github` ve `.gitignore` gibi gizli dosyalar da dahildir.

Takım reposu SCRUM-14 ZIP'iyle aynı durumdaysa, bu teslimdeki `SCRUM12-CHANGES-ONLY.zip` dosyasında yalnız eklenen/değişen kaynaklar bulunur. `SCRUM12.patch` aynı SCRUM-14 tabanına göre üretilmiştir. Takım reposu daha ilerideyse bütün projeyi üstüne kopyalama; dosya farklarını inceleyerek birleştir.

```sh
git switch -c feature/SCRUM-12-integration
# İlgili kaynak dosyalarını mevcut çalışma kopyasına taşı.
npm ci
npm run check
git add .
git commit -m "SCRUM-12 integrate storefront filters and product details with database"
git push -u origin feature/SCRUM-12-integration
```

`node_modules`, `frontend/dist`, SQLite verileri, `.env`, test çıktıları ve local logları commit etme. `.gitignore` bunları dışlar. Bu teslimde remote repo'ya push yapılmadı; dosyalar yüklemeye hazırlandı.

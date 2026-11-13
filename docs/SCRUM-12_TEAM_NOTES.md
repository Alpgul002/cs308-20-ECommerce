# SCRUM-12 — Kapsam ve entegrasyon

## Görev ve ortak temel

Görev: filtreleme, ürün sayfası ve ana sayfanın frontend/backend/veritabanı entegrasyonu, testleri ve hata düzeltmeleri. Bir dalı kimin açtığı görev sahipliğini belirlemez. SCRUM-14 bu görevin parçası değildir.

Git geçmişi: store-foundation → SCRUM-10 → SCRUM-11 → SCRUM-13 → feature/scrum15 → SCRUM-14.

Bu sürümün doğrulanmış ortak temeli `feature/scrum15` dalındaki `ee94b1da8e5066a1a1383b20c9a80e8e8df29658` commit'idir. Önceki mağaza tasarımı, frontend sayfaları, katalog/API/SQLite altyapısı, auth/ürün yönetimi ve profil takımın katkıları olarak korunur. Bunlar SCRUM-12 tarafından yazılmış gibi sunulmaz.

Ana sayfa zaten veritabanından ürün çekiyordu; bu görev onu sıfırdan kurmaz. Mevcut misafir sepeti tarayıcı `localStorage` alanındadır. `/api/cart/validate` güncel stok/fiyatı doğrular; checkout yapmaz. SCRUM-14'e ait sunucuda kalıcı sepet, yorum, beğeni ve ödeme geçmişi bu sürümün bağımlılığı değildir. Bu özelliklerin tamamlanmışlığı/doğruluğu hakkında iddiada bulunulmaz.

## SCRUM-12 katkıları

| Alan | Önce | Sonra |
| --- | --- | --- |
| Arama/kategori/sıralama | Tarayıcı indirilen listeyi süzerdi | Seçimler API'ye gider; SQLite filtreler/sıralar |
| Fiyat ve stok filtreleri | Yok | Min/max fiyat ve stokta olanlar birlikte uygulanır |
| Ürün detayı | Karttaki nesne gösterilirdi | Her açılışta yeni GET; güncel fiyat/stok ve Refresh product |
| Yenileme ve geri gezinme | Seçimler kaybolurdu | Filtre ve ürün query string'de korunur |
| Hata durumları | Detay için ayrı veri akışı yoktu | Loading, 404, bağlantı hatası, tekrar deneme, timeout |
| Hızlı arama | Sunucu isteği yarışı yoktu | 250 ms gecikme, iptal ve eski cevabı uygulamama |
| Hero | Sabit yedek fiyat gösterebilirdi | Gerçek ürün verisi ve detay bağlantısı |
| Test/kurulum | Önceki takım testleri | 40 yeni test, kilit dosyası ve tarayıcı CI |

## Dosyalar

- `frontend/src/App.jsx`: API filtreleri, URL/detail bağlantısı, hero ve hata durumları; mevcut sepet/login/profile akışını koruma.
- `frontend/src/storefront.js`: URL state ve iptal edilebilir istekler.
- `frontend/src/ConnectedProductPage.jsx`: bağımsız detay okuma, loading/error/404/retry.
- `frontend/src/ProductDetailsPage.jsx`: mevcut tasarım üzerinde tekrar okuma düğmesi.
- `frontend/src/api.js`: JSON, ağ, timeout ve iptal yönetimi.
- `backend/src/catalogFilters.js`: filtre doğrulaması, fiyatı tam sayı cent'e çevirme.
- `backend/src/catalog.js`, `backend/src/app.js`: parametreli SQL ve cache politikası.
- `frontend/src/styles.css`: yeni kontroller ve demo işaretleri.
- `frontend/src/Scrum12Scope.jsx`, `frontend/public/scrum12.html`: isteğe bağlı kapsam/demo açıklamaları.
- `backend/test/scrum12.integration.test.js`: 21 API/veritabanı testi.
- `frontend/src/api.test.js`: 7 JSON/ağ/timeout/iptal testi.
- `e2e/scrum12.spec.js`: 12 gerçek tarayıcı senaryosu.
- Paket, Vite, Playwright ve CI ayarları: tekrarlanabilir kurulum/test desteği.

Filtre sonuçları sepetin ürün eşleştirme listesinden ayrıdır; başka kategoriye geçince sepet ürünü kaybolmaz. Detaydan kataloğa dönüşte liste ve kategori sayıları tekrar okunur. Eski `frontend/src/catalog.js` yardımcı fonksiyonu/testleri korunur; aktif ekran filtreleri API'yi kullanır.

## Çalıştırma ve gösterim

Node.js 24 önerilir. Proje kökünde `npm ci`, ardından `npm run dev`.

- Normal mağaza: http://localhost:5173/
- İşaretli demo: http://localhost:5173/?scrum12=1
- Rehber: http://localhost:5173/scrum12.html
- Ürün: http://localhost:5173/?scrum12=1&product=p-101

SQLite ilk açılışta `backend/data/store.sqlite` olarak oluşur. Ayrı sunucu veya `.env` zorunlu değildir. İlk katalog 9 ürün ve 4 kategoridir. Katalog/kullanıcı verisi SQLite'ta, mevcut misafir sepeti tarayıcıda saklanır. SCRUM-14 ile oluşmuş DB daha yeni şema içerir; bu sürüm için ayrı bir DB/çalışma klasörü kullan. Mevcut kullanıcı verisini silme veya eski şemaya zorla dönüştürme.

1. Audio + wireless + 70–130 dolar + In stock only + artan fiyat seç: Earbuds ve Headphones gelir.
2. Yenile: filtreler korunur. Headphones detayını aç, Refresh product ile yeniden oku.
3. Geri dön: filtreler kalır. Reset filters ile temizle.
4. Photography seç: tükenen kamera görünür, ekleme kapalıdır; stok filtresinde boş sonuç gösterilir.
5. `?product=p-999` aç: bulunamadı ekranını göster.
6. Sepete ürün ekle, kategori değiştir ve yenile: tarayıcı sepeti korunur.

## Testler

`npx playwright install chromium` ve `npm run check` çalıştır. Yalnız yeni testler: `npm run test:scrum12`.

Tarayıcı testleri 5174/4001 portlarını ve ayrı geçici SQLite dosyasını kullanır. Demo veritabanına dokunmaz. Fiyat/stok değişimi, silinen ürün, gecikmeli cevap, bağlantı hatası, yenileme, sepet uyumluluğu ve mobil genişlik doğrulanır. Ayrıntılar: `TEST_RESULTS.md`.

## GitHub onarımı ve katkı incelemesi

İlk `scrum-12` commit'i yalnız README içeren `main` üzerine 25 değişiklik dosyası yüklemişti; ortak proje dosyaları eksikti. Onarım, bu kullanıcı commit'ini ve ortak temel commit'inin geçmişini koruyarak yalnız `scrum-12` dalını günceller. Diğer takım dalları değiştirilmez.

Yalnız bu görevin farkını görmek için `feature/scrum15...scrum-12` karşılaştırmasını kullan. `main` henüz önceki takım işlerini içermediği için ona karşı karşılaştırma yalnız SCRUM-12'yi göstermez. Geçmişteki diğer görev commit'leri onların katkılarıdır.

Güncel değişiklik ZIP'i ve patch `feature/scrum15` temelinedir; önceki SCRUM-14 tabanlı paketle karıştırma. `node_modules`, `dist`, `.env`, SQLite ve test çıktıları commit edilmez.

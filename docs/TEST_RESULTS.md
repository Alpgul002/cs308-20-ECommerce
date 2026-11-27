# SCRUM-12 doğrulama raporu

Tarih: 13 Kasım 2026. Ortam: Windows x64, Node.js 24.22.1, npm 10.9.4.

| Kontrol | Sonuç |
| --- | --- |
| Backend (`npm test`) | 209 / 209 geçti |
| Frontend (`npm test`) | 30 / 30 geçti |
| Production build (`npm run build`) | Başarılı |
| Chromium tarayıcı testleri (`npm run test:e2e`) | 12 / 12 geçti |
| Toplam | 251 test geçti |

Bu toplam önceki takım testlerini de içerir. SCRUM-12 için eklenenler: 21 backend entegrasyon testi, 7 frontend API testi ve 12 tarayıcı testi; toplam 40 yeni test.

## Doğrulanan akışlar

- Ana sayfada gerçek API ürünleri, kategori sayıları ve gerçek öne çıkan ürün bağlantısı.
- Kategori + açıklama/isim araması + fiyat aralığı + stok filtresi + sıralamanın birlikte çalışması.
- Dört sıralama seçeneğinde UI sırasının API sonucuyla aynı olması.
- Filtrelerin yenilemede korunması, ürün doğrudan bağlantısı ve browser back.
- Veritabanı fiyat/stok güncellemesinin ürün detayına yansıması; stok sıfırlandığında ekleme düğmesinin kapanması.
- Katalog fiyatının SQLite dosyası kapatılıp yeniden açıldıktan sonra korunması; misafir sepetinin tarayıcı yenilemesinde korunması.
- Silinen ürünün liste/sayılardan çıkması ve detayda 404 dönmesi.
- Boş sonuç ve tükenen ürün davranışı; geçersiz fiyat aralığının açıklanması.
- Sunucu bağlantı/HTML hata yanıtı sonrası katalog ve detay tekrar denemesi.
- Geç gelen eski arama yanıtının yeni sonucu bozmaması.
- Filtre değişimi, detay geçişi ve yenilemede misafir sepetinin korunması.
- 390×844 mobil görünümde katalog ve detayın ekran dışına taşmaması.
- Local demo ekranlarının görsel kontrolü ve yakalanan JavaScript sayfa hatası olmaması.

Tarayıcı testleri demo veritabanından ayrı bir SQLite dosyasıyla çalışır. Ödeme/checkout bu testlerin kapsamında değildir; temel projede uygulanmış değildir. Bu rapor yerel doğrulamayı belirtir. GitHub Actions aynı test/build/tarayıcı akışını scrum-12 push olayında çalıştırır; güncel remote sonuç için Actions/Checks ekranına bak.

Bu sürüm feature/scrum15 temeline taşınmıştır. Önceki 254 toplamındaki 3 SCRUM-14 testi bu görevin kapsamına dahil değildir; SCRUM-12 için 40 yeni test korunur.

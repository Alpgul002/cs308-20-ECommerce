# SCRUM-12 entegrasyon hata kayıtları

| ID | Tetikleyen işlem / önceki durum | Düzeltme | Doğrulama |
| --- | --- | --- | --- |
| S12-01 | Liste açıkken DB fiyat/stok değişir; detay karttaki eski nesneyi gösterirdi | Detay açılışında bağımsız GET, açık detayda Refresh product | DB güncelleyen tarayıcı ve backend testleri |
| S12-02 | Filtre/ürün seçip sayfayı yenilemek seçimi silerdi | Query string state, popstate dinleme | Yenileme, doğrudan link ve browser back testleri |
| S12-03 | Silinmiş ürünün detayını eski listeden açmak eski kart verisini gösterirdi | Detayı API'den iste, 404'ü ayrı ekranda ele al | Soft-delete API testi ve eksik ürün UI testi |
| S12-04 | API JSON yerine HTML/proxy hatası döndürdüğünde JSON ayrıştırma hatası gösterilirdi | Güvenli JSON okuma, anlaşılır hata ve retry | API unit testi, katalog/detail 503 tarayıcı testleri |
| S12-05 | Veri yüklenemese bile hero sabit yedek ürün fiyatı gösterirdi | Sadece başarıyla alınan gerçek ürünün gösterimi | Ana sayfa ve bağlantı hatası tarayıcı testleri |
| S12-06 | Sunucu filtrelerine geçişte eski yavaş cevap yeni sonucu ezebilir | AbortController + aktif istek kontrolü, 250 ms gecikme | Kontrollü gecikmeli yanıt tarayıcı testi |
| S12-07 | Filtrelenmiş sonuç tüm ürün cache'i yerine kullanılırsa başka kategorideki sepet ürünü kaybolabilir | Filtre sonucu ile sepet ürün eşleştirmesini ayrı tut | Filtre sonrası sepet ve sepetten detaya geçiş testi |

S12-06 ve S12-07 entegrasyon sırasında önlenen regresyonlardır; eski istemci filtresi sürümünde aynı istek yarışı mevcut değildi. Önceki takımın `BUG_REPORTS.md` kayıtları değiştirilmeden korunmuştur.
